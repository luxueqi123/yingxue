import io,subprocess,difflib,sys
def t(rev,p):
    r=subprocess.run(["git","cat-file","blob",rev+":"+p],capture_output=True)
    return None if r.returncode else r.stdout.decode("utf-8","replace").replace("\r\n","\n")
p=sys.argv[1]
d=io.open(p,encoding="utf-8",errors="replace").read().replace("\r\n","\n")
for rev,name in [("HEAD","映雪HEAD"),("MERGE_HEAD","上游UP")]:
    a=t(rev,p)
    print("#### disk vs %s"%name)
    if a is None: print("  (not in %s)"%name); continue
    print("\n".join(difflib.unified_diff(a.split("\n"),d.split("\n"),name,"disk",lineterm="",n=2)))
