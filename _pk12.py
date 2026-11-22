import subprocess,io,json,zipfile
def L(rev,path):
    r=subprocess.run(["git","ls-tree","-r","-z","--name-only",rev,"--",path],capture_output=True)
    return [x for x in r.stdout.decode("utf-8").split("\0") if x] if r.returncode==0 else []
def blob(rev,p):
    r=subprocess.run(["git","cat-file","blob",rev+":"+p],capture_output=True)
    return r.stdout if r.returncode==0 else None
def norm(b): return b.replace(b"\r\n",b"\n")
ids=["newapi-video-generations-v1","official-payment-xunhupay","volcengine-ark-seedance","wavespeed-image-edit","comfyui-workflow","newapi-media-task-v1","official-payment-zhifufm"]
for pid in ids:
    src="plugin-packages/"+pid; art=src+".yingce-plugin"
    for rev in ["01a2d171","HEAD","MERGE_HEAD"]:
        files=[p for p in L(rev,src) if not p.endswith("/backend/provider") and "backend/provider-" not in p]
        af=blob(rev,art)
        if af is None: print(pid,rev,"artifact absent"); continue
        z=zipfile.ZipFile(io.BytesIO(af))
        have=set(z.namelist())
        want=set(p[len(src)+1:] for p in files if "/backend/" not in p[len(src)+1:])
        bad=[]
        for n in sorted(want&have):
            b=blob(rev,src+"/"+n)
            if b is not None and norm(b)!=norm(z.read(n)): bad.append(n)
        print(pid,rev,"onlysrc",sorted(want-have),"onlyart",sorted(have-want),"contentdiff",bad)
    print()
