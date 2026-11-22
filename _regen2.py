import subprocess
P="web/src/pages/create/index.tsx"
a=open(P,"rb").read()
b=subprocess.run(["git","merge-file","-p","--diff3","_tmp3/ours","_tmp3/base","_tmp3/theirs"],capture_output=True).stdout
print("worktree==mergefile:", a.replace(b"\r\n",b"\n")==b.replace(b"\r\n",b"\n"))
s=b.decode("utf-8").replace("\r\n","\n").split("\n")
i=0;idx=0;out=[]
while i<len(s):
    if s[i].startswith("<<<<<<<"):
        idx+=1;k=i+1;mid=None;end=None
        while k<len(s):
            if s[k].startswith("=======") and mid is None: mid=k
            if s[k].startswith(">>>>>>>"): end=k;break
            k+=1
        out.append("##### B%d lines %d-%d"%(idx,i+1,end+1))
        out.append("--- HEAD ---")
        for j in range(i+1,mid): out.append("%d| %s"%(j+1,s[j]))
        out.append("--- ORIG ---")
        for j in range(mid+1,end): out.append("%d| %s"%(j+1,s[j]))
        i=end+1
    else: i+=1
open(".local/cache/_mf_create.txt","w",encoding="utf-8").write("\n".join(out))
print("blocks",idx,"lines",len(s))
