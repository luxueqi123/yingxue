s=open("_tmp3/MERGE.tsx",encoding="utf-8").read().replace("\r\n","\n").split("\n")
i=0;idx=0;out=[]
while i<len(s):
    if s[i].startswith("<<<<<<<"):
        idx+=1;k=i+1;mid=None;end=None
        while k<len(s):
            if s[k].startswith("=======") and mid is None: mid=k
            if s[k].startswith(">>>>>>>"): end=k;break
            k+=1
        out.append("##### B%d file-lines %d-%d"%(idx,i+1,end+1))
        out.append("--- HEAD ---")
        for j in range(i+1,mid): out.append("H%05d| %s"%(j+1,s[j]))
        out.append("--- ORIG ---")
        for j in range(mid+1,end): out.append("O%05d| %s"%(j+1,s[j]))
        i=end+1
    else: i+=1
open(".local/cache/_mf_blocks.txt","w",encoding="utf-8").write("\n".join(out))
print("ok",len(out))
