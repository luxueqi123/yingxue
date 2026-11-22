import io
p="backend/internal/skills/yingxue_production_skills_test.go"
s=io.open(p,encoding="utf-8").read()
old="""	var total int64
	if err = db.Model(&model.Skill{}).Count(&total).Error; err != nil {
		t.Fatal(err)
	}
	if total != int64(33+len(definitions)) {
		t.Fatalf("seeded %d skills", total)
	}"""
new="""	var builtin []builtinSkillDefinition
	if err = json.Unmarshal(builtinSkillsJSON, &builtin); err != nil {
		t.Fatal(err)
	}
	var total int64
	if err = db.Model(&model.Skill{}).Count(&total).Error; err != nil {
		t.Fatal(err)
	}
	// 种子是内置库、制作技能库与图片编辑技能的并集，避免上游新增技能时基数写死。
	expected := len(builtin) + len(definitions) + len(builtinImageEditingSkillDefinitions())
	if total != int64(expected) {
		t.Fatalf("seeded %d skills, want %d", total, expected)
	}"""
assert old in s, "anchor not found"
io.open(p,"w",encoding="utf-8",newline="").write(s.replace(old,new,1))
print("patched", p)
