package protocol

import (
	"context"
	"fmt"
	"strings"
)

func validateManifestUpload(provider ManifestProvider) error {
	u := provider.Upload
	if !signedManifestUpload(u) {
		if err := validateManifestOperation(u.ManifestOperation); err != nil {
			return fmt.Errorf("provider %q upload operation: %w", provider.ID, err)
		}
		if u.ID == nil || len(u.Kinds) == 0 {
			return fmt.Errorf("provider %q upload operation requires kinds and id mapping", provider.ID)
		}
		seen := map[string]bool{}
		for _, kind := range u.Kinds {
			if (kind != "image" && kind != "video" && kind != "audio") || seen[kind] {
				return fmt.Errorf("provider %q upload kind %q is unsupported or duplicated", provider.ID, kind)
			}
			seen[kind] = true
		}
		return nil
	}
	if u.Method != "" || u.Path != "" || u.PathTemplate != nil || len(u.Kinds) > 0 || u.ID != nil {
		return fmt.Errorf("provider %q cannot mix media pre-upload and signed upload recovery", provider.ID)
	}
	if provider.Poll == nil || len(provider.Capabilities) != 1 || provider.Capabilities[0] != CapabilityVideo {
		return fmt.Errorf("signed upload requires a video provider with polling")
	}
	if u.CreateURLsPath == "" || u.PendingURLsPath == "" || u.StatusPath == "" || len(u.ReceivedStatuses) == 0 || len(u.PendingStatuses) == 0 {
		return fmt.Errorf("signed upload requires response paths and explicit recovery states")
	}
	seen := map[string]bool{}
	for _, status := range append(append([]string(nil), u.ReceivedStatuses...), u.PendingStatuses...) {
		if status == "" || status != strings.ToLower(strings.TrimSpace(status)) || seen[status] {
			return fmt.Errorf("upload recovery states must be nonempty, lowercase and disjoint")
		}
		seen[status] = true
	}
	return nil
}

func signedManifestUpload(upload *ManifestUpload) bool {
	return upload != nil && (upload.CreateURLsPath != "" || upload.PendingURLsPath != "" || upload.StatusPath != "" || len(upload.ReceivedStatuses) > 0 || len(upload.PendingStatuses) > 0)
}

func declarativeAdapter(manifest Manifest) Adapter {
	base := manifestAdapter{manifest: manifest}
	if signedManifestUpload(manifest.Upload) {
		return manifestUploadAdapter{manifestAdapter: base}
	}
	return base
}

type manifestUploadAdapter struct{ manifestAdapter }

func uploadURLFromPayload(payload map[string]any, path string) (string, error) {
	items, ok := pathValue(payload, path).([]any)
	if !ok || len(items) != 1 {
		return "", fmt.Errorf("single-video upload requires one signed URL")
	}
	value, ok := items[0].(string)
	if !ok || strings.TrimSpace(value) == "" {
		return "", fmt.Errorf("signed upload URL is missing")
	}
	return value, nil
}

func (a manifestUploadAdapter) BuildUploads(_ context.Context, c RequestContext, body []byte) ([]VideoUpload, error) {
	if len(c.Request.Videos) != 1 {
		return nil, fmt.Errorf("signed upload requires one source video")
	}
	payload, err := decodeObject(body)
	if err != nil {
		return nil, err
	}
	target, err := uploadURLFromPayload(payload, a.manifest.Upload.CreateURLsPath)
	if err != nil {
		return nil, err
	}
	return []VideoUpload{{URL: target, VideoIndex: 0}}, nil
}

func (a manifestUploadAdapter) ParseUploadedVideos(_ context.Context, _ PollContext, body []byte) (int, error) {
	payload, err := decodeObject(body)
	if err != nil {
		return 0, err
	}
	u := a.manifest.Upload
	status := strings.ToLower(firstPathValue(payload, u.StatusPath))
	for _, received := range u.ReceivedStatuses {
		if status == received {
			return 1, nil
		}
	}
	for _, pending := range u.PendingStatuses {
		if status == pending {
			_, err := uploadURLFromPayload(payload, u.PendingURLsPath)
			return 0, err
		}
	}
	return 0, fmt.Errorf("provider has not confirmed source upload state")
}

func (a manifestUploadAdapter) RecoverUploads(ctx context.Context, c PollContext, body []byte) ([]VideoUpload, error) {
	if len(c.Request.Videos) != 1 {
		return nil, fmt.Errorf("upload recovery requires one source video")
	}
	accepted, err := a.ParseUploadedVideos(ctx, c, body)
	if err != nil {
		return nil, err
	}
	if accepted == 1 {
		return []VideoUpload{{VideoIndex: 0}}, nil
	}
	payload, err := decodeObject(body)
	if err != nil {
		return nil, err
	}
	target, err := uploadURLFromPayload(payload, a.manifest.Upload.PendingURLsPath)
	if err != nil {
		return nil, err
	}
	return []VideoUpload{{URL: target, VideoIndex: 0}}, nil
}
