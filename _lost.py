import subprocess,io,os,json
BASE="01a2d171"; HEAD="98822b65"; UP="b9d60f98"
def tree(rev,prefix):
    return set(p for p in subprocess.run(["git","ls-tree","-r","--name-only",rev,"--",prefix],capture_output=True,text=True,encoding="utf-8").stdout.split() if p)
def blob(rev,p):
    r=subprocess.run(["git","show","%s:%s"%(rev,p)],capture_output=True)
    return None if r.returncode!=0 else r.stdout.replace(b"\r\n",b"\n")
def disk(p):
    return io.open(p,"rb").read().replace(b"\r\n",b"\n") if os.path.exists(p) else None
prefixes=["web/src","backend","canvas-agent/src","plugins","docs/content"]
allp=set()
for pre in prefixes:
    allp |= tree(HEAD,pre) | tree(UP,pre) | tree(BASE,pre)
lost=[]; union_lost=[]; ok_head=[]
for p in sorted(allp):
    h=blob(HEAD,p); u=blob(UP,p); b=blob(BASE,p); d=disk(p)
    if d is None: continue
    if h is None or b is None: continue   # only files 映雪 had modified vs base
    if h==b: continue                      # 映雪 didn't touch
    # 映雪 modified this file relative to base
    if u is None:
        if d!=h: lost.append((p,"HEAD-ONLY file but disk != HEAD"))
        continue
    if d==u: lost.append((p,"disk==UPSTREAM, 映雪改动丢失" + ("" if u!=h else "; UP==HEAD")))
    elif d==h: ok_head.append(p)
    else:
        # union: check if HEAD-only hunks survive
        hn=set(x.rstrip() for x in h.decode("utf-8","replace").split("\n") if x.strip())
        dn=set(x.rstrip() for x in d.decode("utf-8","replace").split("\n") if x.strip())
        missing=[x for x in hn if x not in dn and x not in (b.decode("utf-8","replace").split("\n") if b else [])]
        if missing: union_lost.append((p,len(missing)))
print("=== 映雪 modification LOST (disk==upstream) ===", len(lost))
for p,r in lost: print("  ",p)
print("\n=== UNION files with HEAD-only lines dropped ===", len(union_lost))
for p,n in union_lost: print("   %3d %s"%(n,p))
print("\n=== HEAD preserved ok:", len(ok_head))
