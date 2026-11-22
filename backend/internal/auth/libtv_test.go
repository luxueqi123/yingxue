package auth

import (
	"encoding/json"
	"strings"
	"testing"
)

func TestLibTVLocalImportRequiresCanvasIdentity(t *testing.T) {
	svc := &Service{}
	if _, err := svc.ImportLibTVJSON("", "canvas-1", nil); err == nil {
		t.Fatal("local JSON import must reject an unauthenticated user")
	}
	if _, err := svc.ImportLibTVJSON("owner", " ", nil); err == nil {
		t.Fatal("local JSON import must reject a missing target canvas")
	}
}

func TestLibTVRawNodeAcceptsObjectData(t *testing.T) {
	var detail libTVDetail
	err := json.Unmarshal([]byte(`{"projectMeta":{"uuid":"292a69d540774a9ab9872d8337c9fd0b"},"nodeList":[{"nodeKey":"image-1","data":{"type":"image","url":["https://example.com/image.png"],"params":{"prompt":"original prompt"}},"position":{"positionX":"12","positionY":"34"}}],"connectionList":[]}`), &detail)
	if err != nil {
		t.Fatalf("decode object node data: %v", err)
	}
	result, err := adaptLibTVDetail(&detail)
	if err != nil {
		t.Fatalf("adapt object node data: %v", err)
	}
	if len(result.Nodes) != 1 || result.Nodes[0].Prompt != "original prompt" {
		t.Fatalf("object node content was lost: %#v", result.Nodes)
	}
}

func TestLibTVLocalJSONPreservesSanitizedSourceSnapshot(t *testing.T) {
	raw := []byte(`{"code":0,"token":"envelope-secret","data":{"projectMeta":{"uuid":"292a69d540774a9ab9872d8337c9fd0b","name":"source"},"nodeList":[{"nodeKey":"image-1","data":{"type":"image","url":["https://example.com/first.png?token=url-secret","https://example.com/second.png"],"params":{"prompt":"original","seed":9007199254740993,"apiKey":"param-secret"}},"position":{"positionX":"12","positionY":"34"}},{"nodeKey":"text-1","data":"{\"type\":\"text\",\"params\":{\"prompt\":\"keep this text\",\"access_token\":\"nested-secret\"}}","position":{"positionX":"0","positionY":"1"}}],"connectionList":[{"connectionId":"edge-1","source":"text-1","target":"image-1","sourceHandle":"custom"}],"extra":{"keep":true,"authorization":"header-secret"}}}`)
	detail, err := decodeLibTVDetailJSON(raw)
	if err != nil {
		t.Fatal(err)
	}
	result, err := adaptLibTVDetail(detail)
	if err != nil {
		t.Fatal(err)
	}
	if result.SourceSnapshot == nil {
		t.Fatal("source node, edge and parameter snapshot is missing")
	}
	snapshot := result.SourceSnapshot.DetailJSON
	for _, retained := range []string{"9007199254740993", "second.png", "keep this text", "sourceHandle", "custom"} {
		if !strings.Contains(snapshot, retained) {
			t.Fatalf("source snapshot lost %q", retained)
		}
	}
	for _, secret := range []string{"envelope-secret", "url-secret", "param-secret", "nested-secret", "header-secret"} {
		if strings.Contains(snapshot, secret) {
			t.Fatalf("source snapshot retained a secret: %s", secret)
		}
	}
	if len(result.SkippedNodes) != 1 || len(result.SkippedConnections) != 1 || result.SourceSnapshot.RedactedFields < 4 {
		t.Fatalf("source preservation report is incomplete: %#v", result)
	}
	encoded, err := json.Marshal(result)
	if err != nil {
		t.Fatal(err)
	}
	var transported map[string]any
	if err := json.Unmarshal(encoded, &transported); err != nil {
		t.Fatal(err)
	}
	wireSnapshot := transported["sourceSnapshot"].(map[string]any)
	if text, ok := wireSnapshot["detailJson"].(string); !ok || !strings.Contains(text, "9007199254740993") {
		t.Fatal("source snapshot must cross the browser JSON boundary as text without rounding integers")
	}
}

func TestLibTVSnapshotKeepsTokenCountsAndStructuralKeys(t *testing.T) {
	detail, err := decodeLibTVDetailJSON([]byte(`{"projectMeta":{"uuid":"292a69d540774a9ab9872d8337c9fd0b"},"nodeList":[{"nodeKey":"image-1","key":"graph-key","data":{"type":"image","url":["https://example.com/image.png?key=query-secret"],"params":{"maxTokens":2048,"tokenLimit":4096,"embeddingTokenCount":100,"access_token":"credential-secret"}},"position":{"positionX":"0","positionY":"0"}}],"connectionList":[]}`))
	if err != nil {
		t.Fatal(err)
	}
	snapshot := detail.SourceSnapshot.DetailJSON
	for _, retained := range []string{`"key":"graph-key"`, `"maxTokens":2048`, `"tokenLimit":4096`, `"embeddingTokenCount":100`} {
		if !strings.Contains(snapshot, retained) {
			t.Fatalf("ordinary source field was redacted: %s", retained)
		}
	}
	if strings.Contains(snapshot, "credential-secret") || strings.Contains(snapshot, "query-secret") {
		t.Fatal("snapshot retained a credential")
	}
}

func TestLibTVLocalJSONRejectsInvalidDocuments(t *testing.T) {
	for name, raw := range map[string][]byte{
		"react-flow":        []byte(`{"nodes":[],"edges":[]}`),
		"null-lists":        []byte(`{"projectMeta":{},"nodeList":null,"connectionList":[]}`),
		"null-meta":         []byte(`{"projectMeta":null,"nodeList":[],"connectionList":[]}`),
		"error-envelope":    []byte(`{"code":401,"data":{"projectMeta":{},"nodeList":[],"connectionList":[]}}`),
		"null-status":       []byte(`{"code":null,"data":{"projectMeta":{},"nodeList":[],"connectionList":[]}}`),
		"array-node-data":   []byte(`{"projectMeta":{},"nodeList":[{"data":[]}],"connectionList":[]}`),
		"number-coordinate": []byte(`{"projectMeta":{},"nodeList":[{"data":{},"position":{"positionX":12}}],"connectionList":[]}`),
		"broken-json":       []byte(`{"projectMeta":`),
		"over-limit":        []byte(strings.Repeat(" ", LibTVMaxImportJSONBytes+1)),
	} {
		t.Run(name, func(t *testing.T) {
			if _, err := decodeLibTVDetailJSON(raw); err == nil {
				t.Fatal("invalid local document was accepted")
			}
		})
	}
}

func TestLibTVLocalJSONAcceptsDetailAndOfficialEnvelope(t *testing.T) {
	detailJSON := `{"projectMeta":{"uuid":"292a69d540774a9ab9872d8337c9fd0b"},"nodeList":[{"nodeKey":"image-1","data":"{\"type\":\"image\",\"url\":[\"https://example.com/image.png\"]}","position":{"positionX":"0","positionY":"0"}}],"connectionList":[]}`
	for _, raw := range []string{detailJSON, "\ufeff" + detailJSON, `{"code":0,"data":` + detailJSON + `}`} {
		detail, err := decodeLibTVDetailJSON([]byte(raw))
		if err != nil {
			t.Fatal(err)
		}
		result, err := adaptLibTVDetail(detail)
		if err != nil || result.ImportedNodeCount != 1 {
			t.Fatalf("valid detail import failed: %v", err)
		}
		if result.SourceSnapshot == nil || !strings.Contains(result.SourceSnapshot.DetailJSON, "image-1") {
			t.Fatal("source snapshot missing")
		}
	}
}

func TestLibTVImportPayloadRejectsOversizeWithoutTrimming(t *testing.T) {
	source := strings.Repeat("x", libTVMaxCanvasPayloadBytes)
	result := &LibTVImportResult{SourceSnapshot: &LibTVSourceSnapshot{Version: 1, DetailJSON: source}}
	if err := validateLibTVImportPayload(`{"nodes":[]}`, result); err == nil {
		t.Fatal("oversized source snapshot was accepted")
	}
	if result.SourceSnapshot.DetailJSON != source {
		t.Fatal("source snapshot was trimmed")
	}
	if err := validateLibTVImportPayload("{}", &LibTVImportResult{}); err != nil {
		t.Fatalf("small import rejected: %v", err)
	}
}

func TestLibTVSnapshotScrubsCredentialTextInsideInvalidNodeData(t *testing.T) {
	detail, err := decodeLibTVDetailJSON([]byte(`{"projectMeta":{},"nodeList":[{"nodeKey":"broken","data":"{\"token\":\"broken-secret\", invalid}"}],"connectionList":[]}`))
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(detail.SourceSnapshot.DetailJSON, "broken-secret") {
		t.Fatal("invalid embedded JSON retained a credential")
	}
}

func TestLibTVLocalJSONReportsUnmappedParameters(t *testing.T) {
	detail, err := decodeLibTVDetailJSON([]byte(`{"projectMeta":{},"nodeList":[{"nodeKey":"image-1","data":{"type":"image","params":{"prompt":"kept","seed":123,"maxTokens":2048}},"position":{"positionX":"0","positionY":"0"}}],"connectionList":[]}`))
	if err != nil {
		t.Fatal(err)
	}
	result, err := adaptLibTVDetail(detail)
	if err != nil {
		t.Fatal(err)
	}
	for _, warning := range result.Warnings {
		if strings.Contains(warning.Message, "seed") && strings.Contains(warning.Message, "maxTokens") {
			return
		}
	}
	t.Fatal("unmapped source parameters were not reported")
}

func TestAdaptLibTVDetailSelectsFirstMediaAndReportsPartialImport(t *testing.T) {
	detail := &libTVDetail{}
	detail.ProjectMeta.UUID = "project-uuid"
	detail.ProjectMeta.Name = "测试画布"
	detail.NodeList = []libTVRawNode{
		{
			NodeKey: "image-1",
			Name:    "多图节点",
			Data:    `{"type":"image","url":["https://example.com/first.png","https://example.com/second.png"],"params":{"prompt":"prompt","model":"model"},"_resourceMeta":{"items":[{"width":1024,"height":768}]}}`,
			Position: struct {
				X string `json:"positionX"`
				Y string `json:"positionY"`
			}{X: "12", Y: "34"},
			Measured: struct {
				Width  string `json:"width"`
				Height string `json:"height"`
			}{Width: "640", Height: "360"},
		},
		{
			NodeKey: "failed-video",
			Name:    "失败视频",
			Data:    `{"type":"video","url":[],"taskInfo":{"status":3,"failedReason":"生成失败"}}`,
			Position: struct {
				X string `json:"positionX"`
				Y string `json:"positionY"`
			}{X: "500", Y: "600"},
		},
		{
			NodeKey: "stale-video",
			Name:    "过期视频",
			Data:    `{"type":"video","url":["https://example.com/video.mp4"],"taskInfo":{"status":2},"isStale":true,"_resourceMeta":{"items":[{"width":1920,"height":1080,"durationSec":5.2506}]}}`,
			Position: struct {
				X string `json:"positionX"`
				Y string `json:"positionY"`
			}{X: "900", Y: "1200"},
			Measured: struct {
				Width  string `json:"width"`
				Height string `json:"height"`
			}{Width: "640", Height: "360"},
		},
	}
	detail.ConnectionList = []libTVRawConnection{
		{ConnectionID: "valid", Source: "image-1", Target: "stale-video"},
		{ConnectionID: "dangling", Source: "image-1", Target: "failed-video"},
	}

	result, err := adaptLibTVDetail(detail)
	if err != nil {
		t.Fatalf("adaptLibTVDetail() error = %v", err)
	}
	if result.ImportedNodeCount != 3 || result.ImportedConnectionCount != 2 {
		t.Fatalf("counts = (%d, %d), want (3, 2)", result.ImportedNodeCount, result.ImportedConnectionCount)
	}
	if len(result.SkippedNodes) != 0 || len(result.SkippedConnections) != 0 {
		t.Fatalf("unexpected skipped items: nodes=%#v connections=%#v", result.SkippedNodes, result.SkippedConnections)
	}
	if result.PlaceholderNodeCount != 1 || result.ReusedFailedNodeCount != 0 {
		t.Fatalf("failure handling counts = (placeholder=%d, reused=%d), want (1, 0)", result.PlaceholderNodeCount, result.ReusedFailedNodeCount)
	}
	if result.BatchCreatedAt.IsZero() {
		t.Fatal("batch created time must not be zero")
	}
	if got := result.Nodes[0]; got.Content != "https://example.com/first.png" || got.X != 12 || got.Y != 34 || got.Width != 640 || got.Height != 360 {
		t.Fatalf("mapped image = %#v", got)
	}
	if got := result.Nodes[0]; got.Prompt != "prompt" || got.Model != "model" || got.NaturalWidth != 1024 || got.NaturalHeight != 768 {
		t.Fatalf("mapped image metadata = %#v", got)
	}
	if got := result.Nodes[1]; got.DurationMs != 0 || got.MimeType != "video/mp4" || got.Status != "error" || got.ErrorDetails != "生成失败" {
		t.Fatalf("mapped video metadata = %#v", got)
	}
	if got := result.Nodes[0].Metadata.Provider; got != "libtv" {
		t.Fatalf("metadata provider = %q, want libtv", got)
	}
	if len(result.Warnings) != 3 {
		t.Fatalf("warnings = %#v", result.Warnings)
	}
}

func TestAdaptLibTVDetailKeepsFailedNodeWithHistoricalMedia(t *testing.T) {
	detail := &libTVDetail{NodeList: []libTVRawNode{{
		NodeKey: "failed-image",
		Data:    `{"type":"image","url":["https://example.com/history.png"],"taskInfo":{"status":3,"failedReason":"本次生成失败"}}`,
		Position: struct {
			X string `json:"positionX"`
			Y string `json:"positionY"`
		}{X: "10", Y: "20"},
	}}}

	result, err := adaptLibTVDetail(detail)
	if err != nil {
		t.Fatalf("adaptLibTVDetail() error = %v", err)
	}
	if len(result.Nodes) != 1 || result.Nodes[0].Content != "https://example.com/history.png" {
		t.Fatalf("historical media node = %#v", result.Nodes)
	}
	if result.Nodes[0].Status != "success" || result.ReusedFailedNodeCount != 1 {
		t.Fatalf("failure reuse = node=%#v count=%d", result.Nodes[0], result.ReusedFailedNodeCount)
	}
}

func TestAdaptLibTVDetailConvertsMaterialStyleToImage(t *testing.T) {
	detail := &libTVDetail{NodeList: []libTVRawNode{{
		NodeKey: "style-1",
		Name:    "风格素材",
		Data:    `{"type":"material-style","coverUrl":"https://example.com/style.png","styleAssetUuid":"asset-1","styleVersionUuid":"version-1","styleName":"电影感"}`,
		Position: struct {
			X string `json:"positionX"`
			Y string `json:"positionY"`
		}{X: "1", Y: "2"},
	}}}

	result, err := adaptLibTVDetail(detail)
	if err != nil {
		t.Fatalf("adaptLibTVDetail() error = %v", err)
	}
	if len(result.Nodes) != 1 {
		t.Fatalf("nodes = %#v", result.Nodes)
	}
	node := result.Nodes[0]
	if node.Type != "image" || node.Content != "https://example.com/style.png" || result.ConvertedSpecialCount != 1 {
		t.Fatalf("converted style node = %#v count=%d", node, result.ConvertedSpecialCount)
	}
	if node.Metadata.StyleAssetUUID != "asset-1" || node.Metadata.StyleVersionUUID != "version-1" || node.Metadata.StyleName != "电影感" {
		t.Fatalf("style metadata = %#v", node.Metadata)
	}
}

func TestAdaptLibTVDetailGeneratesDistinctBatchIDs(t *testing.T) {
	detail := &libTVDetail{}
	detail.ProjectMeta.UUID = "project-uuid"
	detail.NodeList = []libTVRawNode{{
		NodeKey: "image-1",
		Data:    `{"type":"image","url":["https://example.com/image.png"]}`,
		Position: struct {
			X string `json:"positionX"`
			Y string `json:"positionY"`
		}{X: "0", Y: "0"},
	}}

	first, err := adaptLibTVDetail(detail)
	if err != nil {
		t.Fatalf("first adaptLibTVDetail() error = %v", err)
	}
	second, err := adaptLibTVDetail(detail)
	if err != nil {
		t.Fatalf("second adaptLibTVDetail() error = %v", err)
	}
	if first.BatchID == second.BatchID {
		t.Fatalf("batch IDs are not unique: %q", first.BatchID)
	}
	if !strings.HasPrefix(first.Nodes[0].ID, "libtv-"+first.BatchID+"-") {
		t.Fatalf("node ID %q does not contain batch ID %q", first.Nodes[0].ID, first.BatchID)
	}
}

func TestAdaptLibTVDetailRejectsCanvasWithoutImportableNodes(t *testing.T) {
	detail := &libTVDetail{NodeList: []libTVRawNode{{
		NodeKey: "unsupported",
		Data:    `{"type":"text","url":[]}`,
	}}}

	if _, err := adaptLibTVDetail(detail); err == nil {
		t.Fatal("adaptLibTVDetail() error = nil, want an error")
	}
}

func TestAdaptLibTVDetailKeepsReportListsNonNilAndResourceIndex(t *testing.T) {
	detail := &libTVDetail{}
	detail.ProjectMeta.UUID = "project-uuid"
	detail.NodeList = []libTVRawNode{{
		NodeKey: "image-1",
		Data:    `{"type":"image","url":["http://example.com/rejected.png","https://example.com/selected.png"],"_resourceMeta":{"items":[{"width":100,"height":100},{"width":200,"height":300}]}}`,
		Position: struct {
			X string `json:"positionX"`
			Y string `json:"positionY"`
		}{X: "10", Y: "20"},
		Measured: struct {
			Width  string `json:"width"`
			Height string `json:"height"`
		}{Width: "200", Height: "300"},
	}}

	result, err := adaptLibTVDetail(detail)
	if err != nil {
		t.Fatalf("adaptLibTVDetail() error = %v", err)
	}
	if result.SkippedNodes == nil || result.SkippedConnections == nil || result.Warnings == nil {
		t.Fatalf("report slices must not be nil: %#v", result)
	}
	if got := result.Nodes[0]; got.Content != "https://example.com/selected.png" || got.NaturalWidth != 200 || got.NaturalHeight != 300 {
		t.Fatalf("selected media metadata = %#v", got)
	}
}

func TestLibTVDetailFromMCPStructuredContentAndLegacyEnvelope(t *testing.T) {
	structured, _ := json.Marshal(map[string]any{
		"structuredContent": map[string]any{
			"project": map[string]any{"id": "292a69d540774a9ab9872d8337c9fd0b", "name": "MCP 画布"},
			"nodes": []any{
				map[string]any{
					"id":     "n1",
					"title":  "图片",
					"x":      10,
					"y":      20,
					"width":  100,
					"height": 80,
					"type":   "image",
					"url":    []any{"https://example.com/a.png"},
				},
			},
			"connections": []any{
				map[string]any{"id": "c1", "from": "n1", "to": "n1"},
			},
		},
	})
	detail, err := libTVDetailFromMCPResult(structured, "292a69d540774a9ab9872d8337c9fd0b")
	if err != nil {
		t.Fatalf("structured content error = %v", err)
	}
	result, err := adaptLibTVDetail(detail)
	if err != nil {
		t.Fatalf("adapt structured detail error = %v", err)
	}
	if result.ImportedNodeCount != 1 || result.ImportedConnectionCount != 1 || result.Nodes[0].Content != "https://example.com/a.png" {
		t.Fatalf("structured import = %#v", result)
	}

	envelope, _ := json.Marshal(map[string]any{
		"content": []any{
			map[string]any{"type": "text", "text": `{"code":0,"data":{"projectMeta":{"uuid":"292a69d540774a9ab9872d8337c9fd0b","name":"旧接口","effective":{"canRead":true,"canCopy":true}},"nodeList":[{"nodeKey":"image-1","name":"图","data":"{\"type\":\"image\",\"url\":[\"https://example.com/b.png\"]}","position":{"positionX":"1","positionY":"2"}}],"connectionList":[]}}`},
		},
	})
	legacy, err := libTVDetailFromMCPResult(envelope, "292a69d540774a9ab9872d8337c9fd0b")
	if err != nil {
		t.Fatalf("legacy envelope error = %v", err)
	}
	legacyResult, err := adaptLibTVDetail(legacy)
	if err != nil || legacyResult.ProjectName != "旧接口" || legacyResult.Nodes[0].Content != "https://example.com/b.png" {
		t.Fatalf("legacy import = %#v err=%v", legacyResult, err)
	}
}

func TestLibTVDetailFromMCPRejectsUncopyableProject(t *testing.T) {
	raw, _ := json.Marshal(map[string]any{
		"structuredContent": map[string]any{
			"projectMeta": map[string]any{"uuid": "292a69d540774a9ab9872d8337c9fd0b", "effective": map[string]any{"canRead": true, "canCopy": false}},
			"nodeList":    []any{},
		},
	})
	detail, err := libTVDetailFromMCPResult(raw, "292a69d540774a9ab9872d8337c9fd0b")
	if err != nil {
		t.Fatal(err)
	}
	if !detail.copyChecked || detail.copyAllowed {
		t.Fatalf("copy flags = checked=%v allowed=%v", detail.copyChecked, detail.copyAllowed)
	}
}

func TestLibTVProjectArgumentKeysPreferSchema(t *testing.T) {
	keys := libTVProjectArgumentKeys(map[string]any{
		"type":       "object",
		"properties": map[string]any{"uuid": map[string]any{"type": "string"}, "verbose": map[string]any{"type": "boolean"}},
		"required":   []any{"uuid"},
	})
	if len(keys) != 1 || keys[0] != "uuid" {
		t.Fatalf("keys = %#v", keys)
	}
}
