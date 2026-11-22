import subprocess,json,io,zipfile
def blob(rev,p):
    r=subprocess.run(["git","cat-file","blob",rev+":"+p],capture_output=True)
    return r.stdout if r.returncode==0 else None
p="plugin-packages/autodl-comfyui.yingce-plugin"
def mf(d):
    z=zipfile.ZipFile(io.BytesIO(d)); return json.loads(z.read("manifest.json").decode("utf-8"))
h=mf(blob("HEAD",p)); m=mf(blob("MERGE_HEAD",p)); d=mf(open(p,"rb").read())
def wfs(x): return {w["id"]:w for w in x["contributes"]["workflows"]}
wh,wm,wd=wfs(h),wfs(m),wfs(d)
print("HEAD-only ids:",set(wh)-set(wm))
print("MERGE-only ids:",set(wm)-set(wh))
n=0
for k in wh:
    if json.dumps(wh[k],sort_keys=True,ensure_ascii=False)!=json.dumps(wm[k],sort_keys=True,ensure_ascii=False):
        n+=1; print("  differs:",k)
print("shared workflow defs differing:",n)
print("disk artifact == MERGE_HEAD artifact:", open(p,"rb").read()==blob("MERGE_HEAD",p))
print("metadata HEAD:", json.dumps(h.get("metadata"),ensure_ascii=False)[:200])
print("metadata UP:", json.dumps(m.get("metadata"),ensure_ascii=False)[:200])
print("top-level diff count:", sum(1 for k in set(h)|set(m) if json.dumps(h.get(k),sort_keys=True,ensure_ascii=False)!=json.dumps(m.get(k),sort_keys=True,ensure_ascii=False)))
for k in set(h)|set(m):
    if json.dumps(h.get(k),sort_keys=True,ensure_ascii=False)!=json.dumps(m.get(k),sort_keys=True,ensure_ascii=False):
        print("   key:",k, list(h.get(k,{}).keys()) if isinstance(h.get(k),dict) else type(h.get(k)).__name__)
