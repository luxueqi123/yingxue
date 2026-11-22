import subprocess,json,os
def blob(rev,p):
    r=subprocess.run(["git","cat-file","blob",rev+":"+p],capture_output=True)
    return None if r.returncode!=0 else r.stdout
def tree(rev):
    r=subprocess.run(["git","ls-tree","-r","-z",rev],capture_output=True)
    out={}
    for rec in r.stdout.split(b"\0"):
        if not rec: continue
        meta,_,path=rec.partition(b"\t"); parts=meta.split()
        if parts[1]==b"blob": out[path.decode("utf-8","replace")]=parts[2].decode()
    return out
B=tree("01a2d171"); H=tree("HEAD")
d=json.load(open("_lossets.json",encoding="utf-8"))
pure=d["pure"]
print("=== 检查：采用上游版后，映雪侧是否有调用方依赖被移除的 API ===")
import re
ID=re.compile(r"[A-Za-z_][A-Za-z0-9_]{3,}")
# collect symbols removed by upstream for each file
for p in pure[:8]:
    up=blob("MERGE_HEAD",p).decode("utf-8","replace")
    cur=open(p,"rb").read().decode("utf-8","replace")
    removed=[s for s in set(ID.findall(cur))-set(ID.findall(up)) if len(s)>5]
    # find external callers in the repo (exclude self)
    hits={}
    for s in removed:
        r=subprocess.run(["git","grep","-l","-I",s,"--","."],capture_output=True)
        fs=[x for x in r.stdout.decode("utf-8","replace").splitlines() if x and x!=p]
        if fs: hits[s]=fs[:3]
    print("\n###",p)
    if not hits: print("   (无外部引用被移除的符号 -> 可直接采用上游)")
    for s,fs in list(hits.items())[:6]:
        print("   %-42s 被引用于: %s"%(s,fs))
