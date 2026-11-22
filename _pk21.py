import subprocess,os,io,json,zipfile
def blob(rev,p):
    r=subprocess.run(["git","cat-file","blob",rev+":"+p],capture_output=True)
    return None if r.returncode!=0 else r.stdout
def norm(b): return b.replace(b"\r\n",b"\n")
def zipmf(b):
    z=zipfile.ZipFile(io.BytesIO(b))
    return json.loads(norm(z.read("manifest.json")).decode("utf-8"))
def zfiles(b):
    return sorted(zipfile.ZipFile(io.BytesIO(b)).namelist())
pids=["newapi-video-generations-v1","official-payment-xunhupay","volcengine-ark-seedance","wavespeed-image-edit","comfyui-workflow"]
print("%-30s %-10s %-22s %-22s" % ("package","part","matches rev","notes"))
for pid in pids:
    art="plugin-packages/%s.yingce-plugin"%pid
    a=open(art,"rb").read()
    row=[]
    for rev in ["01a2d171","HEAD","MERGE_HEAD"]:
        b=blob(rev,art)
        if b is not None and norm(b)==norm(a): row.append(rev[:7])
    print("%-30s %-10s %-22s" % (pid,"ARTIFACT",",".join(row) or "none"))
    for n in ["manifest.json","README.md","docs/interface.md"]:
        dp="plugin-packages/%s/%s"%(pid,n)
        if not os.path.isfile(dp): print("%-30s %-10s %-22s"%(pid,n,"NO DISK")); continue
        d=norm(open(dp,"rb").read())
        m=[rev[:7] for rev in ["01a2d171","HEAD","MERGE_HEAD"] if (blob(rev,dp) is not None and norm(blob(rev,dp))==d)]
        print("%-30s %-10s %-22s"%(pid,n,",".join(m) or "none(hand-merged)"))
