import subprocess,json,io,zipfile
def getblob(rev,p):
    r=subprocess.run(["git","cat-file","blob",rev+":"+p],capture_output=True)
    return r.stdout if r.returncode==0 else None
p="plugin-packages/newapi-video-generations-v1.yingce-plugin"
def mf(data):
    z=zipfile.ZipFile(io.BytesIO(data))
    return json.loads(z.read("manifest.json").decode("utf-8"))
h=mf(getblob("HEAD",p)); m=mf(getblob("MERGE_HEAD",p)); d=mf(open(p,"rb").read())
print("HEAD keys",list(h.keys()))
print("contributes keys", list(h.get("contributes",{}).keys()))
for k in h.get("contributes",{}):
    print(k, type(h["contributes"][k]).__name__, len(h["contributes"][k]) if hasattr(h["contributes"][k],"__len__") else "")
open("_h.json","w",encoding="utf-8").write(json.dumps(h,ensure_ascii=False,indent=1))
open("_m.json","w",encoding="utf-8").write(json.dumps(m,ensure_ascii=False,indent=1))
open("_d.json","w",encoding="utf-8").write(json.dumps(d,ensure_ascii=False,indent=1))
