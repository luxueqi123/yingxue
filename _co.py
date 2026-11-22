import subprocess
def blob(rev,p):
    r=subprocess.run(["git","cat-file","blob",rev+":"+p],capture_output=True)
    return None if r.returncode!=0 else r.stdout
p="backend/internal/app/channel_outbound.go"
s=blob("MERGE_HEAD",p).decode("utf-8","replace")
print("=== channel_outbound.go (上游) 前 40 行 ===")
for i,l in enumerate(s.splitlines()[:40],1): print("  ",i,l[:150])
import re
syms=set(re.findall(r"func (?:\([^)]*\) )?([A-Za-z_][A-Za-z0-9_]*)",s))
print("\n导出/定义函数:",sorted(syms))
