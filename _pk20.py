import subprocess,os
def blob(rev,p):
    r=subprocess.run(["git","cat-file","blob",rev+":"+p],capture_output=True)
    return r.stdout if r.returncode==0 else None
def norm(b): return b.replace(b"\r\n",b"\n")
pids=["newapi-video-generations-v1","official-payment-xunhupay","volcengine-ark-seedance","wavespeed-image-edit","comfyui-workflow"]
for pid in pids:
    print("="*66); print(pid)
    for name in ["manifest.json","README.md","docs/interface.md"]:
        dp="plugin-packages/%s/%s"%(pid,name)
        if not os.path.isfile(dp): print("  ",name,"NO DISK"); continue
        d=norm(open(dp,"rb").read())
        row=[name]
        for rev in ["01a2d171","HEAD","MERGE_HEAD"]:
            b=blob(rev,dp)
            row.append("%s=%s"%(rev[:7], "absent" if b is None else ("SAME" if norm(b)==d else "diff")))
        print("  "," ".join(row))
