import subprocess, sys, difflib
from pathlib import Path
repo = Path(r"D:\天琊书客\项目\yingxue-upstream-v129-integration-20260912")
rel = sys.argv[1]
try:
    head = subprocess.run(["git","show",f"HEAD:{rel}"],cwd=repo,capture_output=True).stdout.decode("utf-8",errors="replace")
except Exception as e:
    head = ""
disk = (repo/rel).read_text(encoding="utf-8",errors="replace")
A = head.splitlines(); B = disk.splitlines()
print(f"### {rel}  HEAD_lines={len(A)} DISK_lines={len(B)}")
for line in difflib.unified_diff(A,B,fromfile="HEAD",tofile="DISK",lineterm="",n=2):
    print(line)
