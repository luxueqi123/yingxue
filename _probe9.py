import io, os, re, subprocess

ROOT = os.path.abspath(".")

def git(rev, path):
    r = subprocess.run(["git", "cat-file", "blob", "%s:%s" % (rev, path)], capture_output=True)
    return None if r.returncode else r.stdout.decode("utf-8", "replace")

def disk(path):
    p = os.path.join(ROOT, path.replace("/", os.sep))
    return io.open(p, encoding="utf-8", errors="replace").read() if os.path.exists(p) else None

def titles(rev, path):
    t = git(rev, path)
    if t is None:
        return None
    return [x.strip() for x in re.findall(r'^\s*(?:test|describe)\(\s*"([^"]+)"', t, re.M)]

print("== workspace-route-loading.test.ts titles ==")
for name, t in [("BASE", titles("01a2d171", "web/test/workspace-route-loading.test.ts")),
                ("HEAD", titles("HEAD", "web/test/workspace-route-loading.test.ts")),
                ("UP", titles("MERGE_HEAD", "web/test/workspace-route-loading.test.ts")),
                ("disk", titles_disk := None)]:
    if name == "disk":
        p = os.path.join(ROOT, "web/test/workspace-route-loading.test.ts")
        t = [x.strip() for x in re.findall(r'^\s*(?:test|describe)\(\s*"([^"]+)"', io.open(p, encoding="utf-8").read(), re.M)]
    print("  --- %s (%d) ---" % (name, len(t) if t else 0))
    for x in (t or []):
        print("      " + x)

print()
print("== router.tsx brand/route markers ==")
for name, txt in [("BASE", git("01a2d171", "web/src/router.tsx")), ("HEAD", git("HEAD", "web/src/router.tsx")),
                  ("UP", git("MERGE_HEAD", "web/src/router.tsx")), ("disk", disk("web/src/router.tsx"))]:
    if txt is None:
        print("  %-5s MISSING" % name); continue
    marks = ['path: "/"', 'path: "/home"', "HomePage", "ShowcasePage", "WalletPage", 'path: "/wallet"',
             "loadWalletPage", "TestVoiceRecording", 'import("@/pages/test-voice-recording")',
             "FolderPreviewLab", "fullScreenDeferred(<LoginPage />)", "devRoutes"]
    print("  %-5s %s" % (name, " ".join(("+" if m in txt else ".") for m in marks)))
    print("        %s" % marks)

print()
print("== auth-scene.tsx brand markers ==")
for name, txt in [("BASE", git("01a2d171", "web/src/pages/auth/auth-scene.tsx")), ("HEAD", git("HEAD", "web/src/pages/auth/auth-scene.tsx")),
                  ("UP", git("MERGE_HEAD", "web/src/pages/auth/auth-scene.tsx")), ("disk", disk("web/src/pages/auth/auth-scene.tsx"))]:
    if txt is None:
        print("  %-5s MISSING" % name); continue
    marks = ["YINGXUE STUDIO", "YINGCE STUDIO", "YINGXUE ·", "YINGXUE"]
    print("  %-5s %s" % (name, " | ".join("%s=%s" % (m, m in txt) for m in marks)))
    for line in txt.splitlines():
        if "YINGXUE" in line or "YINGCE" in line:
            print("        %s" % line.strip()[:120])

print()
print("== sidebar nav markers ==")
for name, txt in [("HEAD", git("HEAD", "web/src/components/layout/workspace-sidebar-nav.tsx")),
                  ("UP", git("MERGE_HEAD", "web/src/components/layout/workspace-sidebar-nav.tsx")),
                  ("disk", disk("web/src/components/layout/workspace-sidebar-nav.tsx"))]:
    if txt is None:
        print("  %-5s MISSING" % name); continue
    marks = ['toolItem("create", "/")', 'to: "/create"', 'to: "/home"', 'id: "home"', "YingxueBrandLockup", "YingxueBrandMark", "Popover", "data-nav-id", "LayoutGroup"]
    print("  %-5s %s" % (name, " | ".join("%s=%s" % (m, m in txt) for m in marks)))
