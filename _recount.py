import subprocess,json
def tree(rev):
    r=subprocess.run(["git","ls-tree","-r","-z",rev],capture_output=True)
    out={}
    for rec in r.stdout.split(b"\0"):
        if not rec: continue
        meta,_,path=rec.partition(b"\t"); parts=meta.split()
        if parts[1]==b"blob": out[path.decode("utf-8","replace")]=parts[2].decode()
    return out
def idx():
    r=subprocess.run(["git","ls-files","-s","-z"],capture_output=True)
    out={}
    for rec in r.stdout.split(b"\0"):
        if not rec: continue
        meta,_,path=rec.partition(b"\t"); out[path.decode("utf-8","replace")]=meta.split()[1].decode()
    return out
B=tree("01a2d171"); H=tree("HEAD"); M=tree("MERGE_HEAD"); I=idx()
# 复算：上游改动是否落地
stat={"took_up":0,"kept_xue":0,"hand":0,"up_only_files":0}
lost=[]
for p,mh in M.items():
    if B.get(p)==mh: continue
    if p not in I: continue
    ih=I[p]
    if ih==mh: stat["took_up"]+=1
    elif ih==H.get(p): stat["kept_xue"]+=1; lost.append(p)
    else: stat["hand"]+=1
print("上游 v1.4.x→v1.5.5 改过的文件（索引内）:",sum(stat.values()))
print("   采用上游:",stat["took_up"])
print("   退回映雪(底座丢失):",stat["kept_xue"])
print("   手工合并:",stat["hand"])
json.dump(lost,open("_lost_after.json","w",encoding="utf-8"),ensure_ascii=False,indent=1)
print()
up_only=[p for p in M if p not in I]
print("上游有、索引完全没有的文件:",len(up_only))
for p in up_only[:20]: print("   ",p)
