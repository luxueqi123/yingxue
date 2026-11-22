import io,os,subprocess,sys
HEAD="98822b65"; UP="b9d60f98"
def blob(rev,p):
    r=subprocess.run(["git","cat-file","blob",rev+":"+p],capture_output=True)
    return r.stdout if r.returncode==0 else None
def norm(x):
    return x.replace(b"\r\n",b"\n") if x is not None else None
def state(p):
    h=norm(blob(HEAD,p)); u=norm(blob(UP,p))
    d=norm(io.open(p,"rb").read()) if os.path.exists(p) else None
    if d is None: return "NO-DISK"
    if h is None and u is None: return "??"
    if h is None: return "UP-only"
    if u is None: return "HEAD-only"
    if h==u: return "same"
    if d==h: return "HEAD-won"
    if d==u: return "UP-won"
    return "UNION"
paths=[l.strip() for l in io.open(sys.argv[1],encoding="utf-8") if l.strip()]
for p in paths:
    print("%-14s %s" % (state(p), p))
