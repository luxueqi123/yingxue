import subprocess,io,json,zipfile
def blob(rev,p):
    r=subprocess.run(["git","cat-file","blob",rev+":"+p],capture_output=True)
    return None if r.returncode!=0 else r.stdout
def norm(b): return b.replace(b"\r\n",b"\n")
print("--- agnes-image README ---")
p="plugin-packages/agnes-image/README.md"
d=norm(open(p,"rb").read()); print(repr(d[:250]))
for rev in ["01a2d171","HEAD","MERGE_HEAD"]:
    b=blob(rev,p); print(rev, "absent" if b is None else ("SAME" if norm(b)==d else "diff"))
print("--- comfyui-workflow README (HEAD) ---")
b=blob("HEAD","plugin-packages/comfyui-workflow/README.md")
print(repr(b[:250]) if b else "absent")
print("--- agnes-image in MERGE_HEAD ---")
b=blob("MERGE_HEAD","plugin-packages/agnes-image/manifest.json")
print("manifest exists:", b is not None)
