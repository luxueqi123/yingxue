import subprocess,difflib
def blob(rev,p):
    r=subprocess.run(["git","cat-file","blob",rev+":"+p],capture_output=True)
    return None if r.returncode!=0 else r.stdout
def L(b): return b.replace(b"\r\n",b"\n").decode("utf-8","replace").splitlines()
p="web/src/pages/settings/index.tsx"
up=L(blob("MERGE_HEAD",p)); dk=L(open(p,"rb").read())
print("UP lines",len(up),"disk lines",len(dk))
# what disk has that UP lacks (映雪二开)
sm=difflib.SequenceMatcher(None,up,dk,autojunk=False)
print("\n=== 磁盘有、上游没有（映雪二开，需保留）===")
n=0
for t,i1,i2,j1,j2 in sm.get_opcodes():
    if t in ("insert","replace"):
        for l in dk[j1:j2]:
            if l.strip(): print("   +",l[:150]); n+=1
            if n>40: break
    if n>40: break
