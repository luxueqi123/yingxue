import io, os, re, subprocess

ROOT = os.path.abspath(".")
BASE = "01a2d171"

def git(rev, path):
    r = subprocess.run(["git", "cat-file", "blob", "%s:%s" % (rev, path)], capture_output=True)
    return None if r.returncode else r.stdout.decode("utf-8", "replace")

def disk(path):
    p = os.path.join(ROOT, path.replace("/", os.sep))
    return io.open(p, encoding="utf-8", errors="replace").read() if os.path.exists(p) else None

def row(path, needles):
    cells = []
    for name, txt in [("BASE", git(BASE, path)), ("HEAD", git("HEAD", path)), ("UP", git("MERGE_HEAD", path)), ("disk", disk(path))]:
        if txt is None:
            cells.append("%s=MISSING" % name)
        else:
            cells.append("%s=%s" % (name, "".join("Y" if n in txt else "-" for n in needles)))
    print("  %-46s %s" % (path.split("/")[-1], "  ".join(cells)))
    print("  %-46s needles: %s" % ("", needles))

print("== model catalog frontend/system ==")
row("web/src/services/api/logical-models.ts", ['"frontend"', '"system"', "managedModelChannels"])
row("web/src/lib/user-session.ts", ['"frontend"', "managedModelChannels", "projectLogicalCapability"])
row("backend/internal/app/model_catalog.go", ['"frontend"', '"system"'])
row("backend/internal/app/channel_model_catalog.go", ['"frontend"', '"system"'])
row("web/test/user-scoped-generation-persistence.test.ts", ['source: "frontend"', "managedModelChannels"])

print()
print("== 映雪 brand: does cyan appear on disk? ==")
hits = {}
for dirpath, dirnames, filenames in os.walk(ROOT):
    dirnames[:] = [d for d in dirnames if d not in (".git", "node_modules", "dist", ".local", "releases")]
    for fn in filenames:
        if not fn.endswith((".ts", ".tsx", ".css", ".mdx", ".md", ".json", ".html")):
            continue
        p = os.path.join(dirpath, fn)
        try:
            s = io.open(p, encoding="utf-8", errors="replace").read()
        except Exception:
            continue
        if "09caf5" in s.lower():
            hits[os.path.relpath(p, ROOT)] = s.lower().count("09caf5")
for k in sorted(hits, key=lambda x: -hits[x])[:20]:
    print("   %-70s %d" % (k, hits[k]))

print()
print("== site-appearance / skin class in _cls6 ==")
for line in io.open("_cls6.txt", encoding="utf-8", errors="replace"):
    if "site-appearance" in line or "skin-button-fill" in line or "primary-buttons" in line or "settings-preference" in line or "app-theme.test" in line or "workspace-route-loading" in line:
        print("   " + line.strip())
