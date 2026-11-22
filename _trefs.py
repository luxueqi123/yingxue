import io,os,re
files=[l.strip() for l in io.open("_failfiles.txt",encoding="utf-8") if l.strip()]
pat=re.compile(r"""["'`](\.\.?/[^"'`\n]+|\@/[^"'`\n]+)["'`]""")
for f in files:
    s=io.open(os.path.join("web",f),encoding="utf-8",errors="replace").read()
    paths=set()
    for m in re.finditer(r"(?:readFileSync|readFile|import)\s*\(?\s*[^,)]*?resolve\(__dirname,\s*([^)]*)\)", s):
        paths.add(m.group(1).strip())
    for m in re.finditer(r"readFileSync\(\s*([^,\)]+)", s):
        paths.add("RF:"+m.group(1).strip()[:90])
    for m in re.finditer(r"(?:fileURLToPath\(new URL\(|new URL\(|join\(ROOT,|join\(repoRoot,|join\(WAILS?)", s):
        paths.add("U:"+m.group(0)[:60])
    print("###",f)
    for p in sorted(paths): print("    ",p)
