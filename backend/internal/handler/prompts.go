package handler

import (
	"net/http"
	"strconv"

	"infinite-canvas/backend/internal/service"

	"github.com/gin-gonic/gin"
)

func RegisterPromptRoutes(r *gin.RouterGroup, svc *service.Service) {
	r.GET("/prompts", func(c *gin.Context) {
		user, err := currentUser(c, svc)
		if err != nil {
			failService(c, err)
			return
		}
		page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
		pageSize, _ := strconv.Atoi(c.DefaultQuery("pageSize", c.DefaultQuery("page_size", "24")))
		result, err := svc.Prompts(user.ID, service.PromptListRequest{
			Page: page, PageSize: pageSize, Scope: c.DefaultQuery("scope", "public"), Search: c.Query("search"),
			Tag: c.Query("tag"), Category: c.Query("category"), Mode: c.Query("mode"), Sort: c.DefaultQuery("sort", "popular"),
		})
		if err != nil {
			failService(c, err)
			return
		}
		ok(c, result)
	})

	r.GET("/prompts/:id", func(c *gin.Context) {
		user, err := currentUser(c, svc)
		if err != nil {
			failService(c, err)
			return
		}
		prompt, err := svc.PromptDetail(user.ID, c.Param("id"))
		if err != nil {
			failService(c, err)
			return
		}
		ok(c, gin.H{"prompt": prompt})
	})

	r.POST("/prompts", func(c *gin.Context) {
		user, err := currentUser(c, svc)
		if err != nil {
			failService(c, err)
			return
		}
		c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, 512<<10)
		var req service.PromptMutationRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			failService(c, service.BadAuthRequest("提示词数据格式无效"))
			return
		}
		prompt, err := svc.CreatePrompt(user.ID, req)
		if err != nil {
			failService(c, err)
			return
		}
		ok(c, gin.H{"prompt": prompt})
	})

	r.PUT("/prompts/:id", func(c *gin.Context) {
		user, err := currentUser(c, svc)
		if err != nil {
			failService(c, err)
			return
		}
		c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, 512<<10)
		var req service.PromptMutationRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			failService(c, service.BadAuthRequest("提示词数据格式无效"))
			return
		}
		prompt, err := svc.UpdatePrompt(user.ID, c.Param("id"), req)
		if err != nil {
			failService(c, err)
			return
		}
		ok(c, gin.H{"prompt": prompt})
	})

	r.DELETE("/prompts/:id", func(c *gin.Context) {
		user, err := currentUser(c, svc)
		if err != nil {
			failService(c, err)
			return
		}
		if err := svc.DeletePrompt(user.ID, c.Param("id")); err != nil {
			failService(c, err)
			return
		}
		ok(c, gin.H{"deleted": true})
	})

	r.POST("/prompts/:id/favorite", setPromptFavorite(svc, true))
	r.DELETE("/prompts/:id/favorite", setPromptFavorite(svc, false))
	r.POST("/prompts/:id/use", func(c *gin.Context) {
		user, err := currentUser(c, svc)
		if err != nil {
			failService(c, err)
			return
		}
		prompt, err := svc.UsePrompt(user.ID, c.Param("id"))
		if err != nil {
			failService(c, err)
			return
		}
		ok(c, gin.H{"prompt": prompt})
	})
}

func setPromptFavorite(svc *service.Service, favorite bool) gin.HandlerFunc {
	return func(c *gin.Context) {
		user, err := currentUser(c, svc)
		if err != nil {
			failService(c, err)
			return
		}
		prompt, err := svc.SetPromptFavorite(user.ID, c.Param("id"), favorite)
		if err != nil {
			failService(c, err)
			return
		}
		ok(c, gin.H{"prompt": prompt})
	}
}
