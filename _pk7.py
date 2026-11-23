import subprocess
p="backend/internal/protocol/autodl_plugin_artifact_test.go"
d=open(p,"rb").read()
for rev in ["HEAD","MERGE_HEAD","01a2d171"]:
    r=subprocess.run(["git","cat-file","blob",rev+":"+p],capture_output=True)
    print(rev,"disk==",r.stdout==d)
r=subprocess.run(["git","cat-file","blob","01a2d171:"+p],capture_output=True)
s=r.stdout.decode("utf-8").splitlines()
for i,l in enumerate(s[:35],1): print(i,l)
