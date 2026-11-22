import subprocess
def ls(rev,p):
    r=subprocess.run(["git","ls-tree","-r","-z","--name-only",rev,"--",p],capture_output=True)
    if r.returncode!=0: return "ERR"
    v=[x for x in r.stdout.decode("utf-8","replace").split("\0") if x]
    return v if v else "ABSENT"
for p in ["plugin-packages/agnes-image","plugin-packages/comfyui-workflow","plugin-packages/autodl-comfyui"]:
    print("###",p)
    for rev in ["01a2d171","HEAD","MERGE_HEAD"]:
        v=ls(rev,p)
        print("   %-10s %s"%(rev, v if v=="ABSENT" else len(v)))
    print("    index:", len([x for x in subprocess.run(["git","ls-files","-z","--",p],capture_output=True).stdout.decode("utf-8","replace").split("\0") if x]))
