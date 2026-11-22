import subprocess,io,os,difflib
def blob(rev,p):
    r=subprocess.run(["git","cat-file","blob",rev+":"+p],capture_output=True)
    return r.stdout.decode("utf-8","replace").replace("\r\n","\n") if r.returncode==0 else None
for p in ["web/src/services/api/image-models.ts"]:
    h=blob("98822b65",p); u=blob("b9d60f98",p); d=io.open(p,encoding="utf-8",errors="replace").read().replace("\r\n","\n") if os.path.exists(p) else None
    print("%-50s H=%s U=%s disk==U:%s"%(p,len(h or ""),len(u or ""),d==u))
    if h and u and h!=u:
        for l in difflib.unified_diff(u.split("\n"),h.split("\n"),"UP","HEAD",lineterm="",n=2): print("  ",l[:190])
