import subprocess
P="web/src/pages/create/index.tsx"
for ref,name in [("01a2d171","base"),("HEAD","ours"),("MERGE_HEAD","theirs")]:
    open("_tmp3/"+name,"wb").write(subprocess.run(["git","show",f"{ref}:{P}"],capture_output=True).stdout)
cmd=["git","merge-file","-p","--diff3","_tmp3/ours","_tmp3/base","_tmp3/theirs"]
o1=subprocess.run(cmd,capture_output=True).stdout
o2=subprocess.run(cmd,capture_output=True).stdout
print("identical:",o1==o2,"bytes",len(o1))
open("_tmp3/MERGE.tsx","wb").write(o1)
s=o1.decode("utf-8").replace("\r\n","\n").split("\n")
print("lines",len(s),"markers",o1.decode("utf-8").count("<<<<<<<"))
i=0;idx=0
while i<len(s):
    if s[i].startswith("<<<<<<<"):
        idx+=1;k=i+1;mid=None;end=None
        while k<len(s):
            if s[k].startswith("=======") and mid is None: mid=k
            if s[k].startswith(">>>>>>>"): end=k;break
            k+=1
        print("B%d  LINES %d-%d  HEAD=%d ORIG=%d"%(idx,i+1,end+1,mid-i-1,end-mid-1))
        i=end+1
    else: i+=1
