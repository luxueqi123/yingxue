import subprocess,json
def tree(rev):
    r=subprocess.run(["git","ls-tree","-r","-z",rev],capture_output=True)
    out={}
    for rec in r.stdout.split(b"\0"):
        if not rec: continue
        meta,_,path=rec.partition(b"\t"); parts=meta.split()
        if parts[1]==b"blob": out[path.decode("utf-8","replace")]=parts[2].decode()
    return out
B=tree("01a2d171"); H=tree("HEAD"); M=tree("MERGE_HEAD")
rows={r["path"]:r for r in json.load(open("_lost_rows.json",encoding="utf-8"))}
pure={}; xue={}
for p,r in rows.items():
    if H.get(p)==B.get(p): pure[p]=r      # 映雪从未改过 → 纯底座丢失
    else: xue[p]=r
print("=== A. 映雪从未改过、上游改动被整份丢弃（纯底座丢失）===")
tot=0
for p,r in sorted(pure.items(),key=lambda x:-x[1]["missing"]):
    tot+=r["missing"]; print("   %-68s 真丢失%3d行 (上游改+%d/-%d)"%(p[:68],r["missing"],r["up_add"],r["up_del"]))
print("   小计: %d 个文件, %d 行"%(len(pure),tot))
print()
print("=== B. 映雪也改过（需人工并集）===")
tot2=0
for p,r in sorted(xue.items(),key=lambda x:-x[1]["missing"]):
    tot2+=r["missing"]; print("   %-68s 真丢失%3d行"%(p[:68],r["missing"]))
print("   小计: %d 个文件, %d 行"%(len(xue),tot2))
json.dump({"pure":list(pure),"xue":list(xue)},open("_lossets.json","w",encoding="utf-8"),ensure_ascii=False,indent=1)
