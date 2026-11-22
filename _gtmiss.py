import io,re
h=io.open(".local/cache/_h_gt.ts",encoding="utf-8").read().replace("\r\n","\n").split("\n")
u=io.open(".local/cache/_u_gt.ts",encoding="utf-8").read().replace("\r\n","\n").split("\n")
d=io.open("web/src/services/api/generation-task.ts",encoding="utf-8").read().replace("\r\n","\n").split("\n")
print("HEAD",len(h),"UP",len(u),"disk",len(d))
def norm(ls): return [x.rstrip() for x in ls if x.strip()]
hn=norm(h); un=norm(u); dn=norm(d)
hs,us,ds=set(hn),set(un),set(dn)
print("\n== in HEAD and disk, not UP (HEAD-preserved) ==")
for x in hn:
    if x not in us and x in ds: pass
print("count:", sum(1 for x in hn if x not in us and x in ds))
print("\n== UP lines missing from disk ==")
miss=[x for x in un if x not in ds]
for x in miss[:40]: print("  UP->", x[:150])
print("count:", len(miss))
print("\n== HEAD lines missing from disk ==")
missh=[x for x in hn if x not in ds]
for x in missh[:60]: print("  HEAD->", x[:150])
print("count:", len(missh))
