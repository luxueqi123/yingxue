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
    up_add=sum(i2-i1 for t,i1,i2,j1,j2 in sm.get_opcodes() if t in ("insert","replace"))
    up_del=sum(i2-i1 for t,i1,i2,j1,j2 in sm.get_opcodes() if t=="delete")
    # 上游新增的行里，有多少在 disk 里找不到
    up_new=set()
    for t,i1,i2,j1,j2 in sm.get_opcodes():
        if t in ("insert","replace"):
            for k in range(i1,i2): up_new.add(up[k].strip())
    dk_set={l.strip() for l in dk}
    missing_new=sum(1 for l in up_new if l and l not in dk_set)
    rows.append((p,up_add,up_del,missing_new))
rows.sort(key=lambda r:-r[3])
print("%-70s %6s %6s %8s"%("path","UP+","UP-","真丢失新行"))
for p,a,d,m in rows: print("%-70s %6d %6d %8d"%(p[:70],a,d,m))
print()
tot=sum(r[3] for r in rows)
print("23 个文件里，上游新增行真正没落到磁盘的合计:",tot)
print("其中 >0 的:",[ (r[0],r[3]) for r in rows if r[3]>0])
json.dump(rows,open("_lost_rows.json","w",encoding="utf-8"),ensure_ascii=False,indent=1)
