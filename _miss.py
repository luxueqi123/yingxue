import subprocess,sys,io,os
def blob(rev,p):
    r=subprocess.run(["git","cat-file","blob",rev+":"+p],capture_output=True)
    return r.stdout.decode("utf-8","replace").replace("\r\n","\n") if r.returncode==0 else None
p=sys.argv[1]
h=blob("98822b65",p); d=io.open(p,encoding="utf-8",errors="replace").read().replace("\r\n","\n")
u=blob("b9d60f98",p) or ""
hs=[x.rstrip() for x in (h or "").split("\n") if x.strip()]
ds=set(x.rstrip() for x in d.split("\n") if x.strip())
us=set(x.rstrip() for x in u.split("\n") if x.strip())
print("### MISSING HEAD LINES (not on disk) for",p)
for i,l in enumerate(hs):
    if l not in ds:
        mark="UPHAS" if l in us else "     "
        print("  %s  %s"%(mark,l[:150]))
