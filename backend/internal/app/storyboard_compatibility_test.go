package app

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"infinite-canvas/backend/internal/model"
	"infinite-canvas/backend/internal/platform"
)

func importedStoryboardFixture(t *testing.T, count int) string {
	t.Helper()
	plan := agentStoryboardPlan{Title: "导入分镜", Logline: "雨夜推门", StyleGuide: "沿用参考画面", Characters: []string{}, Locations: []string{}}
	for i := 0; i < count; i++ {
		plan.Shots = append(plan.Shots, agentStoryboardShot{Title: fmt.Sprintf("镜头%d", i+1), Description: "推门", Duration: 0.5,
			VisualPrompt: "雨夜室内推门，保留完整画面要求", VideoPrompt: "固定机位，缓慢推门", Camera: "平视中景", Motion: "固定机位", TimeBeats: "0-0.5秒：推门",
			SceneTags: "室内，雨夜", PropTags: "红伞", MustHave: []string{"推门"}, AssetRefs: []storyboardAssetRef{}, CharacterIDs: []string{}, DetectedCharacters: []storyboardDetectedCharacter{}})
	}
	data, err := json.Marshal(plan)
	if err != nil {
		t.Fatal(err)
	}
	return string(data)
}

func TestImportedStoryboardPreservesExtendedRowsAndFractionalDurations(t *testing.T) {
	input := agentStoryboardInput{ImportedStoryboard: true, ShotLimit: 17}
	options, err := storyboardOptions(input)
	if err != nil {
		t.Fatal(err)
	}
	fixture := importedStoryboardFixture(t, 17)
	if _, err := parseStoryboardPlanForInput(importedStoryboardFixture(t, 1), agentStoryboardInput{}, storyboardExecutionOptions{maxShots: maxStoryboardShots}); err == nil {
		t.Fatal("ordinary native tasks must retain their integer-duration contract")
	}
	if _, err := parseAgentStoryboardPlan(fixture); err == nil {
		t.Fatal("native limit must remain independent")
	}
	plan, err := parseStoryboardPlanForInput(fixture, input, options)
	if err != nil {
		t.Fatal(err)
	}
	if len(plan.Shots) != 17 || plan.Shots[0].Duration != 0.5 || plan.Shots[0].SceneTags != "室内，雨夜" {
		t.Fatalf("source fields lost: %#v", plan.Shots[0])
	}
	if err := validateStoryboardPlan(&plan, 0, 17, nil, nil, 17); err != nil {
		t.Fatal(err)
	}
	values := storyboardPromptValues("剧情", "", nil, storyboardProjectStyle{}, nil, 0, 17, options)
	if !strings.Contains(values["镜头数量规则"], "严格输出 17") || !strings.Contains(values["单镜头时长规则"], "不要取整") {
		t.Fatal("execution contract differs from parser")
	}
	if !strings.Contains(storyboardImagePromptValues("", "", plan.Shots[0])["首帧构图"], "红伞") {
		t.Fatal("prop requirement missing from generation variables")
	}
	if _, err := storyboardOptions(agentStoryboardInput{ImportedStoryboard: true, ShotLimit: 513}); err == nil {
		t.Fatal("must reject unbounded execution")
	}
	if _, err := importedStoryboardRequirements(agentStoryboardInput{ImportedStoryboard: true, SourceColumns: []storyboardSourceColumn{{Field: "unknown"}}}); err == nil {
		t.Fatal("unknown column was dropped")
	}
}

func TestImportedStoryboardUsesNativeProviderWithActualMediaAndReturnsRows(t *testing.T) {
	for _, repair := range []bool{false, true} {
		t.Run(fmt.Sprintf("repair=%t", repair), func(t *testing.T) { verifyImportedStoryboardProvider(t, repair) })
	}
}

func verifyImportedStoryboardProvider(t *testing.T, repair bool) {
	t.Helper()
	svc, db := newTimelineTaskTestService(t)
	svc.coordinator = platform.NewCoordinatorWithRedis(nil, "storyboard-provider-test")
	if err := db.Create(&model.Task{ID: "task", UserID: "user", Status: model.TaskStatusRunning}).Error; err != nil {
		t.Fatal(err)
	}
	svc.runtimeCapabilities = RuntimeCapabilitiesForDeployment("127.0.0.1:8080", "true")
	fixture := importedStoryboardFixture(t, 17)
	calls := 0
	fixture = strings.ReplaceAll(fixture, `"propTags":"红伞"`, `"propTags":"红伞","videoReference":{"videoIndex":0,"startTime":0.25,"endTime":0.75}`)
	var characterPlan agentStoryboardPlan
	if err := json.Unmarshal([]byte(fixture), &characterPlan); err != nil {
		t.Fatal(err)
	}
	imageIndex := 0
	for index := range characterPlan.Shots {
		characterPlan.Shots[index].DetectedCharacters = []storyboardDetectedCharacter{{Name: "映雪", Description: "白衣，左手持红伞", ReferenceImageIndex: &imageIndex}}
	}
	encodedPlan, _ := json.Marshal(characterPlan)
	fixture = string(encodedPlan)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls++
		body, err := io.ReadAll(r.Body)
		if err != nil {
			t.Error(err)
		}
		for _, want := range []string{"input_image", testReferenceImageDataURL, "video_url", "https://example.test/reference.mp4", "保留0.5秒", "sceneTags"} {
			if !bytes.Contains(body, []byte(want)) {
				t.Errorf("provider request lost %q", want)
			}
		}
		responseText := fixture
		if repair && calls == 1 {
			responseText = strings.ReplaceAll(fixture, `"propTags":"红伞"`, `"propTags":null`)
		}
		payload := map[string]any{"type": "response.completed", "response": map[string]any{"status": "completed", "output": []any{map[string]any{"type": "message", "content": []any{map[string]any{"type": "output_text", "text": responseText}}}}}}
		encoded, _ := json.Marshal(payload)
		w.Header().Set("Content-Type", "text/event-stream")
		fmt.Fprintf(w, "event: response.completed\ndata: %s\n\n", encoded)
	}))
	defer server.Close()
	input := agentStoryboardInput{ImportedStoryboard: true, ShotLimit: 17, ShotCount: 17,
		SourceColumns:   []storyboardSourceColumn{{Field: "duration_seconds", Label: "时长", Description: "保留0.5秒"}, {Field: "video_reference", Label: "原片参考"}},
		Config:          providerConfig{BaseURL: server.URL, APIKey: "fixture", Model: "fixture", InterfaceType: "openai-response", AllowLocalChannel: true},
		ReferenceImages: []providerMedia{{ID: "image", DataURL: testReferenceImageDataURL}}, ReferenceVideos: []providerMedia{{ID: "video", URL: "https://example.test/reference.mp4"}}}
	data, _ := json.Marshal(struct {
		agentStoryboardInput
		Mode string `json:"mode"`
	}{input, "text"})
	result, ops, err := svc.processTask(context.Background(), model.Task{ID: "task", UserID: "user", Type: "canvas_text", Operation: "storyboard", Prompt: "按参考拆镜", InputJSON: string(data)})
	if err != nil {
		t.Fatal(err)
	}
	rows, ok := result["rows"].([]map[string]any)
	if !ok || len(ops) != 0 {
		t.Fatalf("queued storyboard task did not return editable rows: result=%#v ops=%#v", result, ops)
	}
	expectedCalls := 1
	if repair {
		expectedCalls = 2
	}
	if calls != expectedCalls || len(rows) != 17 || rows[0]["durationSeconds"] != float64(0.5) || rows[0]["propTags"] != "红伞" {
		t.Fatalf("wrong native result: calls=%d rows=%#v", calls, rows)
	}
	if !strings.Contains(rows[0]["imageGenerationPrompt"].(string), "红伞") {
		t.Fatal("returned generation prompt lost prop")
	}
	ref := rows[0]["videoReference"].(map[string]any)
	people := rows[0]["characters"].([]map[string]any)
	if len(people) != 1 || people[0]["characterName"] != "映雪" || people[0]["characterDescription"] != "白衣，左手持红伞" || people[0]["characterImageNodeId"] != "image" {
		t.Fatalf("detected character data lost: %#v", people)
	}
	if _, exists := people[0]["characterAssetId"]; exists {
		t.Fatal("must not invent a project character asset")
	}
	if refs, ok := result["storyboardReferenceVideos"].([]map[string]string); !ok || len(refs) != 1 || refs[0]["url"] != "https://example.test/reference.mp4" || len(refs[0]) != 1 {
		t.Fatalf("source media recovery metadata is missing or excessive: %#v", result["storyboardReferenceVideos"])
	}
	if ref["sourceVideoIndex"] != 0 || ref["startTime"] != 0.25 || ref["endTime"] != 0.75 || ref["referenceFrameImage"] != "" {
		t.Fatalf("actual-frame materialization contract lost: %#v", ref)
	}
}

func TestImportedStoryboardTaskRejectsMalformedRoutingInput(t *testing.T) {
	for _, raw := range []string{`{"importedStoryboard":"true"}`, `{"importedStoryboard":true`} {
		_, _, err := (&Service{}).processTask(context.Background(), model.Task{
			Type: "canvas_text", Operation: "storyboard", InputJSON: raw,
		})
		if err == nil || !strings.Contains(err.Error(), "分镜任务输入解析失败") {
			t.Fatalf("malformed storyboard routing input was not rejected: %v", err)
		}
	}
}

func TestImportedStoryboardReferenceRequiresActualVideoAndCompleteTimes(t *testing.T) {
	input := agentStoryboardInput{ImportedStoryboard: true, ShotLimit: 12, ReferenceVideos: []providerMedia{{URL: "https://example.test/video.mp4"}}, SourceColumns: []storyboardSourceColumn{{Field: "video_reference"}}}
	options, _ := storyboardOptions(input)
	base := importedStoryboardFixture(t, 1)
	if _, err := parseStoryboardPlanForInput(base, input, options); err == nil {
		t.Fatal("missing reference decision must trigger repair")
	}
	for _, bad := range []string{`{"videoIndex":1,"startTime":0,"endTime":1}`, `{"videoIndex":0,"startTime":2,"endTime":1}`, `{"videoIndex":0,"endTime":1}`, `{"videoIndex":0,"startTime":null,"endTime":1}`} {
		raw := strings.ReplaceAll(base, `"propTags":"红伞"`, `"propTags":"红伞","videoReference":`+bad)
		if _, err := parseStoryboardPlanForInput(raw, input, options); err == nil {
			t.Fatalf("invalid reference accepted: %s", bad)
		}
	}
	raw := strings.ReplaceAll(base, `"propTags":"红伞"`, `"propTags":"红伞","videoReference":null`)
	if _, err := parseStoryboardPlanForInput(raw, input, options); err != nil {
		t.Fatal(err)
	}
}

func TestStoryboardReferenceHydrationEnforcesOwnership(t *testing.T) {
	svc := newResourceTestService(t)
	resource, _, err := svc.storeResource("owner", "image", "reference.png", "image/png", 5, 1, 1, 0, strings.NewReader("hello"), nil, false)
	if err != nil {
		t.Fatal(err)
	}
	input := agentStoryboardInput{ReferenceImages: []providerMedia{{StorageKey: "resource:" + resource.ID}}}
	if _, err := svc.storyboardTextGenerationInput(context.Background(), "other", input, "prompt", providerConfig{}, 100); err == nil {
		t.Fatal("another account's resource was accepted")
	}
	prepared, err := svc.storyboardTextGenerationInput(context.Background(), "owner", input, "prompt", providerConfig{}, 100)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.HasPrefix(prepared.ReferenceImages[0].DataURL, "data:") || input.ReferenceImages[0].DataURL != "" {
		t.Fatal("hydration lost bytes or mutated persisted input")
	}
}

func TestStoryboardRejectsUnimplementedAudioReferences(t *testing.T) {
	svc := &Service{}
	_, err := svc.storyboardTextGenerationInput(context.Background(), "user", agentStoryboardInput{
		ReferenceAudios: []providerMedia{{URL: "https://example.test/reference.wav"}},
	}, "prompt", providerConfig{}, 100)
	if err == nil || !strings.Contains(err.Error(), "音频参考") {
		t.Fatalf("unimplemented audio input must fail before provider submission: %v", err)
	}
}

func TestImportedStoryboardCharactersAndLongPromptAreNotFlattened(t *testing.T) {
	input := agentStoryboardInput{ImportedStoryboard: true, ShotLimit: 12, ReferenceImages: []providerMedia{{ID: "actual-image"}}}
	options, _ := storyboardOptions(input)
	var fixture agentStoryboardPlan
	if err := json.Unmarshal([]byte(importedStoryboardFixture(t, 1)), &fixture); err != nil {
		t.Fatal(err)
	}
	index := 0
	fixture.Shots[0].DetectedCharacters = []storyboardDetectedCharacter{{Name: "映雪", Description: "人物完整外观", ReferenceImageIndex: &index}}
	fixture.Shots[0].VisualPrompt = strings.Repeat("必须保持服装细节", 100) + "最后的关键细节"
	raw, _ := json.Marshal(fixture)
	plan, err := parseStoryboardPlanForInput(string(raw), input, options)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(storyboardImagePromptValues("", "", plan.Shots[0])["首帧构图"], "最后的关键细节") {
		t.Fatal("imported visual details were truncated")
	}
	if !strings.Contains(storyboardVideoPromptValues("", "", plan.Shots[0])["首帧构图"], "最后的关键细节") {
		t.Fatal("imported video details were truncated")
	}
	if _, err := parseStoryboardPlanForInput(string(raw), agentStoryboardInput{ImportedStoryboard: true, ShotLimit: 12}, options); err == nil {
		t.Fatal("reference image must exist in actual submitted inputs")
	}
	fixture.Shots[0].DetectedCharacters = append(fixture.Shots[0].DetectedCharacters, fixture.Shots[0].DetectedCharacters[0])
	raw, _ = json.Marshal(fixture)
	if _, err := parseStoryboardPlanForInput(string(raw), input, options); err == nil {
		t.Fatal("duplicate names must not bind ambiguously")
	}
}
