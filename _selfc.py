import subprocess,io,json,zipfile,hashlib
def blob(rev,p):
    r=subprocess.run(["git","cat-file","blob",rev+":"+p],capture_output=True)
    return None if r.returncode!=0 else r.stdout
def n(b): return b.replace(b"\r\n",b"\n") if b else b
def inner(data): return n(zipfile.ZipFile(io.BytesIO(data)).read("manifest.json"))
for pid in ["official-payment-xunhupay","wavespeed-image-edit","official-payment-zhifufm","official-payment-wechat-native"]:
    print("="*70); print(pid)
    for rev in ["MERGE_HEAD","HEAD","01a2d171"]:
        a=blob(rev,"plugin-packages/%s.yingce-plugin"%pid)
        s=blob(rev,"plugin-packages/%s/manifest.json"%pid)
        if a is None: print("  ",rev,"artifact absent"); continue
        if s is None: print("  ",rev,"src absent"); continue
        same = inner(a)==n(s)
        print("  %-11s upstream自洽(artifact内manifest==src): %s"%(rev,same))
