import io, subprocess, os, sys

ROOT = os.path.abspath(".")

def git(rev, path):
    r = subprocess.run(["git", "cat-file", "blob", "%s:%s" % (rev, path)], capture_output=True)
    if r.returncode:
        return None
    return r.stdout.decode("utf-8", "replace")

def disk(path):
    p = os.path.join(ROOT, path.replace("/", os.sep))
    if not os.path.exists(p):
        return None
    return io.open(p, encoding="utf-8", errors="replace").read()

def blob(rev, path):
    s = git(rev, path)
    if s is None:
        return None
    return io.open(".local/cache/upstream-v129-reference/" + path.replace("/", os.sep), encoding="utf-8", errors="replace").read()

def same(a, b):
    if a is None or b is None:
        return None
    return a.replace("\r\n", "\n") == b.replace("\r\n", "\n")

targets = [
    "web/test/workspace-route-loading.test.ts",
    "web/test/site-appearance-and-skins.test.ts",
    "web/test/skin-button-fill.test.ts",
    "web/src/services/user-data-sync.ts",
    "web/src/pages/settings/index.tsx",
    "web/src/lib/user-session.ts",
    "web/src/services/api/logical-models.ts",
    "backend/internal/app/model_catalog.go",
    "backend/internal/service/model_catalog.go",
    "web/src/lib/app-theme.ts",
    "web/src/styles/globals.css",
]

for t in targets:
    h, u, d = git("HEAD", t), git("MERGE_HEAD", t), disk(t)
    row = []
    row.append("HEAD=%s" % ("-" if h is None else len(h)))
    row.append("UP=%s" % ("-" if u is None else len(u)))
    row.append("disk=%s" % ("-" if d is None else len(d)))
    row.append("disk==UP:%s" % same(d, u))
    row.append("disk==HEAD:%s" % same(d, h))
    row.append("HEAD==UP:%s" % same(h, u))
    print("%-52s %s" % (t, "  ".join(row)))

print()
print("=== workspace-route-loading.test.ts: HEAD vs UP ===")
h = git("HEAD", "web/test/workspace-route-loading.test.ts")
u = git("MERGE_HEAD", "web/test/workspace-route-loading.test.ts")
if h is not None and u is not None and h != u:
    print("DIFFERENT (normalized: %s)" % same(h, u))
else:
    print("identical or missing")

print()
print("=== user-data-sync: does disk keep 映雪 createCanvasProjectWithRemoteSync? ===")
d = disk("web/src/services/user-data-sync.ts")
for needle in ["createCanvasProjectWithRemoteSync", "preserveCanvasSyncDraft", "rebindInconsistentCanvasAssets", "applyAgentCanvasPatches", "loadCanvasProjectForEditing", "Number.isSafeInteger(source.revision)", "readAllCanvasSyncDrafts"]:
    print("   %-42s HEAD=%-5s UP=%-5s disk=%s" % (
        needle,
        "-" if h is None or git("HEAD", "web/src/services/user-data-sync.ts") is None else (needle in git("HEAD", "web/src/services/user-data-sync.ts")),
        needle in (git("MERGE_HEAD", "web/src/services/user-data-sync.ts") or ""),
        needle in (d or "")))
