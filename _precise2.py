import subprocess,difflib,json
def blob(rev,p):
    r=subprocess.run(["git","cat-file","blob",rev+":"+p],capture_output=True)
    return None if r.returncode!=0 else r.stdout
def L(b): return b.replace(b"\r\n",b"\n").decode("utf-8","replace").splitlines()
lost=json.load(open("_lost_split.json",encoding="utf-8"))["full"]
rows=[]
for p in lost:
    bs=L(blob("01a2d171",p)); up=L(blob("MERGE_HEAD",p)); dk=L(open(p,"rb").read())
    sm=difflib.SequenceMatcher(None,bs,up,autojunk=False)
    up_add=sum(j2-j1 for t,i1,i2,j1,j2 in sm.get_opcodes() if t in ("insert","replace"))
    up_del=sum(i2-i1 for t,i1,i2,j1,j2 in sm.get_opcodes() if t=="delete")
    up_new=[]
    for t,i1,i2,j1,j2 in sm.get_opcodes():
        if t in ("insert","replace"): up_new.extend(up[j1:j2])
    dk_set={l.strip() for l in dk}
    missing=[l for l in up_new if l.strip() and l.strip() not in dk_set]
    rows.append({"path":p,"up_add":up_add,"up_del":up_del,"missing":len(missing),
                 "samples":[l.strip()[:100] for l in missing[:4]]})
rows.sort(key=lambda r:-r["missing"])
print("%-68s %5s %5s %7s"%("path","UP+","UP-","真丢失"))
for r in rows: print("%-68s %5d %5d %7d"%(r["path"][:68],r["up_add"],r["up_del"],r["missing"]))
tot=sum(r["missing"] for r in rows)
print("\n合计真正没落盘的上游新增行:",tot)
print("\n有丢失的文件明细：")
for r in rows:
    if r["missing"]: print("  %s (%d 行)"%(r["path"],r["missing"])); 
    for s in r["samples"]: print("       ",s)
json.dump(rows,open("_lost_rows.json","w",encoding="utf-8"),ensure_ascii=False,indent=1)
