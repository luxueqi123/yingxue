import io, os, re, json, subprocess

ROOT = os.path.abspath(".")
TESTDIR = os.path.join(ROOT, "web", "test")

# find test assertions whose expected string contains an escaped newline (\n) => LF-sensitive
PAT = re.compile(r'toContain\(\s*(?:"((?:[^"\\]|\\.)*)"|\'((?:[^\'\\]|\\.)*)\')')
SRCVAR = re.compile(r'(?:readFileSync\(resolve\(import\.meta\.dir,\s*|(?:read[A-Za-z]*|source)\(\s*)'
                    r'(?:"((?:[^"\\]|\\.)*)"|\'((?:[^\'\\]|\\.)*)\')')

hits = []
for fn in sorted(os.listdir(TESTDIR)):
    if not fn.endswith((".ts", ".tsx", ".mts", ".mjs")):
        continue
    p = os.path.join(TESTDIR, fn)
    text = io.open(p, encoding="utf-8", errors="replace").read()
    if "\\n" not in text:
        continue
    for m in PAT.finditer(text):
        raw = m.group(1) if m.group(1) is not None else m.group(2)
        if "\\n" not in raw:
            continue
        # find nearest preceding readFileSync/resolve(...) path
        pre = text[:m.start()]
        mm = None
        for cand in SRCVAR.finditer(pre):
            mm = cand
        target = (mm.group(1) or mm.group(2)) if mm else "?"
        line = text.count("\n", 0, m.start()) + 1
        hits.append((fn, line, target, raw[:80]))

print("LF-sensitive toContain assertions: %d" % len(hits))
byline = {}
for fn, line, target, raw in hits:
    print("  %-46s L%-5d -> %-52s %r" % (fn, line, target, raw))
