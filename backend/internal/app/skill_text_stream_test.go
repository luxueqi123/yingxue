package app

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestResponsesEmptyCompletionPreservesStreamedTools(t *testing.T) {
	for _, event := range []string{"response.output_item.added", "response.output_item.done"} {
		p := newStreamingAgentParser("responses", nil)
		p.consumeResponsesEvent(event, map[string]interface{}{"output_index": float64(0), "item": map[string]interface{}{"type": "function_call", "call_id": "call-1", "name": "canvas_get_context", "arguments": "{}"}})
		p.consumeResponsesEvent("response.completed", map[string]interface{}{"response": map[string]interface{}{"status": "completed", "output": []interface{}{}}})
		result, err := p.result()
		if err != nil {
			t.Fatal(err)
		}
		calls := interfaceSlice(result["toolCalls"])
		if len(calls) != 1 {
			t.Fatalf("%s: lost tool calls: %v", event, result)
		}
		p.completed = map[string]interface{}{"output": []interface{}{map[string]interface{}{"type": "function_call", "call_id": "call-1", "name": "canvas_get_context", "arguments": "{}"}}}
		result, err = p.result()
		if err != nil || len(interfaceSlice(result["toolCalls"])) != 1 {
			t.Fatalf("duplicate final call: %v %v", result, err)
		}
	}
	p := newStreamingAgentParser("responses", nil)
	p.completed = map[string]interface{}{"output": []interface{}{}}
	if _, err := p.result(); err == nil {
		t.Fatal("empty stream must not succeed")
	}
}

func TestOfficialTextPluginPreservesStreamingSkillExecution(t *testing.T) {
	t.Setenv("CANVAS_ALLOWED_PRIVATE_UPSTREAM_HOSTS", "127.0.0.1")
	center, err := newPluginRuntime(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	ctx := withProtocolRegistry(context.Background(), center.registrySnapshot())
	if _, ok := declarativeProtocolAdapterForContext(ctx, "openai-response"); !ok {
		t.Fatal("test must exercise installed official adapter")
	}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/responses" {
			t.Errorf("unexpected path %s", r.URL.Path)
		}
		if r.Header.Get("Accept") != "text/event-stream" {
			t.Error("stream transport not used")
		}
		w.Header().Set("Content-Type", "text/event-stream")
		_, _ = w.Write([]byte("event: response.output_text.delta\ndata: {\"type\":\"response.output_text.delta\",\"delta\":\"剧本产出\"}\n\nevent: response.completed\ndata: {\"type\":\"response.completed\",\"response\":{\"status\":\"completed\",\"output\":[{\"type\":\"message\",\"content\":[{\"type\":\"output_text\",\"text\":\"剧本产出\"}]}]}}\n\n"))
	}))
	defer server.Close()
	for _, agent := range []bool{false, true} {
		var deltas strings.Builder
		input := canvasGenerationInput{Config: providerConfig{BaseURL: server.URL, APIKey: "test-key", Model: "test-model", InterfaceType: "openai-response"}, Prompt: "按技能写剧本", StreamText: true, OnTextDelta: func(s string) { deltas.WriteString(s) }}
		var result map[string]interface{}
		if agent {
			input.AgentRequests = &agentToolRequests{Responses: map[string]interface{}{"input": "按技能写剧本"}}
			result, err = runAgentToolTask(ctx, input)
		} else {
			result, err = runTextTask(ctx, input)
		}
		if err != nil {
			t.Fatalf("agent=%v: %v", agent, err)
		}
		if result["text"] != "剧本产出" || deltas.String() != "剧本产出" {
			t.Fatalf("agent=%v: output/delta lost: %v %q", agent, result, deltas.String())
		}
	}
}
