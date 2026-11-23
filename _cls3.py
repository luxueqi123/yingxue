import io,re
def parse(p):
    s=io.open(p,encoding="utf-8",errors="replace").read()
    cut=re.search(r"^\s*\d+ tests failed:\s*$", s, re.M)
    if cut: s=s[:cut.start()]
    cur=None; res={}
    for ln in s.splitlines():
        m=re.match(r"^(test[\\/][^\s:]+?\.(?:ts|tsx|mjs|js)):$", ln.strip())
        if m:
            cur=m.group(1).replace("\\","/"); res.setdefault(cur,[]); continue
        t=ln.strip()
        if t.startswith("(fail)") and cur:
            body=t[6:].strip()
            body=re.sub(r"\s*\[[\d.]+ms\]$","",body)
            res[cur].append(body)
    return res
b=parse("_bun_baseline.txt"); i=parse("_bun_test.txt")
bf={(f,x) for f,v in b.items() for x in v}
inf={(f,x) for f,v in i.items() for x in v}
new=sorted(inf-bf); gone=sorted(bf-inf)
print("baseline:",len(bf)," integrated:",len(inf)," NEW:",len(new)," GONE:",len(gone))
print("\n=== GONE (baseline-only) ===")
for f,x in gone: print("  -",x,"@",f)
