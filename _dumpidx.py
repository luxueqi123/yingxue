import subprocess
P="web/src/pages/create/index.tsx"
def L(ref): return subprocess.run(["git","show",f"{ref}:{P}"],capture_output=True).stdout.decode("utf-8").replace("\r\n","\n").split("\n")
H=L("HEAD"); O=L("MERGE_HEAD"); B=L("01a2d171")
s=open(P,encoding="utf-8").read().replace("\r\n","\n").split("\n")
out=[];i=0;idx=0
while i<len(s):
    if s[i].startswith("<<<<<<<"):
        idx+=1;k=i+1;mid=None;end=None
        while k<len(s):
            if s[k].startswith("=======") and mid is None: mid=k
            if s[k].startswith(">>>>>>>"): end=k;break
            k+=1
        head=s[i+1:mid]; orig=s[mid+1:end]
        def locate(seg,src):
            if not seg: return "EMPTY"
            for j in range(len(src)):
                if src[j:j+len(seg)]==seg: return "src %d-%d"%(j+1,j+len(seg))
            return "NOT FOUND in src"
        out.append("##### B%d  file-lines %d-%d  HEAD=%d ORIG=%d"%(idx,i+1,end+1,len(head),len(orig)))
        out.append("  HEAD->"+locate(head,H)+" ; ORIG->"+locate(orig,O))
        out.append("  H1: "+(head[0][:110] if head else ""))
        out.append("  Hn: "+(head[-1][:110] if head else ""))
        out.append("  O1: "+(orig[0][:110] if orig else ""))
        out.append("  On: "+(orig[-1][:110] if orig else ""))
        i=end+1
    else: i+=1
open(".local/cache/_create_blocks_index.txt","w",encoding="utf-8").write("\n".join(out))
print("\n".join(out))
