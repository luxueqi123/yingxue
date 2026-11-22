import subprocess, sys, difflib
from pathlib import Path
repo = Path(r"D:\天琊书客\项目\yingxue-upstream-v129-integration-20260912")
rev = sys.argv[1]; rel = sys.argv[2]
txt = subprocess.run(["git","show",f"{rev}:{rel}"],cwd=repo,capture_output=True).stdout.decode("utf-8",errors="replace")
disk = (repo/rel).read_text(encoding="utf-8",errors="replace")
A = txt.splitlines(); B = disk.splitlines()
print(f"### {rel}  {rev}_lines={len(A)} DISK_lines={len(B)}")
for line in difflib.unified_diff(A,B,fromfile=rev,tofile="DISK",lineterm="",n=2):
    print(line)
