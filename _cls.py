import io,re,subprocess
def names(p):
    s=io.open(p,encoding="utf-8",errors="replace").read()
    m=list(re.finditer(r"^\s*\d+ pass\s*$", s, re.M))
    body=s[:m[-1].start()] if m else s
    return set(x.strip() for x in re.findall(r"^\(fail\)\s*(.+?)(?:\s*\[\d+\.\d+ms\])?$", body, re.M))
b=names("_bun_baseline.txt"); i=names("_bun_test.txt")
new=sorted(i-b)
def sh(a): return subprocess.run(a,capture_output=True,text=True,encoding="utf-8",errors="replace").stdout
head=set(x for x in sh(["git","ls-tree","-r","--name-only","98822b65","--","web/test"]).split())
up=set(x for x in sh(["git","ls-tree","-r","--name-only","b9d60f98","--","web/test"]).split())
prev=set(x for x in sh(["git","ls-tree","-r","--name-only","bdd61bbf","--","web/test"]).split())
print("head=%d up=%d base=%d"%(len(head),len(up),len(prev)))
print("up-only files:", len(up-head))
print("head-only files:", len(head-up))
print()
print("=== NEW failures (%d) ==="%len(new))
for x in new: print("  -", x)
