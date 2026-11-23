import io,os,re,subprocess,json,sys
BUN=r"D:\天琊书客\项目\天琊映雪无限画布\.local\bun-runtime\oven\package\bin\bun.exe"
def list_files(root):
    out=[]
    for dirpath,dirs,files in os.walk(os.path.join(root,"web","test")):
        for f in files:
            if f.endswith((".test.ts",".test.tsx",".test.mjs",".test.js")):
                out.append(os.path.relpath(os.path.join(dirpath,f), os.path.join(root,"web")).replace("\\","/"))
    return sorted(out)
def run(root, rel):
    p=subprocess.run([BUN,"test",rel],cwd=os.path.join(root,"web"),capture_output=True,text=True,encoding="utf-8",errors="replace")
    s=(p.stdout or "")+(p.stderr or "")
    m=re.search(r"^\s*(\d+) pass\s*$", s, re.M)
    f=re.search(r"^\s*(\d+) fail\s*$", s, re.M)
    fails=[]
    for t in re.findall(r"^\s*\(fail\)\s*(.+?)(?:\s*\[\d+\.\d+ms\])?\s*$", s, re.M):
        fails.append(t.strip())
    seen=set(); uniq=[]
    for x in fails:
        if x not in seen: seen.add(x); uniq.append(x)
    return {"pass": int(m.group(1)) if m else None, "failcount": int(f.group(1)) if f else None, "fails": uniq}
root=sys.argv[1]
files=list_files(root)
res={}
for i,rel in enumerate(files):
    res[rel]=run(root,rel)
json.dump(res, io.open(sys.argv[2],"w",encoding="utf-8"), ensure_ascii=False, indent=1)
print("done", len(res), "with fails:", sum(1 for v in res.values() if v["fails"]), "unparsed:", sum(1 for v in res.values() if v["pass"] is None))
