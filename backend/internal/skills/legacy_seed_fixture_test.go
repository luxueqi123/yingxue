package skills

import (
	_ "embed"
	"encoding/json"
	"reflect"
	"strings"
	"testing"
)

// Historical hosted-media assertions use the preserved catalog as test data only.
// Runtime official skills are loaded exclusively from backend/builtin.
//
//go:embed seed/legacy-skills-test.json
var builtinSkillsJSON []byte

func TestBuiltinPackagesPreserveHostedShowcaseMedia(t *testing.T) {
	var legacy []builtinSkillDefinition
	if err := json.Unmarshal(builtinSkillsJSON, &legacy); err != nil {
		t.Fatal(err)
	}
	packages, err := loadBuiltinSkillPackages(nil)
	if err != nil {
		t.Fatal(err)
	}
	actual := make(map[string]string, len(packages))
	for _, item := range packages {
		actual[item.skill.ID] = item.skill.ShowcaseMediaJSON
	}
	checked := 0
	for _, item := range legacy {
		if len(item.ShowcaseMedia) == 0 || !strings.HasPrefix(item.ShowcaseMedia[0].ShowcaseURL, "https://tianyayingxue.cn/skill-media/") {
			continue
		}
		var media []SkillShowcaseMedia
		if err := json.Unmarshal([]byte(actual[item.SkillID]), &media); err != nil {
			t.Fatalf("%s: %v", item.SkillID, err)
		}
		expected := make([]SkillShowcaseMedia, len(item.ShowcaseMedia))
		for i, value := range item.ShowcaseMedia {
			expected[i] = SkillShowcaseMedia{Type: value.Type, ShowcaseURI: value.ShowcaseURI, ShowcaseURL: value.ShowcaseURL}
		}
		if !reflect.DeepEqual(media, expected) {
			t.Fatalf("hosted media lost for %s", item.SkillID)
		}
		checked++
	}
	if checked != 33 {
		t.Fatalf("hosted skills checked = %d, want 33", checked)
	}
}
