import re, io, collections, sys
p = r"_bun_test.txt"
lines = io.open(p, encoding="utf-8", errors="replace").read().splitlines()
cur = None
res = collections.OrderedDict()
order = []
for ln in lines:
    m = re.match(r"^(test[\\/][^\s:]+?\.(?:ts|tsx|mjs|js)):$", ln.strip())
    if m:
        cur = m.group(1).replace("\\", "/")
        if cur not in res:
            res[cur] = []
            order.append(cur)
        continue
    s = ln.strip()
    if s.startswith("(fail)") and cur:
        res[cur].append(s[6:].strip())
tot = 0
for f in order:
    if res[f]:
        tot += len(res[f])
        print(f"### {f}  ({len(res[f])})")
        for t in res[f]:
            print("   -", t)
print("TOTAL FAILS:", tot)
