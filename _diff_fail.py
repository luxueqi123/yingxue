import re, io, collections, json
def parse(p):
    lines = io.open(p, encoding="utf-8", errors="replace").read().splitlines()
    cur=None; res=collections.OrderedDict()
    for ln in lines:
        m = re.match(r"^(test[\\/][^\s:]+?\.(?:ts|tsx|mjs|js)):$", ln.strip())
        if m:
            cur=m.group(1).replace("\\","/")
            res.setdefault(cur,[])
            continue
        s=ln.strip()
        if s.startswith("(fail)") and cur:
            res[cur].append(s[6:].strip())
    return res
b=parse("_bun_baseline.txt"); i=parse("_bun_test.txt")
bf=set(); inf=set()
for f,t in b.items():
    for x in t: bf.add((f,x))
for f,t in i.items():
    for x in t: inf.add((f,x))
new = sorted(inf - bf); gone = sorted(bf - inf)
print("baseline fails:", len(bf))
print("integrated fails:", len(inf))
print("NEW (regression candidates):", len(new))
print()
for f,x in new:
    print("NEW |", f, "|", x)
print()
print("GONE:", len(gone))
for f,x in gone:
    print("GONE |", f, "|", x)
