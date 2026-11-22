package handler

import (
	"github.com/gin-gonic/gin"
	"infinite-canvas/backend/internal/service"
	"time"
)

func RegisterCaseReactionRoutes(r *gin.RouterGroup, svc *service.Service) {
	r.GET("/public/cases/:id/reaction", func(c *gin.Context) {
		result, err := svc.CaseReaction(nil, c.Param("id"))
		if err != nil {
			failService(c, err)
			return
		}
		c.Header("Cache-Control", "no-store")
		ok(c, result)
	})
	r.GET("/cases/:id/reaction", func(c *gin.Context) {
		user, err := currentUser(c, svc)
		if err != nil {
			failService(c, err)
			return
		}
		result, err := svc.CaseReaction(user, c.Param("id"))
		if err != nil {
			failService(c, err)
			return
		}
		c.Header("Cache-Control", "no-store")
		ok(c, result)
	})
	for _, method := range []string{"PUT", "DELETE"} {
		r.Handle(method, "/cases/:id/like", func(c *gin.Context) {
			user, err := currentUser(c, svc)
			if err != nil {
				failService(c, err)
				return
			}
			if !enforceRateLimit(c, "case-like:"+user.ID, 60, time.Minute) {
				return
			}
			result, err := svc.SetCaseLiked(user, c.Param("id"), c.Request.Method == "PUT")
			if err != nil {
				failService(c, err)
				return
			}
			ok(c, result)
		})
	}
}
