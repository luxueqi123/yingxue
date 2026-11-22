import subprocess, sys
from pathlib import Path
repo = Path(r"D:\天琊书客\项目\yingxue-upstream-v129-integration-20260912")
BASE, HEAD, MERGE = "01a2d171", "98822b65", "b9d60f98072ab3069dd4b51eba2f966145b87af3"
def exists(ref, rel):
    r = subprocess.run(["git","ls-tree",ref,"--",rel],cwd=repo,capture_output=True,text=True,encoding="utf-8",errors="replace")
    return bool(r.stdout.strip())
def same(ref, rel):
    return subprocess.run(["git","diff","--quiet",ref,"--",rel],cwd=repo).returncode == 0
for rel in sys.argv[1:]:
    b,h,m = exists(BASE,rel), exists(HEAD,rel), exists(MERGE,rel)
    if not Path(repo/rel).exists():
        state = "MISSING-ON-DISK"
    else:
        eq = []
        if h and same(HEAD,rel): eq.append("HEAD")
        if m and same(MERGE,rel): eq.append("MERGE")
        if b and same(BASE,rel): eq.append("BASE")
        state = "==" + "/".join(eq) if eq else "OTHER"
    numstat = subprocess.run(["git","diff","--numstat",HEAD,"--",rel],cwd=repo,capture_output=True,text=True).stdout.strip()
    print("%-58s base=%-5s head=%-5s merge=%-5s -> %-12s %s" % (rel, b, h, m, state, numstat))
