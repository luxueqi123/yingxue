import subprocess, re
P="web/src/pages/canvas/project.tsx"
def git(ref): return subprocess.run(["git","show",f"{ref}:{P}"],capture_output=True).stdout.decode("utf-8").replace("\r\n","\n").split("\n")
H=git("HEAD"); W=open(P,encoding="utf-8").read().replace("\r\n","\n").split("\n")
def imports(ls):
    out=set()
    for l in ls:
        m=re.match(r'\s*import\s+(.*?)\s+from\s+"(.*?)";',l)
        if m: out.add((m.group(1),m.group(2)))
    return out
ih=imports(H); iw=imports(W)
print("### in HEAD only ({}):".format(len(ih-iw)))
for a,b in sorted(ih-iw): print("   ",a,"FROM",b)
print("### in WORK only ({}):".format(len(iw-ih)))
for a,b in sorted(iw-ih): print("   ",a,"FROM",b)
