package protocol

import (
	"context"
	"testing"
)

func TestResponsesNestedOutputText(t *testing.T) {
	builtin, _ := Builtins().Get("openai-response")
	for _, adapter := range []Adapter{builtin, officialPackageAdapter(t, "openai-responses.yingce-plugin", "openai-response")} {
		for _, tc := range []struct {
			name, body, want string
		}{
			{"nested messages", `{"status":"completed","output":[{"type":"reasoning","summary":[{"text":"private reasoning"}]},{"type":"message","content":[{"type":"output_text","text":"first "},{"type":"output_text","text":"second"}]},{"type":"function_call","name":"inspect","arguments":"secret arguments"},{"type":"message","content":[{"type":"output_text","text":" third"}]}],"usage":{"input_tokens":2,"output_tokens":3}}`, "first second third"},
			{"flat text takes precedence", `{"output_text":"flat answer","output":[{"type":"message","content":[{"type":"output_text","text":"duplicate answer"}]}]}`, "flat answer"},
		} {
			t.Run(adapter.Metadata().Version+"/"+tc.name, func(t *testing.T) {
				result, err := adapter.ParseCreate(context.Background(), []byte(tc.body))
				if err != nil || result.Result == nil || result.Result.Text != tc.want {
					t.Fatalf("text missing or changed: result=%#v err=%v", result, err)
				}
				if tc.name == "nested messages" && (result.Result.Usage["input_tokens"] != float64(2) || result.Result.Usage["output_tokens"] != float64(3)) {
					t.Fatalf("usage lost: %#v", result.Result.Usage)
				}
			})
		}
	}
}

func TestOfficialResponsesNestedTextPreservesFailure(t *testing.T) {
	adapter := officialPackageAdapter(t, "openai-responses.yingce-plugin", "openai-response")
	result, err := adapter.ParseCreate(context.Background(), []byte(`{"error":{"code":"upstream_failed","message":"provider rejected"},"output":[{"type":"message","content":[{"type":"output_text","text":"partial output"}]}]}`))
	if err != nil || result.Status != StatusFailed || result.Message != "provider rejected" {
		t.Fatalf("provider failure was masked: result=%#v err=%v", result, err)
	}
}

func TestOfficialResponsesNestedAgentTextRetainsToolCalls(t *testing.T) {
	adapter := officialPackageAdapter(t, "openai-responses.yingce-plugin", "openai-response")
	result, err := adapter.(AgentAdapter).ParseAgent(context.Background(), []byte(`{"output":[{"type":"message","content":[{"type":"output_text","text":"inspect the canvas"}]},{"type":"function_call","call_id":"call-1","name":"canvas_get_state","arguments":"{}"}]}`))
	if err != nil || result.Text != "inspect the canvas" || len(result.ToolCalls) != 1 || result.ToolCalls[0].ID != "call-1" || result.ToolCalls[0].Name != "canvas_get_state" {
		t.Fatalf("agent text or tool call missing: result=%#v err=%v", result, err)
	}
}
