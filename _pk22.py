import subprocess,io,json,zipfile,hashlib
def blob(rev,p):
    r=subprocess.run(["git","cat-file","blob",rev+":"+p],capture_output=True)
    return None if r.returncode!=0 else r.stdout
def norm(b): return b.replace(b"\r\n",b"\n")
for pid in ["official-payment-xunhupay","wavespeed-image-edit"]:
    print("="*60); print(pid)
    art="plugin-packages/%s.yingce-plugin"%pid
    diskart=open(art,"rb").read()
    for rev in ["01a2d171","HEAD","MERGE_HEAD"]:
        b=blob(rev,art)
        if b is None: print("  art",rev,"absent"); continue
        z=zipfile.ZipFile(io.BytesIO(b))
        inner=norm(z.read("manifest.json"))
        print("  art",rev,"outer==disk", norm(b)==norm(diskart), "| inner md5", hashlib.md5(inner).hexdigest()[:10])
    import zipfile as zf
    z=zf.ZipFile(art); innerD=norm(z.read("manifest.json"))
    print("  art disk      inner md5", hashlib.md5(innerD).hexdigest()[:10])
    dp="plugin-packages/%s/manifest.json"%pid
    d=norm(open(dp,"rb").read())
    print("  src disk      md5", hashlib.md5(d).hexdigest()[:10])
    for rev in ["01a2d171","HEAD","MERGE_HEAD"]:
        b=blob(rev,dp)
        print("  src",rev,"==",norm(b)==d if b else "absent")
