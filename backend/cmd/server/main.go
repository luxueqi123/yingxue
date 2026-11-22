package main

import (
	"context"
	"errors"
	"fmt"
	"log"
	"log/slog"
	"net"
	"net/http"
	"net/url"
	"os"
	"os/signal"
	"strconv"
	"strings"
	"syscall"
	"time"

	"infinite-canvas/backend/internal/database"
	"infinite-canvas/backend/internal/handler"
	"infinite-canvas/backend/internal/logging"
	"infinite-canvas/backend/internal/repository"
	"infinite-canvas/backend/internal/service"
	"infinite-canvas/backend/internal/updaterclient"

	"github.com/gin-gonic/gin"
)

func main() {
	logConfig, err := logging.ConfigFromEnv()
	if err != nil {
		log.Fatal(err)
	}
	logging.Setup(logConfig)
	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()
	if err := run(ctx); err != nil {
		log.Fatal(err)
	}
}

func run(ctx context.Context) error {
	backgroundWorkersEnabled, err := envBool("CANVAS_BACKGROUND_WORKERS_ENABLED", true)
	if err != nil {
		return err
	}
	dataDir := env("CANVAS_BACKEND_DATA_DIR", "data")
	if err := os.MkdirAll(dataDir, 0o755); err != nil {
		return err
	}
	db, err := database.Open(database.Config{
		Driver:  env("CANVAS_DATABASE_DRIVER", "sqlite"),
		DSN:     os.Getenv("DATABASE_URL"),
		DataDir: dataDir,
	})
	if err != nil {
		return err
	}
	if err := database.ConfigurePool(db); err != nil {
		return err
	}
	sqlDB, err := db.DB()
	if err != nil {
		return err
	}
	defer sqlDB.Close()
	autoMigrate, err := envBool("CANVAS_AUTO_MIGRATE", true)
	if err != nil {
		return err
	}
	if autoMigrate {
		err = database.MigrateSchema(db)
	} else {
		err = database.RequireSchemaVersion(db)
	}
	if err != nil {
		return err
	}

	repo := repository.New(db)
	addr := env("CANVAS_BACKEND_ADDR", ":8080")
	capabilities := service.RuntimeCapabilitiesForDeployment(addr, os.Getenv("CANVAS_DESKTOP_LOCAL_CHANNELS_ENABLED"))
	svc := service.NewWithRuntimeCapabilities(repo, dataDir, capabilities)
	if updaterToken := strings.TrimSpace(os.Getenv("CANVAS_UPDATER_TOKEN")); updaterToken != "" {
		svc.ConfigureUpdateManager(updaterclient.New(env("CANVAS_UPDATER_SOCKET", "/run/open-ai-canvas-updater/updater.sock"), updaterToken))
	}
	defer svc.Close()
	if err := svc.ValidateRuntime(); err != nil {
		return err
	}
	if err := svc.EnsureSystemChannelModels(); err != nil {
		return err
	}
	if err := svc.EnsureDefaultPromptTemplates(); err != nil {
		return err
	}
	if _, err := svc.EnsureBundledEcommerceKnowledge(); err != nil {
		return err
	}
	if err := svc.EnsureBuiltinProjectWorkflowTemplate(); err != nil {
		return err
	}
	if err := svc.EnsureBuiltinSkills(); err != nil {
		return err
	}
	if err := svc.EnsureSkillPackages(); err != nil {
		return err
	}
	if err := svc.EnsureBuiltinPrompts(); err != nil {
		return err
	}
	if err := svc.EnsureBuiltinWorkbenchCatalog(); err != nil {
		log.Fatal(err)
	}
	if err := svc.EnsureBuiltinTools(); err != nil {
		return err
	}
	// Initialize the shipped domains and industry dictionary before accepting
	// requests so a failed upgrade cannot serve an incomplete knowledge catalog.
	if report, err := svc.EnsureBuiltinEcommerceKnowledge(); err != nil {
		return fmt.Errorf("initialize builtin ecommerce knowledge: %w", err)
	} else {
		slog.Info("builtin ecommerce knowledge ready", "shipped", report.Shipped, "inserted", len(report.Inserted), "updated", len(report.Updated), "unchanged", report.Unchanged, "preservedLocal", len(report.PreservedLocal))
	}
	if report, err := svc.EnsureIndustryTaxonomyKnowledge(); err != nil {
		return fmt.Errorf("initialize industry taxonomy knowledge: %w", err)
	} else {
		slog.Info("industry taxonomy ready", "shipped", report.Shipped, "inserted", report.Inserted, "installed", report.AlreadyInstalled)
	}
	if summary, err := svc.MigrateLegacyStorage(); err != nil {
		slog.Warn("storage migration skipped after error", "error", err)
	} else if summary.Backup != "" {
		slog.Info("storage migration completed", "tasks", summary.Tasks, "assets", summary.Assets, "projects", summary.Projects, "backup", summary.Backup)
	}
	r := gin.New()
	// 访问日志：成功的查询类请求只在 debug 级别输出，避免轮询和列表查询把日志打爆。
	r.Use(logging.AccessLog(redactCanvasSharePath), logging.Recovery())
	r.Use(handler.RequestCorrelationMiddleware())
	corsMiddleware, err := cors()
	if err != nil {
		return err
	}
	r.Use(corsMiddleware)
	handler.ConfigureRuntime(svc)
	api := r.Group("/api")
	status := newSystemStatus(db, svc)
	registerSystemStatusRoutes(api, status)
	handler.RegisterOAuthCallbackRoutes(r, svc)
	handler.RegisterCanvasAPI(api, svc)
	r.NoRoute(handler.SystemProxyNoRouteHandler(svc))

	listener, err := net.Listen("tcp", addr)
	if err != nil {
		return err
	}
	workerTimeout, err := envDuration("CANVAS_SHUTDOWN_TIMEOUT", 10*time.Minute)
	if err != nil {
		_ = listener.Close()
		return err
	}
	httpServer := &http.Server{Handler: r, ReadHeaderTimeout: 10 * time.Second}
	workerContext, cancelWorkerStartup := context.WithCancel(ctx)
	defer cancelWorkerStartup()
	workerStartupDone := make(chan struct{})
	if backgroundWorkersEnabled {
		activate := func() {
			go svc.RunMembershipWorker(workerContext)
			svc.StartWorker()
			go svc.BackfillPlaybackTranscodes()
			go svc.BackfillVideoResourceDimensions(workerContext)
		}
		if activationFile := strings.TrimSpace(os.Getenv("CANVAS_WORKER_ACTIVATION_FILE")); activationFile != "" {
			go func() {
				defer close(workerStartupDone)
				if waitForWorkerActivation(workerContext, activationFile) == nil && workerContext.Err() == nil {
					activate()
				}
			}()
		} else {
			activate()
			close(workerStartupDone)
		}
	} else {
		slog.Info("background workers disabled; queued tasks and resource maintenance will not run")
		close(workerStartupDone)
	}
	status.markStarted()
	serveErr := make(chan error, 1)
	go func() { serveErr <- httpServer.Serve(listener) }()
	slog.Info("backend listening", "addr", addr)

	var serveFailure error
	select {
	case <-ctx.Done():
	case err := <-serveErr:
		if err != nil && !errors.Is(err, http.ErrServerClosed) {
			serveFailure = fmt.Errorf("HTTP 服务异常退出：%w", err)
		}
	}

	cancelWorkerStartup()
	<-workerStartupDone
	status.beginDrain()
	var shutdownFailures []error
	if serveFailure != nil {
		shutdownFailures = append(shutdownFailures, serveFailure)
	}
	httpShutdownCtx, httpShutdownCancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer httpShutdownCancel()
	if err := httpServer.Shutdown(httpShutdownCtx); err != nil {
		_ = httpServer.Close()
		shutdownFailures = append(shutdownFailures, fmt.Errorf("关闭 HTTP 服务：%w", err))
	}
	workerCtx, workerCancel := context.WithTimeout(context.Background(), workerTimeout)
	defer workerCancel()
	if err := svc.StopWorker(workerCtx); err != nil {
		shutdownFailures = append(shutdownFailures, fmt.Errorf("等待后台任务退出：%w", err))
	}
	if err := errors.Join(shutdownFailures...); err != nil {
		return err
	}
	slog.Info("backend stopped gracefully")
	return nil
}

func waitForWorkerActivation(ctx context.Context, path string) error {
	ticker := time.NewTicker(time.Second)
	defer ticker.Stop()
	for {
		if err := ctx.Err(); err != nil {
			return err
		}
		if _, err := os.Stat(path); err == nil {
			return nil
		} else if !errors.Is(err, os.ErrNotExist) {
			slog.Error("读取后台任务接手标记失败", "error", err)
			return err
		}
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-ticker.C:
		}
	}
}

func redactCanvasSharePath(path string) string {
	const prefix = "/api/public/canvas-shares/"
	if !strings.HasPrefix(path, prefix) {
		return path
	}
	remainder := strings.TrimPrefix(path, prefix)
	if index := strings.IndexByte(remainder, '/'); index >= 0 {
		return prefix + ":token" + remainder[index:]
	}
	return prefix + ":token"
}

func env(key string, fallback string) string {
	value := os.Getenv(key)
	if value == "" {
		return fallback
	}
	return value
}

func envBool(key string, fallback bool) (bool, error) {
	value := strings.TrimSpace(os.Getenv(key))
	if value == "" {
		return fallback, nil
	}
	parsed, err := strconv.ParseBool(value)
	if err != nil {
		return false, fmt.Errorf("%s 必须是 true 或 false", key)
	}
	return parsed, nil
}

func envDuration(key string, fallback time.Duration) (time.Duration, error) {
	value := strings.TrimSpace(os.Getenv(key))
	if value == "" {
		return fallback, nil
	}
	parsed, err := time.ParseDuration(value)
	if err != nil || parsed <= 0 {
		return 0, fmt.Errorf("%s 必须是正数时长，例如 10m", key)
	}
	return parsed, nil
}

const corsAllowedHeaders = "Accept, Content-Type, Authorization, X-Requested-With, X-Canvas-Scene, X-Idempotency-Key, X-Canvas-Expected-User, X-Canvas-Trace-ID, X-Canvas-Upstream-URL, X-Canvas-Upstream-Format, X-Canvas-Allow-Local-Channel, X-Canvas-Upstream-Base-URL"

const corsAllowedMethods = "GET, POST, PUT, PATCH, DELETE, OPTIONS"

type corsPolicy struct {
	origins  map[string]struct{}
	allowAny bool
}

func cors() (gin.HandlerFunc, error) {
	policy, err := parseCORSPolicy(os.Getenv("CANVAS_CORS_ORIGINS"))
	if err != nil {
		return nil, err
	}
	return func(c *gin.Context) {
		origin := strings.TrimSpace(c.GetHeader("Origin"))
		if origin != "" && !allowedOriginWithPolicy(c, origin, policy) {
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"code": http.StatusForbidden, "data": nil, "msg": "不允许的跨域来源"})
			return
		}
		if origin != "" {
			c.Header("Access-Control-Allow-Origin", origin)
			c.Header("Access-Control-Allow-Credentials", "true")
			c.Header("Vary", "Origin, Access-Control-Request-Method, Access-Control-Request-Headers")
		}
		c.Header("Access-Control-Allow-Headers", corsAllowedHeaders)
		c.Header("Access-Control-Expose-Headers", "X-Request-ID, X-Canvas-Trace-ID, X-Diagnostic-Bundle-ID, X-Diagnostic-Schema-Version")
		c.Header("Access-Control-Allow-Methods", corsAllowedMethods)
		c.Header("Access-Control-Max-Age", "86400")
		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(204)
			return
		}
		c.Next()
	}, nil
}

func allowedOrigin(c *gin.Context, origin string) bool {
	policy, err := parseCORSPolicy(os.Getenv("CANVAS_CORS_ORIGINS"))
	if err != nil {
		return false
	}
	return allowedOriginWithPolicy(c, origin, policy)
}

func parseCORSPolicy(raw string) (corsPolicy, error) {
	policy := corsPolicy{origins: make(map[string]struct{})}
	for _, value := range strings.Split(raw, ",") {
		value = strings.TrimSpace(value)
		if value == "" {
			continue
		}
		if value == "*" {
			policy.allowAny = true
			continue
		}
		normalized, err := normalizeCORSOrigin(value)
		if err != nil {
			return corsPolicy{}, fmt.Errorf("CANVAS_CORS_ORIGINS contains invalid origin %q: %w", value, err)
		}
		policy.origins[normalized] = struct{}{}
	}
	return policy, nil
}

func normalizeCORSOrigin(raw string) (string, error) {
	value := strings.TrimSpace(raw)
	if value == "" {
		return "", fmt.Errorf("origin is empty")
	}
	parsed, err := url.Parse(value)
	if err != nil || parsed.Host == "" || parsed.User != nil || (parsed.Scheme != "http" && parsed.Scheme != "https") {
		return "", fmt.Errorf("origin must be an http or https origin")
	}
	if parsed.Path != "" && parsed.Path != "/" || parsed.RawQuery != "" || parsed.Fragment != "" {
		return "", fmt.Errorf("origin must not contain a path, query, or fragment")
	}
	return strings.ToLower(parsed.Scheme) + "://" + strings.ToLower(parsed.Host), nil
}

func allowedOriginWithPolicy(c *gin.Context, origin string, policy corsPolicy) bool {
	normalizedOrigin, err := normalizeCORSOrigin(origin)
	if err != nil {
		return false
	}
	parsed, err := url.Parse(normalizedOrigin)
	if err != nil {
		return false
	}
	requestHost := c.Request.Host
	if forwardedHost := strings.TrimSpace(c.GetHeader("X-Forwarded-Host")); forwardedHost != "" {
		requestHost = strings.TrimSpace(strings.Split(forwardedHost, ",")[0])
	}
	if strings.EqualFold(parsed.Host, strings.TrimSpace(requestHost)) {
		return true
	}
	if policy.allowAny {
		return true
	}
	if _, ok := policy.origins[normalizedOrigin]; ok {
		return true
	}
	if len(policy.origins) > 0 {
		return false
	}
	host := strings.ToLower(parsed.Hostname())
	return (host == "localhost" || host == "127.0.0.1" || host == "::1") && (parsed.Scheme == "http" || parsed.Scheme == "https")
}
func ensureBuiltinWorkbenchCatalog(svc *service.Service) error {
	return svc.EnsureBuiltinWorkbenchCatalog()
}
