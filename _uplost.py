import subprocess,json,difflib,collections
def tree(rev):
    r=subprocess.run(["git","ls-tree","-r","-z",rev],capture_output=True)
    out={}
    for rec in r.stdout.split(b"\0"):
        if not rec: continue
        meta,_,path=rec.partition(b"\t"); parts=meta.split()
        if parts[1]==b"blob": out[path.decode("utf-8","replace")]=parts[2].decode()
    return out
B=tree("01a2d171"); H=tree("HEAD"); M=tree("MERGE_HEAD")
# batch-fetch upstream blobs
want={p:s for p,s in M.items() if B.get(p)!=s}
req=b"".join((s+"\n").encode() for s in set(want.values()))
pr=subprocess.run(["git","cat-file","--batch"],input=req,capture_output=True)
data={}; i=0; buf=pr.stdout
while i<len(buf):
    nl=buf.find(b"\n",i)
    if nl<0: break
    hdr=buf[i:nl].split()
    if len(hdr)<3: break
    size=int(hdr[2]); body=buf[nl+1:nl+1+size]
    data[hdr[0].decode()]=body
    i=nl+1+size+1
def norm(b): return b.replace(b"\r\n",b"\n")
def lines(b): return norm(b).decode("utf-8","replace").splitlines()
lost_by_file={}
for p,s in want.items():
    try: disk=open(p,"rb").read()
    except Exception: continue
    up=lines(data[s]); dk=lines(disk)
    if up==dk: continue
    sm=difflib.SequenceMatcher(None,up,dk,autojunk=False)
    missing=0
    for tag,i1,i2,j1,j2 in sm.get_opcodes():
        if tag in ("delete","replace"): missing+=(i2-i1)
    if missing>0: lost_by_file[p]=missing
print("上游改过且索引存在的文件:",len(want))
print("其中『上游底座行丢失』的文件:",len(lost_by_file))
print("累计丢失上游行数:",sum(lost_by_file.values()))
json.dump(lost_by_file,open("_uplost.json","w",encoding="utf-8"),ensure_ascii=False,indent=1)
print("\n=== 丢失上游行最多的 40 个 ===")
for p,n in sorted(lost_by_file.items(),key=lambda x:-x[1])[:40]:
    b=B.get(p); h=H.get(p)
    tag = "映雪未改" if h==b else "映雪也改过"
    print("  %-70s 丢%-5d %s" % (p[:70],n,tag))
