import io,os,re
files=[l.strip() for l in io.open("_failfiles.txt",encoding="utf-8") if l.strip()]
for f in files:
    s=io.open(os.path.join("web",f),encoding="utf-8",errors="replace").read()
    refs=set()
    for m in re.finditer(r"new URL\(\s*\"([^\"]+)\"\s*,\s*import\.meta\.url\s*\)", s): refs.add(m.group(1))
    for m in re.finditer(r"resolve\(import\.meta\.dir,\s*\"([^\"]+)\"", s): refs.add("dir:"+m.group(1))
    for m in re.finditer(r"resolve\(import\.meta\.dir,\s*\.\.\.,\s*\"([^\"]+)\"", s): refs.add("dir:"+m.group(1))
    for m in re.finditer(r"\"(\.\./src/[^\"]+)\"", s): refs.add(m.group(1))
    for m in re.finditer(r"\"(\.\./[a-zA-Z0-9_\-/\.]+\.(?:ts|tsx|mjs|js|json|go))\"", s): refs.add(m.group(1))
    print("###",f)
    for r in sorted(refs): print("     ",r)
