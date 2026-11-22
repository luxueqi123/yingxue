import subprocess,json,io,zipfile
def blob(rev,p):
    r=subprocess.run(["git","cat-file","blob",rev+":"+p],capture_output=True)
    return None if r.returncode!=0 else r.stdout
def norm(b): return b.replace(b"\r\n",b"\n")
p="plugin-packages/volcengine-ark-seedance/manifest.json"
def params(b):
    d=json.loads(norm(b).decode("utf-8"))
    return [x["name"] for x in d["contributes"]["providers"][0]["parameters"]]
for rev in ["HEAD","MERGE_HEAD"]:
    print(rev, params(blob(rev,p)))
print("disk ", params(open(p,"rb").read()))
art="plugin-packages/volcengine-ark-seedance.yingce-plugin"
print("artifact", params(zipfile.ZipFile(art).read("manifest.json")), "(== HEAD blob:", open(art,"rb").read()==blob("HEAD",art), "== MERGE:", open(art,"rb").read()==blob("MERGE_HEAD",art),")")
print()
# does any test reference seed/camera_fixed for ark?
r=subprocess.run(["git","grep","-n","-I","camera_fixed"],capture_output=True)
print("grep camera_fixed (index):"); print(r.stdout.decode("utf-8","replace")[:800])
