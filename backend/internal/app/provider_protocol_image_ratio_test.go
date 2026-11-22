package app

import (
	"context"
	"encoding/json"
	"reflect"
	"testing"

	"infinite-canvas/backend/internal/protocol"
)

func TestProtocolInputImageAspectRatioUsesActualBytes(t *testing.T) {
	var requirements protocol.ImageInputRequirements
	if err := json.Unmarshal([]byte(`{"formats":["png"],"maxBytes":20000000,"minShortSide":300,"minAspectRatio":0.4,"maxAspectRatio":2.5}`), &requirements); err != nil {
		t.Fatal(err)
	}
	for _, item := range []struct {
		name          string
		width, height int
		allowed       bool
	}{
		{"minimum-ratio", 300, 750, true},
		{"maximum-ratio", 750, 300, true},
		{"too-tall", 300, 751, false},
		{"too-wide", 751, 300, false},
		{"too-small", 299, 300, false},
	} {
		t.Run(item.name, func(t *testing.T) {
			data := inputImageDataURL("image/png", inputImageBytes(t, "png", item.width, item.height))
			request := protocol.GenerationRequest{Images: []protocol.MediaReference{{DataURL: data, Role: "first_frame", Order: 4, Metadata: map[string]any{"width": 500, "height": 500}}}}
			before, _ := json.Marshal(request)
			prepared, err := prepareProtocolInputImages(context.Background(), providerConfig{}, request, &requirements)
			if !item.allowed {
				if err == nil {
					t.Fatal("invalid actual image proportions passed using declared square metadata")
				}
			} else {
				if err != nil {
					t.Fatal(err)
				}
				ref := prepared.Images[0]
				if ref.DataURL != data || ref.Role != "first_frame" || ref.Order != 4 || !reflect.DeepEqual(prepared.Inputs, prepared.Images) {
					t.Fatal("inspected bytes, role, order or unified inputs changed")
				}
				if ref.Metadata["width"] != item.width || ref.Metadata["height"] != item.height {
					t.Fatal("actual dimensions were not preserved")
				}
			}
			after, _ := json.Marshal(request)
			if string(before) != string(after) {
				t.Fatal("caller-owned request changed")
			}
		})
	}
}
