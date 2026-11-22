import subprocess
P="web/src/pages/create/index.tsx"
def L(ref): return subprocess.run(["git","show",f"{ref}:{P}"],capture_output=True).stdout.decode("utf-8").replace("\r\n","\n").split("\n")
H=L("HEAD"); O=L("MERGE_HEAD")
s=open(P,encoding="utf-8").read().replace("\r\n","\n").split("\n")
def locate(seg,src):
    if not seg: return "EMPTY"
    for j in range(len(src)-len(seg)+1):
        if src[j:j+len(seg)]==seg: return (j+1,j+len(seg))
    return None
i=0;idx=0
while i<len(s):
    if s[i].startswith("<<<<<<<"):
        idx+=1;k=i+1;mid=None;end=None
        while k<len(s):
            if s[k].startswith("=======") and mid is None: mid=k
            if s[k].startswith(">>>>>>>"): end=k;break
            k+=1
        head=s[i+1:mid]; orig=s[mid+1:end]
        print("##### B%d  workfile %d-%d"% (idx,i+1,end+1))
        print("   HEAD(%d) -> %s"%(len(head),locate(head,H)))
        print("   ORIG(%d) -> %s"%(len(orig),locate(orig,O)))
        print("   HEAD---first/last: %s || %s"%(head[0][:80] if head else "", head[-1][:80] if head else ""))
        print("   ORIG---first/last: %s || %s"%(orig[0][:80] if orig else "", orig[-1][:80] if orig else ""))
        i=end+1
    else: i+=1
