package handler

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"infinite-canvas/backend/internal/auth"
	"infinite-canvas/backend/internal/model"
	"infinite-canvas/backend/internal/repository"
	"infinite-canvas/backend/internal/service"

	"github.com/gin-gonic/gin"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func TestReferralHTTPDisabledDefaultsPermissionsAndExplicitSave(t *testing.T) {
	gin.SetMode(gin.TestMode)
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	if err != nil {
		t.Fatal(err)
	}
	sqlDB, err := db.DB()
	if err != nil {
		t.Fatal(err)
	}
	sqlDB.SetMaxOpenConns(1)
	t.Cleanup(func() { _ = sqlDB.Close() })
	if err := db.AutoMigrate(&model.User{}, &model.AuthSession{}, &model.SystemSetting{}, &model.ReferralProfile{}, &model.ReferralBinding{}, &model.ReferralCommission{}, &model.CreditAccount{}, &model.CreditLedgerEntry{}, &model.AdminAuditEvent{}); err != nil {
		t.Fatal(err)
	}
	for _, role := range []model.UserRole{model.UserRoleAdmin, model.UserRoleUser} {
		id := string(role)
		for _, row := range []any{
			&model.User{ID: id, Username: id, Role: role, Status: model.UserStatusActive},
			&model.AuthSession{ID: id, UserID: id, TokenHash: auth.HashToken("test-token"), ExpiresAt: time.Now().Add(time.Hour)},
		} {
			if err := db.Create(row).Error; err != nil {
				t.Fatal(err)
			}
		}
	}
	svc := service.New(repository.New(db), t.TempDir())
	router := gin.New()
	RegisterReferralRoutes(router.Group("/api"), svc)
	call := func(method, path, body, actor string) *httptest.ResponseRecorder {
		req := httptest.NewRequest(method, "/api"+path, strings.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		if actor != "" {
			req.AddCookie(&http.Cookie{Name: service.SessionCookieName, Value: actor + ".test-token"})
		}
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)
		return w
	}
	for _, tc := range []struct {
		method, path, body, actor string
		status                    int
	}{
		{http.MethodGet, "/referral", "", "", http.StatusUnauthorized},
		{http.MethodGet, "/referral", "", "user", http.StatusForbidden},
		{http.MethodGet, "/referral/invitees", "", "user", http.StatusForbidden},
		{http.MethodGet, "/referral/commissions", "", "user", http.StatusForbidden},
		{http.MethodGet, "/admin/settings/referral", "", "user", http.StatusForbidden},
		{http.MethodPatch, "/admin/settings/referral", `{"enabled":true,"mode":"all","commissionRateBasisPoints":1000}`, "user", http.StatusForbidden},
		{http.MethodGet, "/admin/referral/commissions", "", "user", http.StatusForbidden},
		{http.MethodGet, "/referral/invitees?page=-1", "", "user", http.StatusBadRequest},
	} {
		w := call(tc.method, tc.path, tc.body, tc.actor)
		if w.Code != tc.status {
			t.Fatalf("%s %s as %s: %d %s", tc.method, tc.path, tc.actor, w.Code, w.Body.String())
		}
		var body struct {
			Code int `json:"code"`
		}
		if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil || body.Code == 0 {
			t.Fatalf("failure envelope invalid: %s, %v", w.Body.String(), err)
		}
	}
	w := call(http.MethodGet, "/admin/settings/referral", "", "admin")
	if w.Code != http.StatusOK {
		t.Fatalf("admin default: %d %s", w.Code, w.Body.String())
	}
	var envelope struct {
		Data struct {
			Setting service.ReferralSetting `json:"setting"`
		} `json:"data"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &envelope); err != nil || envelope.Data.Setting.Enabled || envelope.Data.Setting.Mode != "all" || envelope.Data.Setting.CommissionRateBasisPoints != 1000 {
		t.Fatalf("default settings: %s, %v", w.Body.String(), err)
	}
	for _, entity := range []any{&model.SystemSetting{}, &model.ReferralProfile{}, &model.ReferralBinding{}, &model.ReferralCommission{}, &model.CreditAccount{}, &model.CreditLedgerEntry{}} {
		var count int64
		if err := db.Model(entity).Count(&count).Error; err != nil || count != 0 {
			t.Fatalf("closed API wrote %T: %d, %v", entity, count, err)
		}
	}
	w = call(http.MethodPatch, "/admin/settings/referral", `{"enabled":true,"mode":"all","commissionRateBasisPoints":1500}`, "admin")
	if w.Code != http.StatusOK {
		t.Fatalf("isolated explicit save: %d %s", w.Code, w.Body.String())
	}
	w = call(http.MethodGet, "/referral", "", "user")
	if w.Code != http.StatusOK {
		t.Fatalf("isolated enabled overview: %d %s", w.Code, w.Body.String())
	}
	var count int64
	if err := db.Model(&model.ReferralProfile{}).Where("user_id = ?", "user").Count(&count).Error; err != nil || count != 1 {
		t.Fatalf("profile generation missing: %d, %v", count, err)
	}
}
