import io,os,subprocess,sys,difflib
def blob(rev,p):
    r=subprocess.run(["git","cat-file","blob",rev+":"+p],capture_output=True)
    return r.stdout.decode("utf-8","replace").replace("\r\n","\n") if r.returncode==0 else None
rev=sys.argv[1]; p=sys.argv[2]
cur=io.open(p,encoding="utf-8",errors="replace").read().replace("\r\n","\n")
a=blob(rev,p)
if a is None: print("no blob"); sys.exit()
d=list(difflib.unified_diff(a.split("\n"), cur.split("\n"), fromfile=rev, tofile="disk", lineterm="", n=int(sys.argv[3]) if len(sys.argv)>3 else 2))
for l in d: print(l)
