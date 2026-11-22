import io
s=io.open(".local/cache/_rbc.diff",encoding="utf-8",errors="replace").read().splitlines()
print(len(s))
for ln in s:
    if ln.startswith(("@@",)) or (ln[:1] in "+-" and not ln.startswith(("+++","---"))):
        print(ln[:180])
