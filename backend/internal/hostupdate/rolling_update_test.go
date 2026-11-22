package hostupdate

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"sync/atomic"
	"testing"
	"time"
)

func TestBuildSlotComposeIsolatesApplicationAndKeepsStorage(t *testing.T) {
	normalized := `{
	  "networks":{"default":{"name":"live_default"}},
	  "volumes":{"backend-data":{"name":"live_backend-data"},"web-data":{"name":"live_web-data"}},
	  "services":{
	    "postgres":{"image":"postgres:17-alpine"},
	    "redis":{"image":"redis:7.4-alpine"},
	    "migrate":{"environment":{"DATABASE_URL":"postgres://test@postgres/db"}},
	    "backend":{"networks":{"default":null},"environment":{"DATABASE_URL":"postgres://test@postgres/db","REDIS_URL":"redis://redis:6379/0","CANVAS_AUTO_MIGRATE":"false","CANVAS_DATABASE_DRIVER":"postgres","YINGCE_AGENT_URL":"http://yingce-agent:8081"},"volumes":[{"type":"volume","source":"backend-data","target":"/data"}]},
	    "web":{"networks":{"default":null},"ports":[{"published":"3000"}],"volumes":[{"type":"volume","source":"web-data","target":"/usr/share/nginx/html"}]},
	    "yingce-agent":{"networks":{"default":null}}
	  }
	}`
	var base, target rolloutCompose
	for _, project := range []*rolloutCompose{&base, &target} {
		if err := json.Unmarshal([]byte(normalized), project); err != nil {
			t.Fatal(err)
		}
	}
	current := appSlot{Name: legacySlot, Version: "v1.0.0", Port: 3000}
	candidate := appSlot{Name: "blue", Version: "v1.0.1", Port: 13001}
	project, err := buildSlotCompose(base, target, candidate, current, strings.Repeat("a", 40), t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	if len(project.Services) != 3 || !project.Volumes["backend-data"].External || project.Volumes["web-data"].Name != "live_web-data" {
		t.Fatal("the candidate must reuse the storage and contain only its application services")
	}
	if project.Services["slot-web"]["ports"].([]string)[0] != "127.0.0.1:13001:3000" ||
		composeEnvironment(project.Services["slot-backend"])["CANVAS_WORKER_ACTIVATION_FILE"] != workerMount+"/workers" ||
		composeEnvironment(project.Services["slot-backend"])["YINGCE_AGENT_URL"] != "http://slot-yingce-agent:8081" ||
		composeEnvironment(project.Services["slot-web"])["CANVAS_WEB_ROLLOUT_PREVIOUS"] != legacySlot {
		t.Fatal("unexpected candidate routing or activation")
	}
	target.Services["postgres"]["image"] = "postgres:18-alpine"
	if _, err := buildSlotCompose(base, target, candidate, current, "", t.TempDir()); err == nil {
		t.Fatal("the candidate must not replace the database service")
	}
}

func TestRollingUpdateLeavesOldSiteWhenMigrationCheckFails(t *testing.T) {
	manager := sourceManager(t)
	manager.config.NginxUpstreamFile = filepath.Join(t.TempDir(), "upstream.conf")
	manager.config.RolloutPorts = [2]int{13001, 13002}
	before := "server 127.0.0.1:3000;\n"
	if err := os.WriteFile(manager.config.NginxUpstreamFile, []byte(before), 0o600); err != nil {
		t.Fatal(err)
	}
	calls := 0
	manager.runner = sourceRunner(func(_ context.Context, name string, args, _ []string, _, _ io.Writer) error {
		calls++
		if name != "docker" || !strings.HasSuffix(strings.Join(args, " "), "run --rm --no-deps -T migrate verify") {
			t.Errorf("unexpected operation before verifying the ledger: %s %v", name, args)
		}
		return errors.New("migration mismatch")
	})
	manager.runRollingUpdate("v1.0.0", Release{Version: "v1.0.1"}, manager.composePath(), "", deploymentImages{})
	data, err := os.ReadFile(manager.config.NginxUpstreamFile)
	if err != nil || string(data) != before || calls != 1 || manager.Snapshot().Operation.Phase != PhaseFailed {
		t.Fatalf("incompatible update disturbed the existing deployment: %q %d %v", data, calls, err)
	}
}

func TestRollingRollbackPreservesDatabase(t *testing.T) {
	manager := sourceManager(t)
	manager.config.NginxUpstreamFile = filepath.Join(t.TempDir(), "upstream.conf")
	manager.config.StableWindow = time.Millisecond
	ready := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = io.WriteString(w, `{"code":0,"data":{"ready":true,"build":{"version":"1.0.0"}}}`)
	}))
	defer ready.Close()
	manager.config.HealthURL = ready.URL
	var commands []string
	manager.runner = sourceRunner(func(_ context.Context, name string, args, _ []string, _, _ io.Writer) error {
		commands = append(commands, name+" "+strings.Join(args, " "))
		return nil
	})
	active := appSlot{Name: legacySlot, Version: "v1.0.0", Port: 3000}
	candidate := appSlot{Name: "blue", Version: "v1.0.1", Port: 13001}
	manager.revertRollingSwitch(active, candidate, errors.New("target failed verification"))
	route, err := os.ReadFile(manager.config.NginxUpstreamFile)
	if err != nil || strings.TrimSpace(string(route)) != "server 127.0.0.1:3000;" || manager.Snapshot().Operation.Phase != PhaseRolledBack {
		t.Fatalf("ingress did not roll back: %q %v", route, err)
	}
	if len(commands) != 4 || !strings.Contains(commands[0], " start yingce-agent backend web") ||
		commands[1] != "nginx -t" || commands[2] != "nginx -s reload" ||
		!strings.HasSuffix(commands[3], " stop slot-web slot-backend slot-yingce-agent") {
		t.Fatalf("rollback should redirect traffic and stop the failed application only: %v", commands)
	}
}

func TestRollingDockerCutover(t *testing.T) {
	dir := os.Getenv("CANVAS_TEST_ROLLOUT_DIR")
	if dir == "" {
		t.Skip("requires disposable Docker and Nginx deployment")
	}
	baseEnv, err := readEnvFile(filepath.Join(dir, ".env"))
	if err != nil || baseEnv["POSTGRES_DB"] != "canvas_rollout" || !strings.HasPrefix(filepath.Base(dir), "yx-cutover-") {
		t.Fatal("the integration test requires an isolated rollout deployment")
	}
	manager, err := NewManager(Config{
		InstallDir: dir, BackupDir: filepath.Join(dir, "backups"), StateDir: filepath.Join(dir, "state"),
		Repository: "luxueqi123/yingxue", UpstreamRepository: "ddcat-ai/open-ai-canvas",
		NginxUpstreamFile: filepath.Join(dir, "upstream.conf"), NginxConfigFile: filepath.Join(dir, "nginx.conf"),
		HealthURL: "http://127.0.0.1:28100/api/health/ready", RolloutPorts: [2]int{28102, 28103},
		StableWindow: 500 * time.Millisecond, StepTimeout: 2 * time.Minute,
	})
	if err != nil {
		t.Fatal(err)
	}
	from, err := manager.currentVersion()
	if err != nil {
		t.Fatal(err)
	}
	if err := manager.verifyHealthy(from); err != nil {
		t.Fatal(err)
	}
	target := Release{Version: "v1.8.7-yingxue.rolloutqa", Manifest: &releaseManifest{Revision: strings.Repeat("a", 40), RollingProtocol: 1}}
	images := deploymentImages{backend: os.Getenv("CANVAS_TEST_ROLLOUT_BACKEND"), web: os.Getenv("CANVAS_TEST_ROLLOUT_WEB"), agent: baseEnv["CANVAS_YINGCE_AGENT_IMAGE"]}
	if images.backend == "" || images.web == "" {
		t.Fatal("missing isolated candidate images")
	}
	ctx, cancel := context.WithCancel(context.Background())
	closed := make(chan struct{})
	var requests, failures atomic.Int64
	go func() {
		defer close(closed)
		client := &http.Client{Timeout: 3 * time.Second}
		for ctx.Err() == nil {
			probe := manager.healthURL()
			if requests.Add(1)%2 == 0 {
				probe = "http://127.0.0.1:28100/"
			}
			response, err := client.Get(probe)
			if err != nil {
				failures.Add(1)
			} else {
				if response.StatusCode != http.StatusOK {
					failures.Add(1)
				}
				_, _ = io.Copy(io.Discard, response.Body)
				response.Body.Close()
			}
			time.Sleep(50 * time.Millisecond)
		}
	}()
	manager.runRollingUpdate(from, target, manager.composePath(), "", images)
	cancel()
	<-closed
	status := manager.Snapshot()
	t.Logf("requests during release: %d; errors: %d; phase: %s", requests.Load(), failures.Load(), status.Operation.Phase)
	for _, entry := range status.Operation.Logs {
		t.Logf("%s %s", entry.Phase, entry.Message)
	}
	if requests.Load() < 10 || failures.Load() != 0 || status.CurrentVersion != target.Version || status.Operation.Phase != PhaseSucceeded {
		t.Fatalf("unexpected deployment result: %s %s", status.Operation.Error, status.Operation.RollbackError)
	}
	current, err := manager.ingress()
	if err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(manager.workerActivationPath(current)); err != nil {
		t.Fatal(err)
	}
	response, err := http.Get("http://127.0.0.1:28100/")
	if err != nil {
		t.Fatal(err)
	}
	html, err := io.ReadAll(response.Body)
	response.Body.Close()
	if err != nil || response.StatusCode != http.StatusOK || !bytes.Contains(html, []byte("isolated-rollout-candidate")) {
		t.Fatal("public frontend is not the candidate's published index")
	}
	var output bytes.Buffer
	if err := manager.compose(manager.composePath(), from, time.Minute, &output, "exec", "-T", "postgres", "psql", "-XAt", "-U", "canvas_rollout", "-d", "canvas_rollout", "-c", "select id from rollout_fixture"); err != nil || strings.TrimSpace(output.String()) != "kept" {
		t.Fatalf("shared database verification failed: %v %s", err, output.String())
	}
}
