import io,re,os,subprocess,json
tests = """test/app-theme.test.ts
test/ark-video-execution.test.ts
test/canvas-angle-dialog.test.ts
test/canvas-image-upload.test.tsx
test/canvas-node-config-reset.test.ts
test/create-canvas-handoff.test.ts
test/create-library-button.test.ts
test/kling-native-execution.test.ts
test/local-cli-settings.test.ts
test/local-runtime-connection.test.ts
test/ltv-audio-execution.test.ts
test/project-document-persistence.test.ts
test/topaz-video-execution.test.ts
test/settings-preference-spacing.test.ts
test/ui-kit-retirement.test.ts
test/workspace-route-loading.test.ts
test/user-scoped-generation-persistence.test.ts
test/local-channel-permission.test.ts""".split()
headw=set(io.open("../_sweep_headwon.txt",encoding="utf-8").read().split())
upw=set(io.open("../_sweep_upwon.txt",encoding="utf-8").read().split())
un=set(io.open("../_sweep_union.txt",encoding="utf-8").read().split())
for t in tests:
    if not os.path.exists(t): 
        print("MISSING", t); continue
    s=io.open(t,encoding="utf-8",errors="replace").read()
    paths=set()
    for m in re.finditer(r'source\(\s*"\.\./(\.\./)?([^"]+)"', s):
        p=m.group(2)
        paths.add(p)
    for m in re.finditer(r'resolve\(import\.meta\.dir,\s*"\.\./([^"]+)"', s):
        paths.add(m.group(1))
    rel=["web/"+p for p in sorted(paths)]
    print("###", t)
    for p in rel:
        tag = "HEAD_WON" if p in headw else "UP_WON" if p in upw else "UNION" if p in un else "-"
        print("    ", tag, p)
