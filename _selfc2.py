import subprocess,io,json,zipfile
def blob(rev,p):
    r=subprocess.run(["git","cat-file","blob",rev+":"+p],capture_output=True)
    return None if r.returncode!=0 else r.stdout
def n(b): return b.replace(b"\r\n",b"\n") if b else b
def inner(d): return n(zipfile.ZipFile(io.BytesIO(d)).read("manifest.json"))
for pid in ["newapi-video-generations-v1","volcengine-ark-seedance","autodl-comfyui","comfyui-workflow","agnes-image"]:
    print("="*70); print(pid)
    for rev in ["01a2d171","HEAD","MERGE_HEAD","DISK"]:
        if rev=="DISK":
            try: a=open("plugin-packages/%s.yingce-plugin"%pid,"rb").read()
            except Exception: print("   DISK artifact absent"); continue
        else: a=blob(rev,"plugin-packages/%s.yingce-plugin"%pid)
        if a is None: print("   %-10s artifact absent"%rev); continue
        if rev=="DISK": s=open("plugin-packages/%s/manifest.json"%pid,"rb").read()
        else: s=blob(rev,"plugin-packages/%s/manifest.json"%pid)
        st = "src absent" if s is None else str(inner(a)==n(s))
        m=json.loads(inner(a).decode("utf-8"))
        print("   %-10s ver=%-7s selfconsistent=%s"%(rev,m.get("version"),st))
