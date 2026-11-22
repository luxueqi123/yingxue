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
lost=json.load(open("_uplost.json",encoding="utf-8"))
pure=[(p,n) for p,n in lost.items() if H.get(p)==B.get(p)]
print("lost 文件总数:",len(lost))
print("  其中『映雪未改』:",len(pure),"→ 丢失行:",sum(n for _,n in pure))
both=len(lost)-len(pure)
print("  其中『映雪也改过』:",both,"→ 丢失行:",sum(n for _,n in lost.items())-sum(n for _,n in pure))
print()
print("=== 映雪未改却丢底座的文件（这些是纯回归）===")
for p,n in sorted(pure,key=lambda x:-x[1]):
    print("  %-72s 丢%d行" % (p[:72],n))
print()
print("=== 索引缺失的 3 个文件，磁盘状态 ===")
import os
for p in ["backend/internal/app/channel_outbound.go","web/FRONTEND_FEATURE_TOGGLE.md","web/src/components/conversation/IMPLEMENTATION.md"]:
    print("  %-60s diskExists=%s  inHEAD=%s inUP=%s" % (p, os.path.exists(p), p in H, p in M))
