import io, os, re, subprocess

ROOT = os.path.abspath(".")

def raw(path):
    p = os.path.join(ROOT, path.replace("/", os.sep))
    if not os.path.exists(p):
        return None
    return io.open(p, "rb").read()

def crlf_report(path):
    b = raw(path)
    if b is None:
        return "MISSING"
    crlf = b.count(b"\r\n")
    lf = b.count(b"\n") - crlf
    return "crlf=%d bare_lf=%d" % (crlf, lf)

print("== line endings on disk (integration tree) ==")
for p in ["web/src/styles/globals.css", "web/src/lib/app-theme.ts", "web/src/router.tsx",
          "web/src/pages/settings/index.tsx", "web/index.html", "web/test/workspace-route-loading.test.ts",
          "web/src/pages/auth/auth-scene.tsx", "web/src/components/brand/yingxue-brand-lockup.tsx",
          "web/src/pages/create/index.tsx", "backend/internal/app/model_catalog.go"]:
    print("  %-58s %s" % (p, crlf_report(p)))

print()
print("== .gitattributes ==")
b = raw(".gitattributes")
print(b.decode("utf-8", "replace")[:500] if b else "MISSING")

print()
print("== settings CSS anchor variants (binary search) ==")
g = raw("web/src/styles/globals.css").decode("utf-8", "replace")
for sel in [".app-user-workspace.settings-page .settings-preference-block", ".settings-preference-block"]:
    idx = 0
    n = 0
    while True:
        idx = g.find(sel + " {", idx)
        if idx < 0:
            break
        chunk = g[idx:idx + 120]
        print("   HIT %-60s %r" % (sel, chunk[:100]))
        idx += 1
        n += 1
        if n > 4:
            break
    if n == 0:
        print("   MISS %s" % sel)
print("   has '.settings-preference-heading { margin-bottom: var(--space-5); }':",
      ".settings-preference-heading { margin-bottom: var(--space-5); }" in g)
print("   has 'margin: 12px 24px 0;':", "margin: 12px 24px 0;" in g)
print("   has 'margin: 16px 24px 24px;':", "margin: 16px 24px 24px;" in g)
print("   has '.workspace-wallet-tabs {':", ".workspace-wallet-tabs {" in g)
