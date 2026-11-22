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
# one batch for ALL needed blobs
need=set()
for p,s in M.items():
    need.add(s)
    if p in B: need.add(B[p])
    if p in H: need.add(H[p])
need=sorted(need)
pr=subprocess.run(["git","cat-file","--batch"],input=b"".join((s+"\n").encode() for s in need),capture_output=True)
buf=pr.stdout; blobs={}; i=0
while i<len(buf):
    nl=buf.find(b"\n",i)
    if nl<0: break
    hdr=buf[i:nl].split()
    if len(hdr)<3:
        i=nl+1; continue
    size=int(hdr[2]); blobs[hdr[0].decode()]=buf[nl+1:nl+1+size]; i=nl+1+size+1
def L(b): return b.replace(b"\r\n",b"\n").decode("utf-8","replace").splitlines()
rows=[]
for p,ms in sorted(M.items()):
    bs=B.get(p)
    if bs==ms: continue
    try: cur=open(p,"rb").read()
    except Exception: continue
    ub=blobs.get(ms,b""); bb=blobs.get(bs or "",b"")
    up=L(ub); cu=L(cur)
    if up==cu: continue
    sm=difflib.SequenceMatcher(None,up,cu,autojunk=False)
    up_only=sum(i2-i1 for tag,i1,i2,j1,j2 in sm.get_opcodes() if tag in ("delete","replace"))
    s2=difflib.SequenceMatcher(None,L(bb),up,autojunk=False)
    added=sum(i2-i1 for tag,i1,i2,j1,j2 in s2.get_opcodes() if tag in ("insert","replace"))
    deleted=sum(i2-i1 for tag,i1,i2,j1,j2 in s2.get_opcodes() if tag=="delete")
    rows.append({"path":p,"up_only":up_only,"up_added":added,"up_deleted":deleted,
                 "xue_touched": H.get(p)!=bs})
rows.sort(key=lambda r:-r["up_only"])
lost=[r for r in rows if r["up_only"]>0]
print("上游改过、磁盘不同的文件:",len(rows))
print("其中丢上游行的:",len(lost),"总丢行:",sum(r["up_only"] for r in lost))
print("  映雪未改(纯底座丢失):",sum(1 for r in lost if not r["xue_touched"]),"行:",sum(r["up_only"] for r in lost if not r["xue_touched"]))
print("  映雪也改过:",sum(1 for r in lost if r["xue_touched"]),"行:",sum(r["up_only"] for r in lost if r["xue_touched"]))
print()
for r in lost[:40]:
    print("  %-66s 丢%4d/上游新增%4d %s"%(r["path"][:66],r["up_only"],r["up_added"],"[映雪未改]" if not r["xue_touched"] else ""))
json.dump(rows,open("_updiff2.json","w",encoding="utf-8"),ensure_ascii=False,indent=1)
