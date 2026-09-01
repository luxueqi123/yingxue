package service

import (
	"encoding/json"
	"strings"
	"testing"
)

func TestBuiltinSkillMediaUsesOwnedHosting(t *testing.T) {
	var definitions []builtinSkillDefinition
	if err := json.Unmarshal(builtinSkillsJSON, &definitions); err != nil {
		t.Fatalf("parse builtin skills: %v", err)
	}
	if len(definitions) != 33 {
		t.Fatalf("builtin skill count = %d, want 33", len(definitions))
	}

	seenURLs := make(map[string]struct{})
	for _, definition := range definitions {
		if len(definition.ShowcaseMedia) == 0 {
			t.Fatalf("skill %s has no showcase media", definition.SkillID)
		}
		hasImage := false
		for _, media := range definition.ShowcaseMedia {
			if media.Type == "image" {
				hasImage = true
			}
			if !strings.HasPrefix(media.ShowcaseURL, "https://tianyayingxue.cn/skill-media/") {
				t.Fatalf("skill %s uses non-owned media URL %q", definition.SkillID, media.ShowcaseURL)
			}
			if _, exists := seenURLs[media.ShowcaseURL]; exists {
				t.Fatalf("duplicate showcase URL %q", media.ShowcaseURL)
			}
			seenURLs[media.ShowcaseURL] = struct{}{}
		}
		if !hasImage {
			t.Fatalf("skill %s has no image cover", definition.SkillID)
		}
	}
	if len(seenURLs) != 72 {
		t.Fatalf("showcase media count = %d, want 72", len(seenURLs))
	}
}
