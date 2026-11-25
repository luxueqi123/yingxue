package handler

import (
	"net/http"
	"strings"

	"infinite-canvas/backend/internal/service"

	"github.com/gin-gonic/gin"
)

var storageReadOnlyExemptPrefixes = []string{
	"/auth/",
	"/payments/",
	"/wallet/",
	"/admin/",
	"/settings/",
	"/diagnostics/",
	"/integrations/feishu/",
	"/model-catalog/",
}

var storageReadOnlyExemptRoutes = map[string]struct{}{
	"/traffic/events":                  {},
	"/assets/batch-delete":             {},
	"/assets/batch":                    {},
	"/resources/access":                {},
	"/announcements/read":              {},
	"/models/available":                {},
	"/models/:id/quote":                {},
	"/ai/models":                       {},
	"/runninghub/workflow-info":        {},
	"/runninghub/app-info":             {},
	"/canvas-projects/:id/edit-lease":  {},
	"/feedbacks":                       {},
	"/feedbacks/attachments":           {},
	"/tasks/:id/cancel":                {},
	"/tasks/:id/query-provider":        {},
	"/tasks/:id/recover-media":         {},
	"/tasks/:id/text-deltas":           {},
	"/tasks/:id/text-replay-complete":  {},
	"/agent/runs/:id/cancel":           {},
	"/agent/conversations/:id/compact": {},
	"/dramas/:id/pause":                {},
	// 导出只读取已有资源，超容量只读时仍允许用户把作品带走。
	"/dramas/:id/episodes/:episodeId/jianying-draft": {},
	"/dramas/:id/asset-package":                      {},
	"/creation-runs/:id/release":                     {},
	"/creation-runs/:id/heartbeat":                   {},
	"/works/:id/withdraw":                            {},
}

func storageReadOnlyExempt(method, fullPath string) bool {
	switch method {
	case http.MethodGet, http.MethodHead, http.MethodOptions, http.MethodDelete:
		return true
	}
	route := strings.TrimPrefix(fullPath, "/api")
	if route == "" {
		return true
	}
	if _, ok := storageReadOnlyExemptRoutes[route]; ok {
		return true
	}
	for _, prefix := range storageReadOnlyExemptPrefixes {
		if strings.HasPrefix(route, prefix) {
			return true
		}
	}
	return false
}

func StorageReadOnlyGuard(svc *service.Service) gin.HandlerFunc {
	return func(c *gin.Context) {
		if storageReadOnlyExempt(c.Request.Method, c.FullPath()) {
			c.Next()
			return
		}
		user, err := currentUser(c, svc)
		if err != nil || user == nil {
			c.Next()
			return
		}
		if err := svc.RequireStorageWritable(user.ID); err != nil {
			failService(c, err)
			c.Abort()
			return
		}
		c.Next()
	}
}
