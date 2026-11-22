import subprocess,os,json
def ls(rev,p=""):
    r=subprocess.run(["git","ls-tree","-r","-z","--name-only",rev]+(["--",p] if p else []),capture_output=True)
    return set(x for x in r.stdout.decode("utf-8","replace").split("\0") if x)
def sha(rev,p):
    r=subprocess.run(["git","rev-parse",rev+":"+p],capture_output=True,text=True)
    return r.stdout.strip() if r.returncode==0 else None
def sha_idx(p):
    r=subprocess.run(["git","rev-parse",":"+p],capture_output=True,text=True)
    return r.stdout.strip() if r.returncode==0 else None
B=ls("01a2d171"); H=ls("HEAD"); M=ls("MERGE_HEAD"); I=ls("")
def blob(rev,p):
    r=subprocess.run(["git","cat-file","blob",rev+":"+p],capture_output=True)
    return None if r.returncode!=0 else r.stdout
def norm(b): return b.replace(b"\r\n",b"\n") if b else b
lost=[]; adopted=[]; merged_ok=[]; other=[]
for p in sorted(M):
    b=sha("01a2d171",p); m=sha("MERGE_HEAD",p)
    if b==m: continue           # upstream未改
    if p not in I: continue
    h=sha("HEAD",p)
    d=sha_idx(p)
    ib=blob("01a2d171",p); im=blob("MERGE_HEAD",p); idd=None
    try: idd=open(p,"rb").read()
    except Exception: continue
    same_m = norm(idd)==norm(im)
    same_h = norm(idd)==norm(ih) if (ih:=blob("HEAD",p)) else False
    if same_m: adopted.append(p)
    elif same_h: lost.append(p)
    else: merged_ok.append(p)
print("upstream-modified & present in index:",len(adopted)+len(lost)+len(merged_ok))
print("  采用上游(disk==UP)     :",len(adopted))
print("  丢上游退回映雪(disk==HEAD):",len(lost))
print("  两边不同(手工合并/其他)  :",len(merged_ok))
json.dump({"adopted":adopted,"lost":lost,"handmerged":merged_ok},open("_upcheck.json","w",encoding="utf-8"),ensure_ascii=False,indent=1)
import collections
for label,s in [("LOST(退回映雪)",lost),("HANDMERGE",merged_ok)]:
    print("\n===",label,len(s),"top dirs ===")
    c=collections.Counter("/".join(p.split("/")[:2]) for p in s)
    for k,v in c.most_common(20): print("   %-46s %d"%(k,v))
