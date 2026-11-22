import subprocess
def ls(rev,p):
    r=subprocess.run(["git","ls-tree","-r","-z","--name-only",rev,"--",p],capture_output=True)
    if r.returncode!=0: return None
    return [x for x in r.stdout.decode("utf-8","replace").split("\0") if x]
for p in ["canvas-agent","plugins/yingce","docs","web","backend","plugin-packages"]:
    print("%-16s" % p, {rev: (len(ls(rev,p)) if ls(rev,p) is not None else "absent") for rev in ["01a2d171","HEAD","MERGE_HEAD"]})
print()
print("--- canvas-agent members at each rev ---")
for rev in ["01a2d171","HEAD","MERGE_HEAD"]:
    v=ls(rev,"canvas-agent")
    print(rev, "absent" if v is None else v[:6])
print()
print("--- what did upstream ADD under canvas-agent namespace? ---")
r=subprocess.run(["git","ls-tree","--name-only","MERGE_HEAD"],capture_output=True)
print(r.stdout.decode("utf-8","replace"))
