import subprocess,io,difflib
def blob(rev,p):
    r=subprocess.run(["git","cat-file","blob",rev+":"+p],capture_output=True)
    return r.stdout.decode("utf-8","replace").replace("\r\n","\n") if r.returncode==0 else None
p="web/test/workspace-route-loading.test.ts"
d=io.open(p,encoding="utf-8",errors="replace").read().replace("\r\n","\n")
h=blob("98822b65",p); u=blob("b9d60f98",p)
print("HEAD has test 'keeps the creation page at root':", "keeps the creation page at root" in (h or ""))
print("UP   has test 'keeps the creation page at root':", "keeps the creation page at root" in (u or ""))
print("disk has:", "keeps the creation page at root" in d)
print()
print("HEAD has '/home':", "path: \"/home\"" in (h or ""), " UP:", "path: \"/home\"" in (u or ""))
print()
print("=== test names HEAD ===")
import re
for m in re.finditer(r'\n    test\("([^"]+)"', h or ""): print("  H:",m.group(1))
print("=== test names disk ===")
for m in re.finditer(r'\n    test\("([^"]+)"', d): print("  D:",m.group(1))
print("=== test names UP ===")
for m in re.finditer(r'\n    test\("([^"]+)"', u or ""): print("  U:",m.group(1))
