import subprocess,json,io,zipfile,sys
def getblob(rev,p):
    r=subprocess.run(["git","cat-file","blob",rev+":"+p],capture_output=True)
    return r.stdout if r.returncode==0 else None
p="plugin-packages/newapi-video-generations-v1.yingce-plugin"
for label,data in [("disk",open(p,"rb").read()),("HEAD",getblob("HEAD",p)),("MERGE_HEAD",getblob("MERGE_HEAD",p)),("base",getblob("01a2d171",p))]:
    if data is None:
        print(label,"absent"); continue
    z=zipfile.ZipFile(io.BytesIO(data))
    m=json.loads(z.read("manifest.json").decode("utf-8"))
    print(label,"ver",m["version"])
    for w in m.get("contributes",{}).get("workflows",[]):
        s=json.dumps(w,ensure_ascii=False)
        print("   wf",w.get("id"),"len",len(s),"hasResponseDataRef:", repr("response.data")[1:-1] in s)
