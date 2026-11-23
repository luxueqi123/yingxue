import io,re
s=io.open("_bun_baseline.txt",encoding="utf-8",errors="replace").read()
# split at recap
m=list(re.finditer(r"^\s*\d+ pass\s*$", s, re.M))
body=s[:m[-1].start()] if m else s
# errors appear as "error: ..." lines and (error) markers
for ln in body.splitlines():
    t=ln.strip()
    if t.startswith("error:") or t.startswith("(error)"):
        print("ERR |", t[:200])
print("---- summary ----")
print(s[m[-1].start():][:400])
