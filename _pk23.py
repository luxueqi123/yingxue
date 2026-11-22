import subprocess,json,io,zipfile,difflib
def blob(rev,p):
    r=subprocess.run(["git","cat-file","blob",rev+":"+p],capture_output=True)
    return None if r.returncode!=0 else r.stdout
def norm(b): return b.replace(b"\r\n",b"\n")
# volcengine-ark-seedance src manifest 3-way
p="plugin-packages/volcengine-ark-seedance/manifest.json"
for rev in ["01a2d171","HEAD","MERGE_HEAD"]:
    b=blob(rev,p)
    if b is None: print(rev,"absent"); continue
    d=json.loads(norm(b).decode("utf-8"))
    pr=d["contributes"]["providers"][0]
    names=[x["name"] for x in pr.get("parameters",[])]
    print(rev,"params",names)
d=json.loads(norm(open(p,"rb").read()).decode("utf-8"))
print("disk  params",[x["name"] for x in d["contributes"]["providers"][0].get("parameters",[])])
print()
# autodl descriptions
ap="plugin-packages/autodl-comfyui.yingce-plugin"
for rev in ["HEAD","MERGE_HEAD"]:
    b=blob(rev,ap)
    m=json.loads(zipfile.ZipFile(io.BytesIO(b)).read("manifest.json").decode("utf-8"))
    print(rev,"ver",m["version"],"desc:",m["description"][:300])
    print("   doc head:",m["documentation"][:200].replace("\n","|"))
