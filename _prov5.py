import subprocess,io,os
paths=['web/src/lib/canvas/ltv-kling-options.ts','web/src/lib/canvas/ltv-native-project.ts','web/src/pages/canvas/canvas-media-generation-executors.ts','web/src/lib/canvas/canvas-project-generation.ts','web/src/services/api/resources.ts','web/src/services/api/resource-blob.ts']
def blob(rev,p):
    r=subprocess.run(["git","cat-file","blob",rev+":"+p],capture_output=True)
    return r.stdout.decode("utf-8","replace").replace("\r\n","\n") if r.returncode==0 else None
def n(x): return x.replace("\r\n","\n") if x is not None else None
for p in paths:
    h=n(blob("98822b65",p)); u=n(blob("b9d60f98",p)); b=n(blob("01a2d171",p))
    d=n(io.open(p,"rb").read().decode("utf-8","replace")) if os.path.exists(p) else None
    st="NO-DISK"
    if d is not None:
        if h==d: st="HEAD-won"
        elif u==d: st="UP-won"
        elif h is None: st="UP-only"
        elif u is None: st="HEAD-only"
        elif h==u: st="same"
        else: st="UNION"
    print("%-11s %-52s H=%d U=%d B=%d" % (st,p,len(h or ""),len(u or ""),len(b or "")))
