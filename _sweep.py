import subprocess, io, os, sys
def sh(a):
    r = subprocess.run(a, capture_output=True, text=True, encoding="utf-8", errors="replace")
    return r.stdout
def tree(rev, prefix):
    return [p for p in sh(["git","ls-tree","-r","--name-only",rev,"--",prefix]).split() if p]
HEAD="98822b65"; UP="b9d60f98"
prefixes=["web/src","backend","canvas-agent/src","docs/content","plugins"]
def blob(rev,p):
    r=subprocess.run(["git","show","%s:%s"%(rev,p)],capture_output=True)
    if r.returncode!=0: return None
    return r.stdout.replace(b"\r\n",b"\n")
def disk(p):
    if not os.path.exists(p): return None
    with open(p,"rb") as f: return f.read().replace(b"\r\n",b"\n")
allp=set()
for pre in prefixes:
    allp |= set(tree(HEAD,pre)) | set(tree(UP,pre))
res={"head_only":[], "up_only":[], "union":[], "up_won":[], "head_won":[], "same":[]}
for p in sorted(allp):
    if p.startswith(".local/"): continue
    h=blob(HEAD,p); u=blob(UP,p); d=disk(p)
    if d is None: continue
    if h is not None and u is None: k="head_only"
    elif u is not None and h is None: k="up_only"
    elif h==u and d==h: k="same"
    elif d==h and d!=u: k="head_won"
    elif d==u and d!=h: k="up_won"
    else: k="union"
    res[k].append(p)
for k,v in res.items():
    print(k, len(v))
io.open("_sweep_upwon.txt","w",encoding="utf-8").write("\n".join(res["up_won"]))
io.open("_sweep_union.txt","w",encoding="utf-8").write("\n".join(res["union"]))
io.open("_sweep_headwon.txt","w",encoding="utf-8").write("\n".join(res["head_won"]))
