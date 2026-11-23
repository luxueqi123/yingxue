import io,os,re,subprocess
HEAD="98822b65"; UP="b9d60f98"; BASE="01a2d171"
def blob(rev,p):
    r=subprocess.run(["git","cat-file","blob",rev+":"+p],capture_output=True)
    return r.stdout if r.returncode==0 else None
files=[l.strip() for l in io.open("_failfiles.txt",encoding="utf-8") if l.strip()]
for f in files:
    p="web/"+f
    h=blob(HEAD,p); u=blob(UP,p); b=blob(BASE,p)
    disk=io.open(p,"rb").read() if os.path.exists(p) else None
    def sz(x): return len(x) if x is not None else -1
    print("%-60s H=%6d U=%6d B=%6d disk=%6d  d==H:%s d==U:%s" % (f, sz(h),sz(u),sz(b),sz(disk), disk==h, disk==u))
