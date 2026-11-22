import os,json,zipfile,glob
def norm(b): return b.replace(b"\r\n",b"\n")
root="plugin-packages"
ids=sorted({os.path.basename(p)[:-len(".yingce-plugin")] for p in glob.glob(os.path.join(root,"*.yingce-plugin"))})
mis=[]
for pid in ids:
    src=os.path.join(root,pid); art=os.path.join(root,pid+".yingce-plugin")
    if not os.path.isdir(src): continue
    want=[]
    for name in ["manifest.json","README.md","LICENSE"]:
        if os.path.isfile(os.path.join(src,name)): want.append(name)
    for d in ["docs","assets","web","backend"]:
        base=os.path.join(src,d)
        if os.path.isdir(base):
            for dp,dn,fn in os.walk(base):
                for f in fn: want.append(os.path.relpath(os.path.join(dp,f),src).replace("\\","/"))
    want=sorted(want); z=zipfile.ZipFile(art); have=sorted(z.namelist())
    if want!=have: mis.append((pid,"FILESET",sorted(set(want)-set(have)),sorted(set(have)-set(want)))); continue
    bad=[n for n in want if norm(open(os.path.join(src,n),"rb").read())!=norm(z.read(n))]
    if bad: mis.append((pid,"CONTENT",bad,len(bad)))
print("total artifacts",len(ids),"mismatched",len(mis))
for m in mis: print("  ",m)
