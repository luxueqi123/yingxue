package hostupdate

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"time"
)

const (
	legacySlot  = "legacy"
	workerMount = "/run/canvas-rollout"
)

type appSlot struct {
	Name    string `json:"name"`
	Version string `json:"version"`
	Port    int    `json:"port"`
}

type composeResource struct {
	Name     string `json:"name,omitempty"`
	External bool   `json:"external,omitempty"`
}

type rolloutCompose struct {
	Services map[string]map[string]any  `json:"services"`
	Networks map[string]composeResource `json:"networks"`
	Volumes  map[string]composeResource `json:"volumes,omitempty"`
}

func (m *Manager) readCompose(path, version string, images deploymentImages) (rolloutCompose, error) {
	var output bytes.Buffer
	if err := m.composeWithImages(path, version, images, time.Minute, &output, "config", "--format", "json"); err != nil {
		return rolloutCompose{}, err
	}
	var project rolloutCompose
	if err := json.Unmarshal(output.Bytes(), &project); err != nil {
		return rolloutCompose{}, errors.New("读取 Compose 拓扑失败")
	}
	return project, nil
}

func buildSlotCompose(base, target rolloutCompose, slot, active appSlot, revision, workerDir string) (rolloutCompose, error) {
	network := base.Networks["default"].Name
	if network == "" || len(base.Networks) != 1 || len(target.Networks) != 1 || target.Networks["default"].Name != network {
		return rolloutCompose{}, errors.New("在线切换要求沿用原 PostgreSQL 和 Redis 网络")
	}
	for _, name := range []string{"postgres", "redis"} {
		if base.Services[name] == nil || !reflect.DeepEqual(base.Services[name], target.Services[name]) {
			return rolloutCompose{}, fmt.Errorf("%s 配置有变更，需要维护窗口", name)
		}
	}
	project := rolloutCompose{
		Services: make(map[string]map[string]any),
		Networks: map[string]composeResource{"app": {}, "storage": {Name: network, External: true}},
		Volumes:  make(map[string]composeResource),
	}
	for _, name := range []string{"backend", "web", "yingce-agent"} {
		source := target.Services[name]
		old := base.Services[name]
		networks, _ := source["networks"].(map[string]any)
		_, hasDefault := networks["default"]
		if source == nil || old == nil || len(networks) != 1 || !hasDefault || source["container_name"] != nil || source["network_mode"] != nil {
			return rolloutCompose{}, fmt.Errorf("%s 的部署拓扑不支持在线切换", name)
		}
		if !reflect.DeepEqual(old["volumes"], source["volumes"]) {
			return rolloutCompose{}, fmt.Errorf("%s 的挂载有变更，需要维护窗口", name)
		}
		volumes, _ := source["volumes"].([]any)
		for _, value := range volumes {
			mount, ok := value.(map[string]any)
			if !ok {
				return rolloutCompose{}, errors.New("无法识别服务的存储挂载")
			}
			if mount["type"] == "volume" {
				key, _ := mount["source"].(string)
				resource := base.Volumes[key]
				if resource.Name == "" || target.Volumes[key].Name != resource.Name {
					return rolloutCompose{}, fmt.Errorf("%s 的数据卷有变更，需要维护窗口", name)
				}
				project.Volumes[key] = composeResource{Name: resource.Name, External: true}
			}
		}

		service := make(map[string]any, len(source))
		for key, value := range source {
			service[key] = value
		}
		delete(service, "depends_on")
		delete(service, "ports")
		localNetwork := map[string]any{"aliases": []string{name}}
		networks = map[string]any{"app": localNetwork}
		service["networks"] = networks
		environment := make(map[string]any)
		for key, value := range composeEnvironment(source) {
			environment[key] = value
		}
		switch name {
		case "backend":
			oldEnv := composeEnvironment(old)
			for _, key := range []string{"DATABASE_URL", "REDIS_URL"} {
				if environment[key] == nil || environment[key] != oldEnv[key] {
					return rolloutCompose{}, errors.New("数据库或 Redis 的部署连接发生变更，需要维护窗口")
				}
			}
			if environment["CANVAS_DATABASE_DRIVER"] != "postgres" || environment["CANVAS_AUTO_MIGRATE"] != "false" ||
				environment["DATABASE_URL"] != composeEnvironment(target.Services["migrate"])["DATABASE_URL"] {
				return rolloutCompose{}, errors.New("在线切换需要在同一 PostgreSQL 上完成只读迁移校验")
			}
			if environment["YINGCE_AGENT_URL"] != "http://yingce-agent:8081" {
				return rolloutCompose{}, errors.New("在线切换需要使用应用版本自己的 Agent 容器")
			}
			networks["storage"] = map[string]any{}
			environment["YINGCE_AGENT_URL"] = "http://slot-yingce-agent:8081"
			environment["YINGCE_AGENT_BRIDGE_HOST"] = "slot-backend"
			environment["CANVAS_WORKER_ACTIVATION_FILE"] = workerMount + "/workers"
			service["volumes"] = append(append([]any(nil), volumes...), map[string]any{
				"type": "bind", "source": workerDir, "target": workerMount, "read_only": true,
			})
			service["depends_on"] = map[string]any{"slot-yingce-agent": map[string]string{"condition": "service_healthy"}}
		case "web":
			environment["CANVAS_WEB_ROLLOUT_SLOT"] = slot.Name
			environment["CANVAS_WEB_ROLLOUT_PREVIOUS"] = active.Name
			environment["CANVAS_WEB_ROLLOUT_REVISION"] = revision
			service["ports"] = []string{fmt.Sprintf("127.0.0.1:%d:3000", slot.Port)}
			service["depends_on"] = map[string]any{"slot-backend": map[string]string{"condition": "service_healthy"}}
		}
		service["environment"] = environment
		project.Services["slot-"+name] = service
	}
	return project, nil
}

func composeEnvironment(service map[string]any) map[string]any {
	environment, _ := service["environment"].(map[string]any)
	return environment
}

func (m *Manager) slotDir(slot appSlot) string {
	return filepath.Join(m.config.StateDir, "rollout", slot.Name)
}

func (m *Manager) composeSlot(slot appSlot, output io.Writer, arguments ...string) error {
	if slot.Name == legacySlot {
		return m.compose(m.composePath(), slot.Version, m.config.StepTimeout, output, arguments...)
	}
	ctx, cancel := context.WithTimeout(context.Background(), m.config.StepTimeout)
	defer cancel()
	args := []string{"compose", "--project-name", composeProjectName(m.config.InstallDir) + "-" + slot.Name, "--project-directory", m.config.InstallDir,
		"-f", filepath.Join(m.slotDir(slot), "compose.json")}
	var stderr bytes.Buffer
	if err := m.runner.Run(ctx, "docker", append(args, arguments...), nil, output, &stderr); err != nil {
		if detail := strings.TrimSpace(stderr.String()); detail != "" {
			err = errors.New(detail)
		}
		return fmt.Errorf("Compose %s %s：%s", slot.Name, arguments[0], safeOperationError(err))
	}
	return nil
}

func (m *Manager) prepareSlot(nextCompose string, images deploymentImages, release Release, active, slot appSlot) error {
	base, err := m.readCompose(m.composePath(), active.Version, deploymentImages{})
	if err != nil {
		return err
	}
	target, err := m.readCompose(nextCompose, release.Version, images)
	if err != nil {
		return err
	}
	dir := m.slotDir(slot)
	workerDir := filepath.Join(dir, "activation")
	project, err := buildSlotCompose(base, target, slot, active, release.Manifest.Revision, workerDir)
	if err != nil {
		return err
	}
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return err
	}
	if err := os.MkdirAll(workerDir, 0o755); err != nil {
		return err
	}
	if _, err := os.Stat(filepath.Join(dir, "compose.json")); err == nil {
		// The two names are reserved for updater-managed application projects.
		if err := m.composeSlot(slot, nil, "down"); err != nil {
			return err
		}
	} else if !errors.Is(err, os.ErrNotExist) {
		return err
	}
	if err := m.clearWorkerActivation(slot); err != nil {
		return err
	}
	contents, err := json.MarshalIndent(project, "", "  ")
	if err != nil {
		return err
	}
	// Compose interpolates even the JSON it exports; keep resolved literals.
	if err := writeRolloutFile(filepath.Join(dir, "compose.json"), []byte(strings.ReplaceAll(string(contents), "$", "$$")), 0o600); err != nil {
		return err
	}
	metadata, err := json.Marshal(slot)
	if err != nil {
		return err
	}
	return writeRolloutFile(filepath.Join(dir, "release.json"), metadata, 0o600)
}
