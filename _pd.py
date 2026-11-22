import io,re
s=io.open(".local/cache/_gt_hd.diff",encoding="utf-8",errors="replace").read()
print("len",len(s))
for ln in s.splitlines():
    if ln.startswith("@@") or (ln[:1] in "+-" and not ln.startswith("+++") and not ln.startswith("---")):
        print(ln[:200])
