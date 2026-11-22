import subprocess,json,io
def blob(rev,p):
    r=subprocess.run(["git","cat-file","blob",rev+":"+p],capture_output=True)
    return None if r.returncode!=0 else r.stdout
def norm(b): return b.replace(b"\r\n",b"\n")
p="plugin-packages/newapi-video-generations-v1/manifest.json"
b=norm(blob("01a2d171",p)); h=norm(blob("HEAD",p))
import difflib
a=json.loads(b.decode()); hh=json.loads(h.decode())
print("version",a["version"],"->",hh["version"])
def flat(o,pre=""):
    out={}
    if isinstance(o,dict):
        for k,v in o.items(): out.update(flat(v,pre+"/"+str(k)))
    elif isinstance(o,list):
        for i,v in enumerate(o): out.update(flat(v,pre+"/%d"%i))
    else: out[pre]=o
    return out
fa,fh=flat(a),flat(hh)
keys=set(fa)|set(fh)
d=[k for k in sorted(keys) if fa.get(k)!=fh.get(k)]
print("changed leaf paths (base->HEAD):",len(d))
for k in d[:40]: print("   ",k,"|",str(fa.get(k))[:70],"->",str(fh.get(k))[:70])
