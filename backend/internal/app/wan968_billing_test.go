package app

import "testing"

func TestWan968Charge(t *testing.T) {
	for _, tt := range []struct {
		name, mode     string
		price, seconds int64
		videos         int
		durations      []int64
		want           int64
		fail           bool
	}{
		{"request", "fixed_request", 70000000, 30, 0, nil, 70000000, false},
		{"request reference", "fixed_request", 70000000, 30, 1, nil, 140000000, false},
		{"request multiple references", "fixed_request", 70000000, 30, 2, nil, 140000000, false},
		{"request too long", "fixed_request", 70000000, 31, 0, nil, 0, true},
		{"seconds", "per_second", 2500000, 4, 0, nil, 10000000, false},
		{"fractional reference", "per_second", 2500000, 4, 1, []int64{1250}, 13125000, false},
		{"missing reference duration", "per_second", 2500000, 4, 1, nil, 0, true},
		{"zero reference", "per_second", 2500000, 4, 1, []int64{0}, 0, true},
		{"negative count", "fixed_request", 70000000, 30, -1, nil, 0, true},
		{"seconds too long", "per_second", 2500000, 16, 0, nil, 0, true},
	} {
		t.Run(tt.name, func(t *testing.T) {
			got, err := wan968Charge(tt.mode, tt.price, tt.seconds, 10000, &ModelRequestIntent{Inputs: map[string]int{"video": tt.videos}, ReferenceVideoDurationsMs: tt.durations})
			if (err != nil) != tt.fail || got != tt.want {
				t.Fatalf("got %d, %v; want %d, error=%v", got, err, tt.want, tt.fail)
			}
		})
	}
}

func TestWan968ProxyReferenceCannotDisappear(t *testing.T) {
	intent := ModelRequestIntentFromProxyRequest("video", "application/json", []byte(`{"video_refs":["https://example.com/a.mp4"],"duration":4,"resolution":"480p"}`))
	if intent.Inputs["video"] != 1 {
		t.Fatal("reference video missing from billing")
	}
	if _, err := wan968Charge("per_second", 2500000, 4, 10000, &intent); err == nil {
		t.Fatal("missing duration must fail closed")
	}
}
