import subprocess
def blob(rev,p):
    r=subprocess.run(["git","cat-file","blob",rev+":"+p],capture_output=True)
    return None if r.returncode!=0 else r.stdout
def n(b): return b.replace(b"\r\n",b"\n") if b else b
p="web/test/create-library-button.test.ts"
r=subprocess.run(["git","rev-parse",":web/test/create-library-button.test.ts"],capture_output=True,text=True)
print("index sha",r.stdout.strip())
for rev in ["HEAD","MERGE_HEAD"]:
    r=subprocess.run(["git","rev-parse",rev+":"+p],capture_output=True,text=True); print(rev,r.stdout.strip())
print("disk==UP:", n(open(p,"rb").read())==n(blob("MERGE_HEAD",p)))
c="web/src/pages/create/index.tsx"
up=n(blob("MERGE_HEAD",c)).decode("utf-8","replace")
for l in up.splitlines():
    if "defaultCreationMode" in l: print("  UP create/index.tsx:",l[:160])
print("--- disk ---")
for l in open(c,encoding="utf-8").read().replace("\r\n","\n").splitlines():
    if "defaultCreationMode" in l: print("  disk:",l[:160])
