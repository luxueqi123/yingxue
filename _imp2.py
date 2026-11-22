import subprocess
def blob(rev,p):
    r=subprocess.run(["git","cat-file","blob",rev+":"+p],capture_output=True)
    return None if r.returncode!=0 else r.stdout
def n(b): return b.replace(b"\r\n",b"\n") if b else b
c="web/src/pages/create/index.tsx"
for tag,b in [("UP",blob("MERGE_HEAD",c)),("HEAD",blob("HEAD",c)),("disk",open(c,"rb").read())]:
    s=n(b).decode("utf-8","replace")
    for l in s.splitlines():
        if "defaultCreationMode" in l and "import" in l:
            print("%-6s %s"%(tag,l.strip()[:230])); break
    else: print(tag,"no import line with defaultCreationMode")
