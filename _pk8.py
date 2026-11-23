import subprocess
p="backend/internal/protocol/autodl_plugin_artifact_test.go"
r=subprocess.run(["git","cat-file","blob","HEAD:"+p],capture_output=True)
s=r.stdout.decode("utf-8").splitlines()
for i,l in enumerate(s[:30],1): print(i,l)
