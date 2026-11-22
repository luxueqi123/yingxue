import subprocess,io,json,zipfile,hashlib
def blob(rev,p):
    r=subprocess.run(["git","cat-file","blob",rev+":"+p],capture_output=True)
    return None if r.returncode!=0 else r.stdout
def norm(b): return b.replace(b"\r\n",b"\n")
for pid in ["official-payment-xunhupay","wavespeed-image-edit","volcengine-ark-seedance","newapi-video-generations-v1"]:
    art="plugin-packages/%s.yingce-plugin"%pid
    inner=norm(zipfile.ZipFile(art).read("manifest.json"))
    src=norm(open("plugin-packages/%s/manifest.json"%pid,"rb").read())
    print("="*60); print(pid)
    print("  artifact-inner manifest matches:", [rev[:7] for rev in ["01a2d171","HEAD","MERGE_HEAD"] if (lambda b: b is not None and norm(b)==inner)(blob(rev,"plugin-packages/%s/manifest.json"%pid))] or "none")
    print("  src manifest matches:", [rev[:7] for rev in ["01a2d171","HEAD","MERGE_HEAD"] if (lambda b: b is not None and norm(b)==src)(blob(rev,"plugin-packages/%s/manifest.json"%pid))] or "none")
