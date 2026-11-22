package skills

import (
	"encoding/json"
	"fmt"
	"strings"
	"testing"
)

func expectedBuiltinSkillIDs() map[string]struct{} {
	ids := map[string]struct{}{
		"14519800321292": {}, "14811816960268": {}, "14811816960524": {}, "14811816960780": {},
		"14811816961036": {}, "14811816961292": {}, "14811816961804": {}, "14811816962060": {},
		"14811816962316": {}, "14811816962572": {}, "14811816969484": {}, "14811816969740": {},
		"14811816969996": {}, "14811816970252": {}, "14811816970508": {}, "14811816980748": {},
		"14811816981004": {}, "14811816981260": {}, "14811816981516": {}, "14811816981772": {},
		"14811816982028": {}, "14811816982284": {}, "14811816982540": {}, "14811816982796": {},
		"14811816983052": {}, "14811816983308": {}, "14889292801804": {}, "14889292802060": {},
		"14889899551756": {}, "14889899552012": {}, "15215320902412": {}, "15434297644556": {},
		"15507072002828": {},
	}
	for id := 73; id <= 107; id++ {
		ids[fmt.Sprintf("1600000000%04d", id)] = struct{}{}
	}
	return ids
}

func expectedOriginalBuiltinSkillIDs() map[string]struct{} {
	ids := expectedBuiltinSkillIDs()
	for id := 73; id <= 107; id++ {
		delete(ids, fmt.Sprintf("1600000000%04d", id))
	}
	return ids
}

func TestBuiltinSkillMediaUsesOwnedHosting(t *testing.T) {
	var definitions []builtinSkillDefinition
	if err := json.Unmarshal(builtinSkillsJSON, &definitions); err != nil {
		t.Fatalf("parse builtin skills: %v", err)
	}
	expectedIDs := expectedBuiltinSkillIDs()
	originalIDs := expectedOriginalBuiltinSkillIDs()
	if len(definitions) != len(expectedIDs) {
		t.Fatalf("builtin skill count = %d, want %d", len(definitions), len(expectedIDs))
	}

	seenURLs := make(map[string]struct{})
	seenIDs := make(map[string]struct{}, len(definitions))
	ownedMediaCount := 0
	communityMediaCount := 0
	communityWithoutMedia := make(map[string]struct{})
	for _, definition := range definitions {
		if _, expected := expectedIDs[definition.SkillID]; !expected {
			t.Fatalf("unexpected builtin skill ID %s", definition.SkillID)
		}
		if _, duplicate := seenIDs[definition.SkillID]; duplicate {
			t.Fatalf("duplicate builtin skill ID %s", definition.SkillID)
		}
		seenIDs[definition.SkillID] = struct{}{}
		isCommunity := definition.SkillID >= "16000000000073" && definition.SkillID <= "16000000000107"
		if isCommunity && definition.OwnerUID != "community-itswyatt-k" {
			t.Fatalf("community skill %s has owner %q", definition.SkillID, definition.OwnerUID)
		}
		if !isCommunity {
			if _, original := originalIDs[definition.SkillID]; !original {
				t.Fatalf("unexpected non-community skill %s", definition.SkillID)
			}
			if definition.OwnerUID == "community-itswyatt-k" {
				t.Fatalf("non-community skill %s has community owner", definition.SkillID)
			}
		}
		if len(definition.ShowcaseMedia) == 0 {
			if !isCommunity || definition.SkillID != "16000000000107" {
				t.Fatalf("skill %s has no showcase media", definition.SkillID)
			}
			communityWithoutMedia[definition.SkillID] = struct{}{}
			continue
		}
		hasImage := false
		for _, media := range definition.ShowcaseMedia {
			if media.Type == "image" {
				hasImage = true
			}
			if isCommunity {
				if !strings.HasPrefix(media.ShowcaseURL, "https://raw.githubusercontent.com/itsWyatt-K/judian-skills/main/showcase/") {
					t.Fatalf("community skill %s uses unexpected media URL %q", definition.SkillID, media.ShowcaseURL)
				}
				communityMediaCount++
			} else {
				if !strings.HasPrefix(media.ShowcaseURL, "https://tianyayingxue.cn/skill-media/") {
					t.Fatalf("skill %s uses non-owned media URL %q", definition.SkillID, media.ShowcaseURL)
				}
				ownedMediaCount++
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
	if len(seenIDs) != len(expectedIDs) {
		t.Fatalf("builtin skill ID set size = %d, want %d", len(seenIDs), len(expectedIDs))
	}
	if ownedMediaCount != 72 {
		t.Fatalf("owned showcase media count = %d, want 72", ownedMediaCount)
	}
	if communityMediaCount != 34 {
		t.Fatalf("community showcase media count = %d, want 34", communityMediaCount)
	}
	if len(communityWithoutMedia) != 1 {
		t.Fatalf("community skills without media = %d, want 1", len(communityWithoutMedia))
	}
	if len(seenURLs) != 106 {
		t.Fatalf("showcase media count = %d, want 106", len(seenURLs))
	}
}
