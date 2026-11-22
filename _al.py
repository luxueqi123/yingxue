import subprocess, hashlib, sys
from pathlib import Path
repo = Path(r"D:\天琊书客\项目\yingxue-upstream-v129-integration-20260912")
BASE, HEAD, MERGE = "01a2d171", "98822b65", "b9d60f98072ab3069dd4b51eba2f966145b87af3"
def blob(ref, rel):
    r = subprocess.run(["git","ls-tree",ref,"--",rel],cwd=repo,capture_output=True,text=True,encoding="utf-8",errors="replace")
    return r.stdout.split()[2] if r.stdout.strip() else None
def disk_hash(p):
    if not p.exists(): return None
    d = p.read_bytes()
    h = hashlib.sha1(b"blob %d\0"%len(d)); h.update(d); return h.hexdigest()
files = sys.argv[1:]
for rel in files:
    p = repo/rel
    b, h, m = blob(BASE,rel), blob(HEAD,rel), blob(MERGE,rel)
    d = disk_hash(p)
    tag = []
    if d is None: tag.append("MISSING")
    else:
        if h and d==h: tag.append("==HEAD")
        if m and d==m: tag.append("==MERGE")
        if b and d==b: tag.append("==BASE")
    print("%-56s base=%-5s head=%-5s merge=%-5s  %s" % (rel, bool(b), bool(h), bool(m), ",".join(tag) or "OTHER"))
