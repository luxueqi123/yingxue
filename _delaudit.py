import subprocess
def files(rev):
    r=subprocess.run(["git","ls-tree","-r","-z","--name-only",rev],capture_output=True)
    return set(x for x in r.stdout.decode("utf-8","replace").split("\0") if x)
H=files("HEAD"); M=files("MERGE_HEAD"); B=files("01a2d171")
idx=set(subprocess.run(["git","ls-files","-z"],capture_output=True).stdout.decode("utf-8","replace").split("\0"))
idx.discard("")
print("HEAD files",len(H),"MERGE",len(M),"base",len(B),"index",len(idx))
# A) upstream deleted, still present in index
deleted_by_up = (H - M) & idx
unmodified_yx = set()
modified_yx = set()
for p in sorted(deleted_by_up):
    r=subprocess.run(["git","rev-parse","HEAD:"+p],capture_output=True,text=True)
    b=subprocess.run(["git","rev-parse","01a2d171:"+p],capture_output=True,text=True)
    if b.returncode!=0:
        modified_yx.add(p)      # not in base at all -> 映雪新增
    elif r.stdout.strip()==b.stdout.strip():
        unmodified_yx.add(p)    # identical to base -> 映雪没碰
    else:
        modified_yx.add(p)      # 映雪改过
print("upstream-deleted & kept in index:",len(deleted_by_up))
print("  -> 映雪未修改(应随上游删除):",len(unmodified_yx))
print("  -> 映雪改过/新增(应保留):",len(modified_yx))
import collections
def top(s,n=25):
    c=collections.Counter(p.split("/")[0]+"/"+(p.split("/")[1] if "/" in p else "") for p in s)
    for k,v in c.most_common(n): print("      %-40s %d"%(k,v))
print("  未修改 top dirs:"); top(unmodified_yx)
print("  保留 top dirs:"); top(modified_yx)
open("_del_audit.txt","w",encoding="utf-8").write(
 "=== upstream-deleted, kept, 映雪未修改 (%d) ===\n"%len(unmodified_yx)+"\n".join(sorted(unmodified_yx))+
 "\n\n=== upstream-deleted, kept, 映雪改过/新增 (%d) ===\n"%len(modified_yx)+"\n".join(sorted(modified_yx))+"\n")
