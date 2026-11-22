import subprocess,json,difflib
def tree(rev):
    r=subprocess.run(["git","ls-tree","-r","-z",rev],capture_output=True)
    out={}
    for rec in r.stdout.split(b"\0"):
        if not rec: continue
        meta,_,path=rec.partition(b"\t"); parts=meta.split()
        if parts[1]==b"blob": out[path.decode("utf-8","replace")]=parts[2].decode()
    return out
B=tree("01a2d171"); H=tree("HEAD"); M=tree("MERGE_HEAD")
want={p:s for p,s in M.items() if B.get(p)!=s}
req=b"".join((s+"\n").encode() for s in set(want.values()))
pr=subprocess.run(["git","cat-file","--batch"],input=req,capture_output=True)
buf=pr.stdout; blobs={}; i=0
while i<len(buf):
    nl=buf.find(b"\n",i)
    if nl<0: break
    hdr=buf[i:nl].split()
    if len(hdr)<3: break
    size=int(hdr[2]); blobs[hdr[0].decode()]=buf[nl+1:nl+1+size]; i=nl+1+size+1
def L(b): return b.replace(b"\r\n",b"\n").decode("utf-8","replace").splitlines()
res={}
for p,s in want.items():
    try: dk=open(p,"rb").read()
    except Exception: continue
    up=L(blobs[s]); cu=L(dk)
    sm=difflib.SequenceMatcher(None,up,cu,autojunk=False)
    up_only=0; disk_only=0
    for tag,i1,i2,j1,j2 in sm.get_opcodes():
        if tag=="delete": up_only+=(i2-i1)
        elif tag=="replace": up_only+=(i2-i1); disk_only+=(j2-j1)
        elif tag=="insert": disk_only+=(j2-j1)
    bg=B.get(p); hg=H.get(p)
    baseline= len(L(blobs[s]))  # up
    # how much of UP's additions vs base did we keep?
    if up_only or disk_only:
        res[p]={"up_only":up_only,"disk_only":disk_only,
                "upstream_touched_xue": hg!=bg,
                "up_added":None}
# compute: UP added lines relative to BASE
for p,s in want.items():
    if p not in res: continue
    base=blobs.get(B.get(p))
    if base is None:
        r=subprocess.run(["git","cat-file","blob","01a2d171:"+p],capture_output=True)
        base=r.stdout if r.returncode==0 else b""
    a=L(base); b=res[p]
    ub=blobs[s]
    sm=difflib.SequenceMatcher(None,L(base),L(ub),autojunk=False)
    added=sum(i2-i1 for tag,i1,i2,j1,j2 in sm.get_opcodes() if tag in ("insert","replace"))
    b["up_added_vs_base"]=added
    b["up_deleted_vs_base"]=sum(i2-i1 for tag,i1,i2,j1,j2 in sm.get_opcodes() if tag=="delete")
    b["disk_kept_of_base"]=None
print("上游改过的文件(索引存在):",len(want))
print("磁盘与上游不同的文件:",len(res))
print()
true_lost=[(p,v) for p,v in res.items() if v["up_only"]>0]
print("=== 真丢底座：上游有、磁盘没有的行 ===")
print("文件数:",len(true_lost),"总行数:",sum(v["up_only"] for _,v in true_lost))
for p,v in sorted(true_lost,key=lambda x:-x[1]["up_only"])[:30]:
    print("  %-68s 丢%4d 行 (上游本版新增%d行) %s" % (p[:68],v["up_only"],v["up_added_vs_base"],"映雪也改过" if v["upstream_touched_xue"] else "映雪未改"))
json.dump({p:v for p,v in res.items()},open("_updiff.json","w",encoding="utf-8"),ensure_ascii=False,indent=1)
