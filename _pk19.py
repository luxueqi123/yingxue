import subprocess,os
def ls(rev,p):
    r=subprocess.run(["git","ls-tree","-r","-z","--name-only",rev,"--",p],capture_output=True)
    if r.returncode!=0: return None
    return [x for x in r.stdout.decode("utf-8").split("\0") if x]
for p in ["plugin-packages/autodl-comfyui","plugin-packages/comfyui-workflow","plugin-packages/autodl-comfyui.yingce-plugin"]:
    print("###",p,"diskExists",os.path.exists(p))
    for rev in ["01a2d171","HEAD","MERGE_HEAD","INDEX"]:
        if rev=="INDEX":
            r=subprocess.run(["git","ls-files","--stage","--",p],capture_output=True)
            out=r.stdout.decode("utf-8","replace"); print("   INDEX", len(out.splitlines()))
            continue
        v=ls(rev,p)
        print("   ",rev, "None" if v is None else len(v), (v[:4] if v else ""))
