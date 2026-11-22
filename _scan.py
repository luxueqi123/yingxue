import io, os, re, sys, json

ROOT = os.path.abspath(sys.argv[1] if len(sys.argv) > 1 else ".")
TESTDIR = os.path.join(ROOT, "web", "test")

def read(p):
    try:
        return io.open(p, encoding="utf-8", errors="replace").read()
    except Exception:
        return None

def unescape(s):
    # decode JS string literal escapes
    out = []
    i = 0
    while i < len(s):
        c = s[i]
        if c == "\\" and i + 1 < len(s):
            n = s[i + 1]
            m = {"n": "\n", "t": "\t", "r": "\r", "\\": "\\", '"': '"', "'": "'", "`": "`", "0": "\0"}
            if n in m:
                out.append(m[n]); i += 2; continue
            if n == "u" and i + 5 < len(s):
                try:
                    out.append(chr(int(s[i + 2:i + 6], 16))); i += 6; continue
                except ValueError:
                    pass
            out.append(n); i += 2; continue
        out.append(c); i += 1
    return "".join(out)

STR_RE = re.compile(r'^(?:"((?:[^"\\]|\\.)*)"|\'((?:[^\'\\]|\\.)*)\'|`((?:[^`\\]|\\.)*)`)')

def take_string(text, pos):
    m = STR_RE.match(text, pos)
    if not m:
        return None, pos
    raw = next(g for g in m.groups() if g is not None)
    return unescape(raw), m.end()

VAR_RE = re.compile(
    r'const\s+([A-Za-z_$][\w$]*)\s*=\s*(?:readFileSync\(resolve\(import\.meta\.dir,\s*|source\(\s*|readSource\(\s*|read\w*Source\(\s*)'
    r'(?:"((?:[^"\\]|\\.)*)"|\'((?:[^\'\\]|\\.)*)\')')

CALL_RE = re.compile(r'([A-Za-z_$][\w$]*)\s*\(\s*(?:"((?:[^"\\]|\\.)*)"|\'((?:[^\'\\]|\\.)*)\')\s*\)')

def resolve(base, rel):
    return os.path.normpath(os.path.join(base, rel))

def scan_file(tf):
    text = read(tf)
    if text is None:
        return None
    tdir = os.path.dirname(tf)
    srcs = {}
    for m in re.finditer(
        r'const\s+([A-Za-z_$][\w$]*)\s*=\s*(?:readFileSync\(resolve\(import\.meta\.dir,\s*|(?:read[A-Za-z]*|source)\(\s*)'
        r'(?:"((?:[^"\\]|\\.)*)"|\'((?:[^\'\\]|\\.)*)\')\s*\)?\s*,?\s*"utf8"?\s*\)?', text):
        name = m.group(1); rel = m.group(2) or m.group(3)
        p = resolve(tdir, unescape(rel))
        srcs[name] = p
    # also map bare function calls used as source factories: const NAME = fn() -> handled elsewhere
    fn_body = {}
    for m in re.finditer(r'function\s+([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*\{', text):
        start = m.end()
        depth = 1; i = start
        while i < len(text) and depth:
            if text[i] == "{": depth += 1
            elif text[i] == "}": depth -= 1
            i += 1
        fn_body[m.group(1)] = text[start:i]
    for name, body in fn_body.items():
        mm = re.search(r'readFileSync\(resolve\(import\.meta\.dir,\s*(?:"((?:[^"\\]|\\.)*)"|\'((?:[^\'\\]|\\.)*)\')', body)
        if mm:
            srcs.setdefault(name, resolve(tdir, unescape(mm.group(1) or mm.group(2))))

    results = []
    pat = re.compile(r'expect\(\s*([A-Za-z_$][\w$]*)\s*\)\s*\.\s*(not\s*\.\s*)?toContain\(')
    for m in pat.finditer(text):
        var = m.group(1)
        neg = bool(m.group(2))
        val, end = take_string(text, m.end())
        if val is None:
            results.append((var, neg, None, "unparsed-arg", ""))
            continue
        line = text.count("\n", 0, m.start()) + 1
        p = srcs.get(var)
        if p is None or not os.path.exists(p):
            results.append((var, neg, None, "source-var-unresolved", p or "?"))
            continue
        s = read(p)
        lf = val
        crlf = val.replace("\n", "\r\n")
        hit_lf = lf in s
        hit_crlf = crlf in s
        results.append((var, neg, line, "LF" if hit_lf else ("CRLF" if hit_crlf else "MISS"), p))
    return results

if __name__ == "__main__":
    files = sys.argv[2:]
    for f in files:
        if os.path.isabs(f):
            tf = f
        elif f.replace("\\", "/").startswith("test/"):
            tf = os.path.join(ROOT, "web", f)
        else:
            tf = os.path.join(TESTDIR, f)
        res = scan_file(tf)
        print("### " + os.path.basename(tf))
        if res is None:
            print("   (unreadable)")
            continue
        for var, neg, line, status, p in res:
            flag = ""
            if status == "MISS":
                flag = "FAIL"
            elif status == "LF":
                flag = "FAIL" if neg else "ok"
            elif status == "CRLF":
                flag = "ok(crlf)" if not neg else "FAIL"
            else:
                flag = "?"
            if flag.startswith("FAIL") or flag == "?":
                shown = "?" if (not p or p == "?") else os.path.relpath(p, ROOT)
                print("   %-6s line=%-5s var=%-24s %s" % (flag, line, var, shown))
