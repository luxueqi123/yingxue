import subprocess, os, shutil
P="web/src/pages/create/index.tsx"
shutil.copy(P, "_idx_broken.tsx")
os.makedirs("_tmp3", exist_ok=True)
for ref,name in [("01a2d171","base"),("HEAD","ours"),("MERGE_HEAD","theirs")]:
    data=subprocess.run(["git","show",f"{ref}:{P}"],capture_output=True).stdout
    open(f"_tmp3/{name}","wb").write(data)
r=subprocess.run(["git","merge-file","-p","--diff3","_tmp3/ours","_tmp3/base","_tmp3/theirs"],capture_output=True)
print("rc",r.returncode,"len",len(r.stdout))
open("_tmp3/merged.tsx","wb").write(r.stdout)
r2=subprocess.run(["git","merge-file","-p","_tmp3/ours","_tmp3/base","_tmp3/theirs"],capture_output=True)
open("_tmp3/merged2.tsx","wb").write(r2.stdout)
s=r2.stdout.decode("utf-8").replace("\r\n","\n").split("\n")
idx=0;i=0
while i<len(s):
    if s[i].startswith("<<<<<<<"):
        idx+=1;k=i+1;mid=None;end=None
        while k<len(s):
            if s[k].startswith("=======") and mid is None: mid=k
            if s[k].startswith(">>>>>>>"): end=k;break
            k+=1
        print(f"B{idx} lines {i+1}-{end+1} HEAD={mid-i-1} ORIG={end-mid-1}  H1={s[i+1][:60]!r} O1={s[mid+1][:60]!r}")
        i=end+1
    else: i+=1
print("blocks",idx,"total lines",len(s))
