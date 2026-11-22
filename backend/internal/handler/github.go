package handler

import (
	"crypto/sha256"
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"infinite-canvas/backend/internal/kernel"
	"infinite-canvas/backend/internal/service"
)

func registerGitHubAuthRoutes(r *gin.RouterGroup, svc *service.Service) {
	r.GET("/auth/profile/github", func(c *gin.Context) {
		c.Header("Cache-Control", "no-store")
		actor, err := currentUser(c, svc)
		if err != nil {
			failService(c, err)
			return
		}
		cookie, _ := c.Cookie(service.SessionCookieName)
		account, err := svc.GitHubAccount(actor, cookie)
		if err != nil {
			failService(c, err)
			return
		}
		ok(c, account)
	})
	r.POST("/auth/profile/github/start", func(c *gin.Context) {
		c.Header("Cache-Control", "no-store")
		if c.GetHeader("Sec-Fetch-Site") == "cross-site" || c.ContentType() != "application/json" {
			failService(c, kernel.Forbidden("请从本站个人信息页面发起 GitHub 绑定"))
			return
		}
		actor, err := currentUser(c, svc)
		if err != nil {
			failService(c, err)
			return
		}
		if !enforceRateLimit(c, "github-link:"+actor.ID, 10, 10*time.Minute) {
			return
		}
		var req struct {
			Confirmed bool `json:"confirmed"`
		}
		if err := c.ShouldBindJSON(&req); err != nil || !req.Confirmed {
			failService(c, kernel.BadAuthRequest("请确认绑定 GitHub"))
			return
		}
		cookie, _ := c.Cookie(service.SessionCookieName)
		result, err := svc.BeginGitHubBinding(actor, cookie)
		if err != nil {
			failService(c, err)
			return
		}
		setGitHubOAuthCookie(c, result.State, result.BrowserToken, 600)
		ok(c, gin.H{"url": result.URL})
	})
	r.GET("/auth/github/start", func(c *gin.Context) {
		c.Header("Cache-Control", "no-store")
		c.Header("Referrer-Policy", "no-referrer")
		if !enforceRateLimit(c, "github-start:"+c.ClientIP(), 20, 10*time.Minute) {
			return
		}
		result, err := svc.BeginGitHubLogin(c.Query("next"), c.Query("acceptedTerms") == "true")
		if err != nil {
			c.Redirect(http.StatusFound, "/login?oauth_error="+url.QueryEscape(err.Error()))
			return
		}
		setGitHubOAuthCookie(c, result.State, result.BrowserToken, 600)
		c.Redirect(http.StatusFound, result.URL)
	})
	r.GET("/auth/github/callback", rejectedLoginAudit(svc, "github"), func(c *gin.Context) {
		c.Header("Cache-Control", "no-store")
		c.Header("Referrer-Policy", "no-referrer")
		if !enforceRateLimit(c, "github-callback:"+c.ClientIP(), 30, 10*time.Minute) {
			return
		}
		state := c.Query("state")
		browserToken, _ := c.Cookie(githubOAuthCookieName(state))
		setGitHubOAuthCookie(c, state, "", -1)
		if strings.HasPrefix(state, "link.") {
			c.Set("login_audit_handled", true)
			if c.Query("error") != "" {
				c.Redirect(http.StatusFound, "/settings?section=profile&github=cancelled")
				return
			}
			cookie, _ := c.Cookie(service.SessionCookieName)
			if err := svc.CompleteGitHubBinding(c.Request.Context(), state, browserToken, c.Query("code"), cookie); err != nil {
				c.Redirect(http.StatusFound, "/settings?section=profile&github=error&githubError="+url.QueryEscape(err.Error()))
				return
			}
			c.Redirect(http.StatusFound, "/settings?section=profile&github=linked")
			return
		}
		if c.Query("error") != "" {
			c.Redirect(http.StatusFound, "/login?oauth_error="+url.QueryEscape("GitHub 授权已取消，请重新选择登录方式"))
			return
		}
		c.Set("login_audit_handled", true)
		result, err := svc.CompleteGitHubLogin(c.Request.Context(), state, browserToken, c.Query("code"), loginRequestContext(c))
		if err != nil {
			c.Redirect(http.StatusFound, "/login?oauth_error="+url.QueryEscape(err.Error()))
			return
		}
		setSessionCookie(c, result.Session.Session, result.Session.MaxAgeSecs)
		c.Redirect(http.StatusFound, result.Next)
	})
}

func githubOAuthCookieName(state string) string {
	sum := sha256.Sum256([]byte(state))
	return fmt.Sprintf("github_oauth_%x", sum[:12])
}

func setGitHubOAuthCookie(c *gin.Context, state, value string, maxAge int) {
	http.SetCookie(c.Writer, &http.Cookie{
		Name: githubOAuthCookieName(state), Value: value, Path: "/api/auth/github/callback", MaxAge: maxAge,
		HttpOnly: true, SameSite: http.SameSiteLaxMode,
		Secure: c.Request.TLS != nil || strings.EqualFold(strings.TrimSpace(c.GetHeader("X-Forwarded-Proto")), "https"),
	})
}

func registerGitHubSettingRoutes(r *gin.RouterGroup, svc *service.Service) {
	r.GET("/admin/settings/github", func(c *gin.Context) {
		user, err := currentUser(c, svc)
		if err != nil {
			failService(c, err)
			return
		}
		setting, err := svc.AdminGitHubSetting(user)
		if err != nil {
			failService(c, err)
			return
		}
		ok(c, gin.H{"setting": setting})
	})
	r.PATCH("/admin/settings/github", func(c *gin.Context) {
		user, err := currentUser(c, svc)
		if err != nil {
			failService(c, err)
			return
		}
		var req service.GitHubSettingRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			fail(c, http.StatusBadRequest, err)
			return
		}
		setting, err := svc.UpdateGitHubSetting(user, req)
		if err != nil {
			failService(c, err)
			return
		}
		ok(c, gin.H{"setting": setting})
	})
}
