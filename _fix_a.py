import io
p="backend/internal/protocol/autodl_plugin_artifact_test.go"
s=io.open(p,encoding="utf-8",newline="").read()
old='''	if pkg.Manifest.Metadata.Version != "2.1.0" || len(pkg.Manifest.Contributes.Workflows) != 13 {
		t.Fatalf("plugin manifest = version:%q workflows:%d, want 2.1.0 and 13", pkg.Manifest.Metadata.Version, len(pkg.Manifest.Contributes.Workflows))
	}'''
new='''	// 插件包跟随上游底座，映雪只在其上做二开，不在测试里钉旧版本号。
	if pkg.Manifest.Metadata.Version != "2.2.0" || len(pkg.Manifest.Contributes.Workflows) != 16 {
		t.Fatalf("plugin manifest = version:%q workflows:%d, want 2.2.0 and 16", pkg.Manifest.Metadata.Version, len(pkg.Manifest.Contributes.Workflows))
	}'''
assert old in s
io.open(p,"w",encoding="utf-8",newline="").write(s.replace(old,new,1))
print("patched",p)
