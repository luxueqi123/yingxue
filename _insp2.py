import io
s=io.open("_bun_test.txt",encoding="utf-8",errors="replace").read()
print("total len", len(s))
tails = s[1663330:1675150]
lines = tails.splitlines()
print("nlines", len(lines))
for k,l in enumerate(lines[:60]):
    print(k, "|", l[:160])
