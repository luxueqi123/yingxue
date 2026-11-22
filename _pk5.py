import subprocess
p="backend/internal/protocol/official_catalog_test.go"
d=open(p,"rb").read()
for rev in ["HEAD","MERGE_HEAD","01a2d171"]:
    r=subprocess.run(["git","cat-file","blob",rev+":"+p],capture_output=True)
    print(rev,"disk==",r.stdout==d, "len", len(r.stdout) if r.returncode==0 else None, "len disk", len(d))
s=d.decode("utf-8").splitlines()
for i,l in enumerate(s,1):
    if "func Test" in l: print(i,l)
