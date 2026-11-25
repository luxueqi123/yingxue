package hostupdate

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"
)

func (m *Manager) rollingEnabled() bool {
	return m.config.NginxUpstreamFile != ""
}

func (m *Manager) slotForPort(port int) (appSlot, error) {
	for i, name := range []string{"blue", "green"} {
		if port != m.config.RolloutPorts[i] {
			continue
		}
		slot := appSlot{Name: name, Port: port}
		data, err := os.ReadFile(filepath.Join(m.slotDir(slot), "release.json"))
		if err != nil {
			return appSlot{}, fmt.Errorf("读取正在对外服务的版本记录：%w", err)
		}
		if err := json.Unmarshal(data, &slot); err != nil || slot.Name != name || slot.Port != port || !IsReleaseVersion(slot.Version) {
			return appSlot{}, errors.New("入口端口与部署版本记录不匹配")
		}
		return slot, nil
	}
	values, err := readEnvFile(m.envPath())
	if err != nil {
		return appSlot{}, err
	}
	basePort := firstNonEmpty(values["CANVAS_HTTP_PORT"], "3000")
	if strconv.Itoa(port) != basePort {
		return appSlot{}, errors.New("Nginx 入口未指向此部署的应用端口")
	}
	version, err := legacyVersionFromEnv(values)
	return appSlot{Name: legacySlot, Version: version, Port: port}, err
}

func (m *Manager) ingress() (appSlot, error) {
	info, err := os.Lstat(m.config.NginxUpstreamFile)
	if err != nil {
		return appSlot{}, err
	}
	if !info.Mode().IsRegular() {
		return appSlot{}, errors.New("Nginx 切流配置必须为独立文件")
	}
	input, err := os.ReadFile(m.config.NginxUpstreamFile)
	if err != nil {
		return appSlot{}, err
	}
	value := strings.TrimSpace(string(input))
	route, ok := strings.CutPrefix(value, "server ")
	if !ok || !strings.HasSuffix(route, ";") {
		return appSlot{}, errors.New("Nginx 切流文件应仅包含一个本机 upstream")
	}
	host, portText, err := net.SplitHostPort(strings.TrimSuffix(route, ";"))
	port, portErr := strconv.Atoi(portText)
	if err != nil || portErr != nil || host != "127.0.0.1" || port <= 0 || port > 65535 {
		return appSlot{}, errors.New("Nginx 切流入口必须是有效的 127.0.0.1 端口")
	}
	return m.slotForPort(port)
}

func (m *Manager) routeTo(slot appSlot) error {
	if err := writeRolloutFile(m.config.NginxUpstreamFile, []byte(fmt.Sprintf("server 127.0.0.1:%d;\n", slot.Port)), 0); err != nil {
		return fmt.Errorf("写入 Nginx 切流配置：%w", err)
	}
	for _, operation := range [][]string{{"-t"}, {"-s", "reload"}} {
		ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
		args := append([]string(nil), operation...)
		if m.config.NginxConfigFile != "" {
			args = append(args, "-c", m.config.NginxConfigFile)
		}
		var stderr bytes.Buffer
		err := m.runner.Run(ctx, "nginx", args, nil, nil, &stderr)
		cancel()
		if err != nil {
			return fmt.Errorf("Nginx %s：%w %s", strings.Join(operation, " "), err, strings.TrimSpace(stderr.String()))
		}
	}
	return nil
}

func (m *Manager) startSlot(slot appSlot) error {
	if slot.Name == legacySlot {
		return m.composeSlot(slot, nil, "start", "yingce-agent", "backend", "web")
	}
	return m.composeSlot(slot, nil, "up", "-d", "--pull", "never", "--wait", "--wait-timeout", "240")
}

func (m *Manager) stopSlot(slot appSlot) error {
	if slot.Name == legacySlot {
		return m.composeSlot(slot, nil, "stop", "web", "backend", "yingce-agent")
	}
	return m.composeSlot(slot, nil, "stop", "slot-web", "slot-backend", "slot-yingce-agent")
}

func (m *Manager) workerActivationPath(slot appSlot) string {
	return filepath.Join(m.slotDir(slot), "activation", "workers")
}

func (m *Manager) clearWorkerActivation(slot appSlot) error {
	if slot.Name == legacySlot {
		return nil
	}
	err := os.Remove(m.workerActivationPath(slot))
	if errors.Is(err, os.ErrNotExist) {
		return nil
	}
	return err
}

func (m *Manager) activateSlot(slot appSlot) error {
	if slot.Name == legacySlot {
		return nil
	}
	return writeRolloutFile(m.workerActivationPath(slot), nil, 0o644)
}

func slotHealthURL(slot appSlot) string {
	return fmt.Sprintf("http://127.0.0.1:%d/api/health/ready", slot.Port)
}

func (m *Manager) waitForConnections(slot appSlot) error {
	ctx, cancel := context.WithTimeout(context.Background(), m.config.StepTimeout)
	defer cancel()
	ticker := time.NewTicker(time.Second)
	defer ticker.Stop()
	for {
		var output bytes.Buffer
		filter := fmt.Sprintf("dst 127.0.0.1 and dport = :%d", slot.Port)
		if err := m.runner.Run(ctx, "ss", []string{"-Htn", "state", "established", filter}, nil, &output, nil); err != nil {
			return fmt.Errorf("检查旧入口的剩余连接：%w", err)
		}
		if len(bytes.TrimSpace(output.Bytes())) == 0 {
			return nil
		}
		select {
		case <-ctx.Done():
			return errors.New("旧版仍有连接，未强行关闭")
		case <-ticker.C:
		}
	}
}

func (m *Manager) runRollingUpdate(fromVersion string, release Release, nextCompose, updaterBinary string, images deploymentImages) {
	active, err := m.ingress()
	if err != nil || active.Version != fromVersion {
		m.failWithoutRollback(PhaseFailed, errors.Join(errors.New("线上入口版本与更新起点不一致"), err))
		return
	}
	slot := appSlot{Name: "blue", Version: release.Version, Port: m.config.RolloutPorts[0]}
	if active.Name == "blue" {
		slot.Name, slot.Port = "green", m.config.RolloutPorts[1]
	}

	m.setPhase(PhasePreflight, "核对线上数据库和新版迁移账本")
	migrate, err := m.checkRollingSchema(nextCompose, release, images)
	if err != nil {
		m.failWithoutRollback(PhaseFailed, fmt.Errorf("新版未通过在线数据库校验，保留现有版本：%w", err))
		return
	}
	if err := m.prepareSlot(nextCompose, images, release, active, slot); err != nil {
		m.failWithoutRollback(PhaseFailed, err)
		return
	}
	m.mu.Lock()
	if m.state.RollbackSlot != nil && m.state.RollbackSlot.Name == slot.Name {
		m.state.RollbackSlot, m.state.RollbackVersion = nil, ""
		_ = m.saveStateLocked()
	}
	m.mu.Unlock()

	m.setPhase(PhaseBackingUp, "网站运行中，创建升级前备份")
	backup, err := m.createBackup(active)
	if err != nil {
		m.failWithoutRollback(PhaseFailed, err)
		return
	}
	abortStartup := func(cause error) {
		stopErr := m.stopSlot(slot)
		if migrate {
			m.setPhase(PhaseRollingBack, "恢复升级前的数据库迁移记录")
			restoreErr := m.restoreArchiveSchema(active.Version)
			if restoreErr == nil {
				restoreErr = m.checkHealthOnce(m.healthURL(), active.Version)
			}
			m.recordRollingRollback(active.Version, cause, errors.Join(stopErr, restoreErr))
			return
		}
		m.failWithoutRollback(PhaseFailed, errors.Join(cause, stopErr))
	}
	if migrate {
		m.mu.Lock()
		m.state.LastBackup = &backup
		_ = m.saveStateLocked()
		m.mu.Unlock()

		m.setPhase(PhaseMigrating, "执行已演练的 Agent 历史归档结构迁移")
		err := m.migrateForRollout(nextCompose, release.Version, images, "up", nil)
		if err == nil {
			err = m.migrateForRollout(nextCompose, release.Version, images, "verify", nil)
		}
		if err != nil {
			abortStartup(err)
			return
		}
	}
	m.setPhase(PhaseWarming, "旧版继续服务，新版独立启动并检查")
	if err := m.startSlot(slot); err != nil {
		abortStartup(err)
		return
	}
	if err := m.verifyHealthyAt(slotHealthURL(slot), slot.Version); err != nil {
		abortStartup(err)
		return
	}
	if err := m.promoteSlot(active, slot); err != nil {
		if migrate {
			m.setPhase(PhaseRollingBack, "检查能否恢复升级前的数据库迁移记录")
			if restoreErr := m.restoreArchiveSchema(active.Version); restoreErr != nil {
				m.recordRollingRollback(active.Version, err, restoreErr)
				return
			}
			if current, ingressErr := m.ingress(); ingressErr == nil && current == active &&
				m.checkHealthOnce(m.healthURL(), active.Version) == nil {
				m.recordRollingRollback(active.Version, err, m.stopSlot(slot))
				return
			}
		}
		m.revertRollingSwitch(active, slot, err)
		return
	}
	m.mu.Lock()
	m.state.LastBackup = &backup
	if migrate {
		// The previous backend cannot restart once the ledger advances.
		m.state.RollbackSlot, m.state.RollbackVersion = nil, ""
		// This candidate's bundled updater predates the rolling migration and slot backup fixes.
		updaterBinary = ""
	} else {
		m.state.RollbackSlot, m.state.RollbackVersion = &active, active.Version
	}
	_ = m.saveStateLocked()
	m.mu.Unlock()
	m.finishUpdate(release.Version, updaterBinary)
}

func (m *Manager) promoteSlot(active, slot appSlot) error {
	m.setPhase(PhaseSwitching, "新版已通过检查，切换 Nginx 流量")
	if err := m.routeTo(slot); err != nil {
		return err
	}
	m.setPhase(PhaseVerifying, "经网站入口核对新版本")
	if err := m.verifyHealthy(slot.Version); err != nil {
		return err
	}
	m.setPhase(PhaseDraining, "新版已对外服务，等待旧连接和任务退出")
	if err := m.waitForConnections(active); err != nil {
		return err
	}
	if err := m.stopSlot(active); err != nil {
		return err
	}
	return m.activateSlot(slot)
}

func (m *Manager) revertRollingSwitch(active, slot appSlot, cause error) {
	m.setPhase(PhaseRollingBack, "切回旧版，保留已写入的业务数据")
	// The target hasn't acquired the background worker role when promotion fails.
	var err error
	if slot.Name == legacySlot {
		err = m.stopSlot(slot)
	}
	if err == nil {
		err = m.startSlot(active)
	}
	if err == nil {
		err = m.routeTo(active)
	}
	if err == nil {
		err = m.verifyHealthy(active.Version)
	}
	if err == nil && slot.Name != legacySlot {
		err = m.stopSlot(slot)
	}
	m.recordRollingRollback(active.Version, cause, err)
}

func (m *Manager) recordRollingRollback(version string, cause, rollbackErr error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	now := time.Now().UTC()
	m.state.Operation.FinishedAt = &now
	m.state.Operation.AutomaticRollback = cause != nil
	if cause != nil {
		m.state.Operation.Error = safeOperationError(cause)
	}
	if rollbackErr != nil {
		m.state.Operation.Phase = PhaseManualIntervention
		m.state.Operation.RollbackError = safeOperationError(rollbackErr)
		m.appendLogLocked(PhaseManualIntervention, "未能完成应用回退")
	} else {
		m.state.Operation.Phase = PhaseRolledBack
		m.appendLogLocked(PhaseRolledBack, "入口已恢复到 "+version)
	}
	_ = m.saveStateLocked()
}

func (m *Manager) runRollingRollback(previous appSlot) {
	active, err := m.ingress()
	if err != nil {
		m.recordRollingRollback(previous.Version, nil, err)
		return
	}
	if previous.Name == legacySlot {
		// The original process has no activation gate. Stop its successor first.
		if err := m.stopSlot(active); err != nil {
			m.revertRollingSwitch(active, previous, err)
			return
		}
	} else if err := m.clearWorkerActivation(previous); err != nil {
		m.recordRollingRollback(previous.Version, nil, err)
		return
	}
	if err := m.startSlot(previous); err != nil {
		m.revertRollingSwitch(active, previous, err)
		return
	}
	if err := m.verifyHealthyAt(slotHealthURL(previous), previous.Version); err != nil {
		m.revertRollingSwitch(active, previous, err)
		return
	}
	if err := m.promoteSlot(active, previous); err != nil {
		m.revertRollingSwitch(active, previous, err)
		return
	}
	m.mu.Lock()
	m.state.RollbackSlot, m.state.RollbackVersion = &active, active.Version
	m.mu.Unlock()
	m.recordRollingRollback(previous.Version, nil, nil)
}
