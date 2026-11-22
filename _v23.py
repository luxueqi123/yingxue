import json,subprocess
def blob(rev,p):
    r=subprocess.run(["git","cat-file","blob",rev+":"+p],capture_output=True)
    return None if r.returncode!=0 else r.stdout
def n(b): return b.replace(b"\r\n",b"\n") if b else b
pure=json.load(open("_purelist.json",encoding="utf-8"))
print("dir: %-68s %-8s %-8s"%("path","==HEAD","==UP"))
bad=[]
for r in pure:
    p=r["path"]; dk=open(p,"rb").read()
    h=blob("HEAD",p); m=blob("MERGE_HEAD",p)
    print("%-72s %-8s %-8s"%(p[:72], n(h)==n(dk), n(m)==n(dk)))
    if n(h)!=n(dk): bad.append(p)
print("\n非 HEAD 的:",bad)
