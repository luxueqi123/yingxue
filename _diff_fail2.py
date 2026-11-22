import re, io
def names(p):
    s = io.open(p, encoding="utf-8", errors="replace").read()
    # cut the trailing recap/summary: summary line like "  NNN pass"
    ms = list(re.finditer(r"^\s*\d+ pass\s*$", s, re.M))
    if ms:
        s = s[:ms[-1].start()]
    # also cut recap section: starts at a line that is exactly "failures:" or "error:" style heading after tests
    fails = re.findall(r"^\(fail\)\s*(.+?)(?:\s*\[\d+\.\d+ms\])?$", s, re.M)
    return [f.strip() for f in fails]
b = names("_bun_baseline.txt"); i = names("_bun_test.txt")
bs, iset = set(b), set(i)
print("baseline fail names:", len(b), "unique", len(bs))
print("integrated fail names:", len(i), "unique", len(iset))
new = sorted(iset-bs); gone = sorted(bs-iset)
print("\n=== NEW (in integrated, not baseline):", len(new))
for x in new: print("  NEW |", x)
print("\n=== GONE (in baseline, not integrated):", len(gone))
for x in gone: print("  GONE |", x)
