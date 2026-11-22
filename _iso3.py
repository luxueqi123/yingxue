import io,os,re,subprocess,json,sys
BUN=r"D:\天琊书客\项目\天琊映雪无限画布\.local\bun-runtime\oven\package\bin\bun.exe"
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
    return {"pass": int(m.group(1)) if m else None, "failcount": int(f.group(1)) if f else None, "fails": uniq, "raw_tail": s[-1500:] if (m is None) else ""}
root=sys.argv[1]
files=[l.strip() for l in io.open(sys.argv[2],encoding="utf-8") if l.strip()]
res={}
for rel in files:
    res[rel]=run(root,rel)
    print(rel, "pass",res[rel]["pass"],"fail",res[rel]["failcount"])
json.dump(res, io.open(sys.argv[3],"w",encoding="utf-8"), ensure_ascii=False, indent=1)
