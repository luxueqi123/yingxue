import subprocess
def blob(rev,p):
    r=subprocess.run(["git","cat-file","blob",rev+":"+p],capture_output=True)
    return None if r.returncode!=0 else r.stdout
s=blob("MERGE_HEAD","web/src/pages/settings/index.tsx").decode("utf-8","replace").replace("\r\n","\n").split("\n")
i=[k for k,l in enumerate(s) if '"agent-memory"' in l and "import" not in l]
print("UP agent-memory lines:",i)
for k in i:
    for j in range(max(0,k-3),min(len(s),k+18)): print("  %4d %s"%(j+1,s[j][:150]))
    print("-"*60)
