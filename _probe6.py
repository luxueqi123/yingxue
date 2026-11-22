import io, os, re, subprocess

ROOT = os.path.abspath(".")

def git(rev, path):
    r = subprocess.run(["git", "cat-file", "blob", "%s:%s" % (rev, path)], capture_output=True)
    return None if r.returncode else r.stdout.decode("utf-8", "replace")

def disk(path):
    p = os.path.join(ROOT, path.replace("/", os.sep))
    return io.open(p, encoding="utf-8", errors="replace").read() if os.path.exists(p) else None

def marks(name, text, needles):
    if text is None:
        print("  %-10s MISSING" % name)
        return
    print("  %-10s %s" % (name, " | ".join("%s=%s" % (n, "Y" if n in text else "-") for n in needles)))

print("== A. canvas-node-config-reset ==")
t = "web/test/canvas-node-config-reset.test.ts"
marks("test HEAD", git("HEAD", t), ["导入工程切换模型保留制作要求", "generationSpec", "composerContent"])
marks("test UP", git("MERGE_HEAD", t), ["导入工程切换模型保留制作要求", "generationSpec", "composerContent"])
marks("test disk", disk(t), ["导入工程切换模型保留制作要求", "generationSpec", "composerContent"])
s = "web/src/lib/canvas/canvas-project-domain.ts"
marks("src HEAD", git("HEAD", s), ["generationSpec", "applyNodeConfigPatch"])
marks("src UP", git("MERGE_HEAD", s), ["generationSpec", "applyNodeConfigPatch"])
marks("src disk", disk(s), ["generationSpec", "applyNodeConfigPatch"])

print("== B. model catalog source ==")
for f, needles in [
    ("web/src/services/api/logical-models.ts", ['"frontend"', "ModelCatalogSource", "managedModelChannels"]),
    ("web/src/lib/user-session.ts", ['"frontend"', "managedModelChannels"]),
    ("backend/internal/app/model_catalog.go", ['"frontend"', '"system"']),
    ("backend/internal/app/model_catalog_test.go", ['"frontend"', '"system"', "AlwaysSerializes"]),
]:
    for rev in ("HEAD", "MERGE_HEAD"):
        marks("%s %s" % (f.split("/")[-1], rev), git(rev, f), needles)
    marks("%s disk" % f.split("/")[-1], disk(f), needles)

print("== C. gitattributes ==")
p = os.path.join(ROOT, ".gitattributes")
print("  exists:", os.path.exists(p))
r = subprocess.run(["git", "config", "--get", "core.autocrlf"], capture_output=True)
print("  core.autocrlf:", r.stdout.decode().strip())

print("== D. settings audio blocks / globals.css anchor ==")
marks("settings disk", disk("web/src/pages/settings/index.tsx"), ["音频默认值", "默认生图张数", "settings-preference-heading", "音频指令", "创作偏好"])
marks("settings UP", git("MERGE_HEAD", "web/src/pages/settings/index.tsx"), ["音频默认值", "默认生图张数", "settings-preference-heading", "音频指令", "创作偏好"])
g = disk("web/src/styles/globals.css") or ""
anchor = '{' + "\n" + "    padding: 20px 20px 12px;"
print("  globals.css LF-anchor:", anchor in g, "| CRLF-anchor:", anchor.replace("\n", "\r\n") in g)
print("  CRLF file:", "\r\n" in g, "| bare-LF count:", len(re.findall(r"(?<!\r)\n", g)))
print("  .settings-preference-block", ".app-user-workspace.settings-page .settings-preference-block" in g)

print("== E. router / sidebar disk markers ==")
r_ = disk("web/src/router.tsx") or ""
print("  router:", " | ".join("%s=%s" % (n, "Y" if n in r_ else "-") for n in [
    'path: "/"', 'path: "/home"', "HomePage", "ShowcasePage", "WalletPage", 'path: "/wallet"', "loadWalletPage"]))
n_ = disk("web/src/components/layout/workspace-sidebar-nav.tsx") or ""
print("  sidebar:", " | ".join("%s=%s" % (n, "Y" if n in n_ else "-") for n in [
    'toolItem("create", "/")', 'to: "/create"', 'to: "/home"', 'id: "home"']))

print("== F. angle dialog src choice ==")
print("  disk test contains UP-only anchors:", all(x in (disk("web/test/canvas-angle-dialog.test.ts") or "") for x in ["CanvasNodePanelOverlay", "dragOffset={dragPreview", "isDragging={isNodeDragging"]))
print("  disk test contains 映雪 anchors:", all(x in (disk("web/test/canvas-angle-dialog.test.ts") or "") for x in ["<AppModal", 'not.toContain("AppModal")']))
