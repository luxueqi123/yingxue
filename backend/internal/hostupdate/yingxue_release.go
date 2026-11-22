package hostupdate

import (
	"context"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"strings"
)

const releaseManifestAsset = "yingxue-update.json"

type releaseManifest struct {
	Version         string `json:"version"`
	UpstreamVersion string `json:"upstreamVersion"`
	Revision        string `json:"revision"`
	BackendDigest   string `json:"backendDigest"`
	WebDigest       string `json:"webDigest"`
	AgentDigest     string `json:"agentDigest"`
	RollingProtocol int    `json:"rollingProtocol,omitempty"`
}

func (manifest *releaseManifest) validFor(version string) bool {
	return manifest != nil &&
		manifest.Version == version &&
		IsReleaseVersion(manifest.UpstreamVersion) &&
		validHex(manifest.Revision, 20) &&
		validDigest(manifest.BackendDigest) &&
		validDigest(manifest.WebDigest) &&
		validDigest(manifest.AgentDigest)
}

func validHex(value string, size int) bool {
	if len(value) != size*2 {
		return false
	}
	_, err := hex.DecodeString(value)
	return err == nil && value == strings.ToLower(value)
}

func validDigest(digest string) bool {
	value, found := strings.CutPrefix(digest, "sha256:")
	return found && validHex(value, 32)
}

func (m *Manager) canInstall(release Release) bool {
	if m.rollingEnabled() && (release.Manifest == nil || release.Manifest.RollingProtocol != 1) {
		return false
	}
	return m.config.UpstreamRepository == "" ||
		(!release.Prerelease && release.Manifest.validFor(release.Version) && release.Manifest.UpstreamVersion == m.state.UpstreamVersion)
}

func (m *Manager) updateCandidate(ctx context.Context, sources Sources) (string, *Release, error) {
	if m.config.UpstreamRepository == "" {
		release, err := m.latestRelease(ctx, sources)
		return "", release, err
	}
	url := "https://api.github.com/repos/" + m.config.UpstreamRepository + "/releases/latest"
	var upstream githubRelease
	if err := m.readReleaseJSON(ctx, url, sources, &upstream); err != nil {
		return "", nil, fmt.Errorf("检查影策上游版本：%w", err)
	}
	if upstream.Draft || upstream.Prerelease || !IsReleaseVersion(upstream.TagName) {
		return "", nil, errors.New("影策上游未返回有效的稳定版本")
	}
	release, err := m.latestRelease(ctx, sources)
	if err != nil {
		return upstream.TagName, nil, err
	}
	if release != nil && (release.Manifest.UpstreamVersion != upstream.TagName || (m.rollingEnabled() && release.Manifest.RollingProtocol != 1)) {
		release = nil
	}
	return upstream.TagName, release, nil
}

func (m *Manager) readReleaseJSON(ctx context.Context, url string, sources Sources, value any) error {
	response, err := m.githubGet(ctx, url, sources, "application/vnd.github+json")
	if err != nil {
		return err
	}
	defer response.Body.Close()
	return json.NewDecoder(io.LimitReader(response.Body, maxReleaseResponseBytes)).Decode(value)
}

func (s Sources) releaseImages(repository string, release Release) deploymentImages {
	images := s.images(repository, release.Version)
	if release.Manifest == nil {
		return images
	}
	pin := func(tagged, digest string) string {
		repository, _, _ := strings.Cut(tagged, ":")
		return repository + "@" + digest
	}
	return deploymentImages{
		backend: pin(images.backend, release.Manifest.BackendDigest),
		web:     pin(images.web, release.Manifest.WebDigest),
		agent:   pin(images.agent, release.Manifest.AgentDigest),
	}
}
