package handler

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
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

type skillPackageEditHTTPFixture struct {
	router *gin.Engine
	svc    *service.Service
	skill  *service.SkillItem
}

func newSkillPackageEditHTTPFixture(t *testing.T) *skillPackageEditHTTPFixture {
	t.Helper()
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
	if err := db.AutoMigrate(
		&model.User{}, &model.AuthSession{}, &model.UserIdentity{}, &model.Skill{},
		&model.SkillVersion{}, &model.SkillFile{}, &model.UserSkillState{},
	); err != nil {
		t.Fatal(err)
	}

	now := time.Now().UTC()
	for _, userID := range []string{"owner", "stranger"} {
		if err := db.Create(&model.User{ID: userID, Username: userID, Role: model.UserRoleUser, Status: model.UserStatusActive}).Error; err != nil {
			t.Fatal(err)
		}
		if err := db.Create(&model.AuthSession{
			ID: userID + "-session", UserID: userID, TokenHash: auth.HashToken(userID + "-token"), ExpiresAt: now.Add(time.Hour),
		}).Error; err != nil {
			t.Fatal(err)
		}
	}

	svc := service.New(repository.New(db), t.TempDir())
	skill, err := svc.CreateSkill("owner", service.SkillMutationRequest{
		SkillName: "分镜助手", Description: "把剧本拆成镜头", Instruction: "# 分镜助手\n\n把剧本拆成镜头。\n", Tag: "creative",
	})
	if err != nil {
		t.Fatal(err)
	}
	router := gin.New()
	RegisterSkillRoutes(router.Group("/api"), svc)
	return &skillPackageEditHTTPFixture{router: router, svc: svc, skill: skill}
}

func (f *skillPackageEditHTTPFixture) request(t *testing.T, method, path, userID, body string) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(method, path, strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	if userID != "" {
		req.AddCookie(&http.Cookie{Name: service.SessionCookieName, Value: userID + "-session." + userID + "-token"})
	}
	response := httptest.NewRecorder()
	f.router.ServeHTTP(response, req)
	return response
}

func TestSkillPackageEditHTTPEnforcesOwnershipAndOptimisticLock(t *testing.T) {
	f := newSkillPackageEditHTTPFixture(t)
	filesURL := "/api/skills/" + f.skill.SkillID + "/files"

	if response := f.request(t, http.MethodPut, filesURL, "", `{}`); response.Code != http.StatusUnauthorized {
		t.Fatalf("anonymous edit status=%d body=%s", response.Code, response.Body.String())
	}
	if response := f.request(t, http.MethodPut, filesURL, "stranger", `{}`); response.Code != http.StatusForbidden {
		t.Fatalf("non-owner edit status=%d body=%s", response.Code, response.Body.String())
	}

	content := "# 镜头\n"
	editBody, err := json.Marshal(service.SkillPackageEditRequest{
		BaseVersionID: f.skill.VersionID,
		Operations: []service.SkillPackageFileOperation{{
			Op: "write", Path: "references/camera.md", Content: &content,
		}},
	})
	if err != nil {
		t.Fatal(err)
	}
	saved := f.request(t, http.MethodPut, filesURL, "owner", string(editBody))
	if saved.Code != http.StatusOK {
		t.Fatalf("owner edit status=%d body=%s", saved.Code, saved.Body.String())
	}
	var savedPayload struct {
		Data struct {
			Changed bool `json:"changed"`
			Skill   struct {
				VersionID string `json:"versionId"`
			} `json:"skill"`
		} `json:"data"`
	}
	if err := json.Unmarshal(saved.Body.Bytes(), &savedPayload); err != nil {
		t.Fatal(err)
	}
	if !savedPayload.Data.Changed || savedPayload.Data.Skill.VersionID == "" || savedPayload.Data.Skill.VersionID == f.skill.VersionID {
		t.Fatalf("save response did not return a new skill version: %s", saved.Body.String())
	}

	staleBody, err := json.Marshal(service.SkillPackageEditRequest{
		BaseVersionID: f.skill.VersionID,
		Operations: []service.SkillPackageFileOperation{{
			Op: "write", Path: "references/stale.md", Content: &content,
		}},
	})
	if err != nil {
		t.Fatal(err)
	}
	stale := f.request(t, http.MethodPut, filesURL, "owner", string(staleBody))
	if stale.Code != http.StatusConflict || !strings.Contains(stale.Body.String(), `"reason":"skill_version_conflict"`) {
		t.Fatalf("stale edit status=%d body=%s", stale.Code, stale.Body.String())
	}

	listed := f.request(t, http.MethodGet, filesURL, "owner", "")
	if listed.Code != http.StatusOK {
		t.Fatalf("file list status=%d body=%s", listed.Code, listed.Body.String())
	}
	var listPayload struct {
		Data struct {
			Files []struct {
				Path string `json:"path"`
			} `json:"files"`
		} `json:"data"`
	}
	if err := json.Unmarshal(listed.Body.Bytes(), &listPayload); err != nil {
		t.Fatal(err)
	}
	if len(listPayload.Data.Files) != 2 || listPayload.Data.Files[1].Path != "references/camera.md" {
		t.Fatalf("file list did not expose saved file: %s", listed.Body.String())
	}

	fileURL := "/api/skills/" + f.skill.SkillID + "/file?path=" + url.QueryEscape("references/camera.md")
	read := f.request(t, http.MethodGet, fileURL, "owner", "")
	if read.Code != http.StatusOK {
		t.Fatalf("file read status=%d body=%s", read.Code, read.Body.String())
	}
	var filePayload struct {
		Data struct {
			File struct {
				Content string `json:"content"`
			} `json:"file"`
		} `json:"data"`
	}
	if err := json.Unmarshal(read.Body.Bytes(), &filePayload); err != nil {
		t.Fatal(err)
	}
	if filePayload.Data.File.Content != content {
		t.Fatalf("read content=%q, want %q", filePayload.Data.File.Content, content)
	}
}

func TestSkillPackageEditHTTPRejectsOversizedBody(t *testing.T) {
	f := newSkillPackageEditHTTPFixture(t)
	padding := strings.Repeat("x", int(service.SkillPackageEditMaxBytes))
	body := `{"baseVersionId":"` + f.skill.VersionID + `","operations":[{"op":"write","path":"references/too-large.md","content":"must not save"}],"padding":"` + padding + `"}`
	response := f.request(t, http.MethodPut, "/api/skills/"+f.skill.SkillID+"/files", "owner", body)
	if response.Code != http.StatusBadRequest {
		t.Fatalf("oversized edit status=%d body=%s", response.Code, response.Body.String())
	}

	listed := f.request(t, http.MethodGet, "/api/skills/"+f.skill.SkillID+"/files", "owner", "")
	if listed.Code != http.StatusOK {
		t.Fatalf("file list status=%d body=%s", listed.Code, listed.Body.String())
	}
	var payload struct {
		Data struct {
			Files []struct {
				Path string `json:"path"`
			} `json:"files"`
		} `json:"data"`
	}
	if err := json.Unmarshal(listed.Body.Bytes(), &payload); err != nil {
		t.Fatal(err)
	}
	if len(payload.Data.Files) != 1 || payload.Data.Files[0].Path != "SKILL.md" {
		t.Fatalf("oversized request changed skill files: %s", listed.Body.String())
	}
}
