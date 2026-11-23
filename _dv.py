import io,os,subprocess,sys,difflib
AM="27356091de8b043cedf9a2f65e3fc95ae42f311a"
HEAD="98822b65"; UP="b9d60f98"; BASE="01a2d171"
def blob(rev,p):
    r=subprocess.run(["git","cat-file","blob",rev+":"+p],capture_output=True)
    return r.stdout.decode("utf-8","replace").replace("\r\n","\n") if r.returncode==0 else None
p=sys.argv[1]; n=int(sys.argv[2]) if len(sys.argv)>2 else 2
cur=io.open(p,encoding="utf-8",errors="replace").read().replace("\r\n","\n")
for rev,label in [(AM,"AM"),(HEAD,"HEAD"),(UP,"UP")]:
    b=blob(rev,p)
    print("==== %s  present=%s len=%s" % (label, b is not None, len(b) if b else -1))
print("==== DIFF HEAD -> disk")
for l in difflib.unified_diff((blob(HEAD,p) or "").split("\n"), cur.split("\n"), "HEAD","disk",lineterm="",n=n): print(l)
