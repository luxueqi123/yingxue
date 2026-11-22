import subprocess,sys
def blob(rev,p):
    r=subprocess.run(["git","cat-file","blob",rev+":"+p],capture_output=True)
    return r.stdout.decode("utf-8","replace").replace("\r\n","\n") if r.returncode==0 else None
BASE="01a2d171"
for p in sys.argv[1:]:
    for rev in ["98822b65","b9d60f98"]:
        s=blob(rev,p); b=blob(BASE,p)
        if s is None: print(p,rev,"ABSENT"); continue
        sl=s.split("\n"); bl=(b or "").split("\n")
        import difflib
        add=[l for l in difflib.unified_diff(bl,sl,lineterm="",n=0) if l.startswith("+") and not l.startswith("+++")]
        rem=[l for l in difflib.unified_diff(bl,sl,lineterm="",n=0) if l.startswith("-") and not l.startswith("---")]
        print("%-50s %-9s +%d -%d (vs BASE)" % (p,rev,len(add),len(rem)))
