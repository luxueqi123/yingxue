package hostupdate

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"testing"
)

func TestYingxueUpdateRequiresManifestForLatestUpstream(t *testing.T) {
	const version = "v2026.11.22-yingxue.1"
	for _, tc := range []struct {
		name     string
		releases string
		covered  string
		ready    bool
	}{
		{"old release", `[{"tag_name":"v2026.9.8-yingxue.28","prerelease":true}]`, "", false},
		{"unverified release", `[{"tag_name":"` + version + `"}]`, "", false},
		{"older upstream", `[{"tag_name":"` + version + `","assets":[{"name":"yingxue-update.json","state":"uploaded"}]}]`, "v1.8.7", false},
		{"verified release", `[{"tag_name":"` + version + `","assets":[{"name":"yingxue-update.json","state":"uploaded"}]}]`, "v1.8.7.1", true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			m := sourceManager(t)
			m.config.Repository = "luxueqi123/yingxue"
			m.config.UpstreamRepository = "ddcat-ai/open-ai-canvas"
			manifest := releaseManifest{Version: version, UpstreamVersion: tc.covered, Revision: strings.Repeat("c", 40), BackendDigest: "sha256:" + strings.Repeat("a", 64), WebDigest: "sha256:" + strings.Repeat("b", 64), AgentDigest: "sha256:" + strings.Repeat("d", 64)}
			manifestBody, err := json.Marshal(manifest)
			if err != nil {
				t.Fatal(err)
			}
			m.httpClient.Transport = sourceTransport(func(r *http.Request) (*http.Response, error) {
				switch r.URL.Path {
				case "/repos/ddcat-ai/open-ai-canvas/releases/latest":
					return sourceResponse(http.StatusOK, `{"tag_name":"v1.8.7.1"}`), nil
				case "/repos/luxueqi123/yingxue/releases":
					return sourceResponse(http.StatusOK, tc.releases), nil
				case "/luxueqi123/yingxue/releases/download/" + version + "/yingxue-update.json":
					return sourceResponse(http.StatusOK, string(manifestBody)), nil
				default:
					return nil, fmt.Errorf("unexpected request: %s", r.URL.Path)
				}
			})
			status, err := m.Check(context.Background())
			if err != nil {
				t.Fatal(err)
			}
			if status.UpstreamVersion != "v1.8.7.1" || status.UpdateAvailable != tc.ready {
				t.Fatalf("unexpected candidate: %+v", status)
			}
			if !tc.ready {
				if status.LatestRelease != nil || status.Operation.Phase != PhaseWaitingRelease {
					t.Fatalf("ineligible release was proposed: %+v", status)
				}
				if _, err := m.StartUpdate(version); err == nil {
					t.Fatal("installation accepted without an eligible release")
				}
				return
			}
			images := status.Sources.releaseImages(status.Repository, *status.LatestRelease)
			if images.backend != "ghcr.io/luxueqi123/open-ai-canvas-backend@"+manifest.BackendDigest {
				t.Fatal(images.backend)
			}
		})
	}
}

func TestVerifyImagesRejectsDigestDifferentFromReleaseManifest(t *testing.T) {
	m := sourceManager(t)
	repository := "ghcr.io/luxueqi123/open-ai-canvas-backend"
	m.runner = sourceRunner(func(_ context.Context, _ string, _ []string, _ []string, out, _ io.Writer) error {
		return json.NewEncoder(out).Encode([]string{repository + "@sha256:" + strings.Repeat("b", 64)})
	})
	if _, err := m.verifyImages(deploymentImages{backend: repository + "@sha256:" + strings.Repeat("a", 64)}); err == nil {
		t.Fatal("image with the wrong pinned digest was accepted")
	}
}
