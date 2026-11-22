import subprocess,difflib
def blob(rev,p):
    r=subprocess.run(["git","cat-file","blob",rev+":"+p],capture_output=True)
    return None if r.returncode!=0 else r.stdout
def L(b): return b.replace(b"\r\n",b"\n").decode("utf-8","replace").splitlines()
p="backend/internal/protocol/autodl_plugin_artifact_test.go"
print("=== 上游 v1.5.5 相对 v1.2.9 对该测试的改动 ===")
for l in difflib.unified_diff(L(blob("01a2d171",p)),L(blob("MERGE_HEAD",p)),"v1.2.9","v1.5.5",lineterm="",n=2): print(l[:170])
print()
print("=== 映雪 HEAD 相对 v1.2.9 的改动 ===")
for l in difflib.unified_diff(L(blob("01a2d171",p)),L(blob("HEAD",p)),"v1.2.9","HEAD",lineterm="",n=2): print(l[:170])
