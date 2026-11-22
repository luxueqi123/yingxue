import io,re
def parse(p):
    s=io.open(p,encoding="utf-8",errors="replace").read()
    cut=re.search(r"^\s*(\d+) tests failed:\s*$", s, re.M)
    if cut: s=s[:cut.start()]
    cur=None; res={}
    for ln in s.splitlines():
        m=re.match(r"^(test[\\/][^\s:]+?\.(?:ts|tsx|mjs|js)):$", ln.strip())
        if m:
            cur=m.group(1).replace("\\","/"); res.setdefault(cur,[]); continue
        t=ln.strip()
        if t.startswith("(fail)") and cur:
            res[cur].append(t[6:].strip())
    return res
b=parse("_bun_baseline.txt"); i=parse("_bun_test.txt")
bf={(f,x) for f,v in b.items() for x in v}
inf={(f,x) for f,v in i.items() for x in v}
new=sorted(inf-bf); gone=sorted(bf-inf)
print("baseline fails:",len(bf)," integrated fails:",len(inf))
print("\n=== NEW (%d) ==="%len(new))
for f,x in new: print("  -",f,"|",x)
print("\n=== GONE (%d) ==="%len(gone))
for f,x in gone: print("  -",f,"|",x)
