import subprocess,io,os,difflib
def blob(rev,p):
    r=subprocess.run(["git","cat-file","blob",rev+":"+p],capture_output=True)
    return r.stdout.decode("utf-8","replace").replace("\r\n","\n") if r.returncode==0 else None
files=[l.strip() for l in io.open("_failfiles.txt",encoding="utf-8") if l.strip()]
for f in files:
    p="web/"+f
    d=io.open(p,encoding="utf-8",errors="replace").read().replace("\r\n","\n")
    h=blob("98822b65",p) or ""
    diff=[l for l in difflib.unified_diff(h.split("\n"),d.split("\n"),lineterm="",n=0) if l[:1] in "+-" and not l.startswith(("+++","---"))]
    if diff:
        print("### TEST-FILE MODIFIED BY MERGE:",f, len(diff))
        for l in diff[:20]: print("   ",l[:160])
