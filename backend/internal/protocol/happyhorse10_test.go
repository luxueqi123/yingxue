package protocol

import (
	"context"
	"encoding/json"
	"testing"
)

func TestHappyHorseBothVersionsKeepExactModelInFinalPackages(t *testing.T) {
	for _, mode := range []string{"i2v", "r2v"} {
		adapters, request := happyHorseAdapters(t), happyHorseRequest()
		if mode == "i2v" {
			adapters, request = happyHorseFirstFrameAdapters(t), happyHorseFirstFrameRequest()
		}
		for origin, adapter := range adapters {
			for _, version := range []string{"1.0", "1.1"} {
				t.Run(mode+"/"+origin+"/"+version, func(t *testing.T) {
					request.Model = "happyhorse-" + version + "-" + mode
					spec, err := adapter.BuildCreate(context.Background(), RequestContext{Request: request})
					if err != nil {
						t.Fatal(err)
					}
					raw, err := json.Marshal(spec.Body)
					if err != nil {
						t.Fatal(err)
					}
					var body map[string]any
					if err := json.Unmarshal(raw, &body); err != nil {
						t.Fatal(err)
					}
					if body["model"] != request.Model {
						t.Fatalf("model substituted: %s", raw)
					}
				})
			}
		}
	}
}
