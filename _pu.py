import io
s=io.open(".local/cache/_gt_uh.diff",encoding="utf-8",errors="replace").read().splitlines()
out=[]
for ln in s:
    if ln.startswith(("@@","+++","---")): out.append(ln[:160])
    elif ln.startswith("+") and not ln.startswith("+++"): pass
    else: pass
# print only upstream-only additions (lines starting with '-' means present in UP)
for ln in s:
    if ln.startswith("-") and not ln.startswith("---"):
        print(ln[:200])
