import io,subprocess,os,shutil,json
def blob(rev,p):
    r=subprocess.run(["git","cat-file","blob",rev+":"+p],capture_output=True)
    return r.stdout if r.returncode==0 else None
def state(p):
    def n(x): return x.replace(b"\r\n",b"\n") if x is not None else None
    h=n(blob("98822b65",p)); u=n(blob("b9d60f98",p))
    d=n(io.open(p,"rb").read()) if os.path.exists(p) else None
    if d is None: return "NO-DISK"
    if h is None: return "UP-only"
    if u is None: return "HEAD-only"
    if d==h: return "HEAD-won"
    if d==u: return "UP-won"
    return "UNION"
# 测试牵连的源文件
srcs=json.load(io.open("_srcs.json",encoding="utf-8"))
print("%-12s %s"%("STATE","PATH"))
for p in srcs:
    print("%-12s %s"%(state(p),p))
