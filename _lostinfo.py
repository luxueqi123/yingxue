import subprocess,json
def blob(rev,p):
    r=subprocess.run(["git","cat-file","blob",rev+":"+p],capture_output=True)
    return None if r.returncode!=0 else r.stdout
def norm(b): return b.replace(b"\r\n",b"\n") if b else b
d=json.load(open("_upcheck.json",encoding="utf-8"))
print("%-72s %s" % ("path","upstream vs 映雪 diff lines"))
for p in d["lost"]:
    b=norm(blob("01a2d171",p)); m=norm(blob("MERGE_HEAD",p)); h=norm(blob("HEAD",p))
    import difflib
    du=len(list(difflib.unified_diff(b.decode("utf-8","replace").splitlines(),m.decode("utf-8","replace").splitlines(),lineterm="",n=0)))
    dh=len(list(difflib.unified_diff(b.decode("utf-8","replace").splitlines(),h.decode("utf-8","replace").splitlines(),lineterm="",n=0)))
    print("%-72s UP+%d  vs  映雪HEAD+%d" % (p[:72],du,dh))
