package handler

import (
	"crypto/sha256"
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"infinite-canvas/backend/internal/service"
)

func registerGoogleAuthRoutes(r *gin.RouterGroup, svc *service.Service) {
	r.GET("/auth/google/start", func(c *gin.Context) {
		c.Header("Cache-Control", "no-store")
		c.Header("Referrer-Policy", "no-referrer")
		if !enforceRateLimit(c, "google-start:"+c.ClientIP(), 20, 10*time.Minute) {
			return
		}
		result, err := svc.BeginGoogleLogin(c.Query("next"), c.Query("acceptedTerms") == "true")
		if err != nil {
			c.Redirect(http.StatusFound, "/login?oauth_error="+url.QueryEscape(err.Error()))
			return
		}
		setGoogleOAuthCookie(c, result.State, result.BrowserToken, 600)
		c.Redirect(http.StatusFound, result.URL)
	})
	r.GET("/auth/google/callback", rejectedLoginAudit(svc, "google"), func(c *gin.Context) {
		c.Header("Cache-Control", "no-store")
		c.Header("Referrer-Policy", "no-referrer")
		if !enforceRateLimit(c, "google-callback:"+c.ClientIP(), 30, 10*time.Minute) {
			return
		}
		state := c.Query("state")
		browserToken, _ := c.Cookie(googleOAuthCookieName(state))
		setGoogleOAuthCookie(c, state, "", -1)
		if c.Query("error") != "" {
			c.Redirect(http.StatusFound, "/login?oauth_error="+url.QueryEscape("Google 授权已取消，请重新选择登录方式"))
			return
		}
		c.Set("login_audit_handled", true)
		result, err := svc.CompleteGoogleLogin(c.Request.Context(), state, browserToken, c.Query("code"), loginRequestContext(c))
		if err != nil {
			c.Redirect(http.StatusFound, "/login?oauth_error="+url.QueryEscape(err.Error()))
			return
		}
		setSessionCookie(c, result.Session.Session, result.Session.MaxAgeSecs)
		c.Redirect(http.StatusFound, result.Next)
	})
}

func googleOAuthCookieName(state string) string {
	sum := sha256.Sum256([]byte(state))
	return fmt.Sprintf("google_oauth_%x", sum[:12])
}

func setGoogleOAuthCookie(c *gin.Context, state, value string, maxAge int) {
	http.SetCookie(c.Writer, &http.Cookie{
		Name: googleOAuthCookieName(state), Value: value, Path: "/api/auth/google/callback", MaxAge: maxAge,
		HttpOnly: true, SameSite: http.SameSiteLaxMode,
		Secure: c.Request.TLS != nil || strings.EqualFold(strings.TrimSpace(c.GetHeader("X-Forwarded-Proto")), "https"),
	})
}

func registerGoogleSettingRoutes(r *gin.RouterGroup, svc *service.Service) {
	r.GET("/admin/settings/google", func(c *gin.Context) {
		user, err := currentUser(c, svc)
		if err != nil {
			failService(c, err)
			return
		}
		setting, err := svc.AdminGoogleSetting(user)
		if err != nil {
			failService(c, err)
			return
		}
		ok(c, gin.H{"setting": setting})
	})
	r.PATCH("/admin/settings/google", func(c *gin.Context) {
		user, err := currentUser(c, svc)
		if err != nil {
			failService(c, err)
			return
		}
		var req service.GoogleSettingRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			fail(c, http.StatusBadRequest, err)
			return
		}
		setting, err := svc.UpdateGoogleSetting(user, req)
		if err != nil {
			failService(c, err)
			return
		}
		ok(c, gin.H{"setting": setting})
	})
}
