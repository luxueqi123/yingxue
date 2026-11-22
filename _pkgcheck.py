import os,io,json,zipfile,glob
root="plugin-packages"
ids=sorted({os.path.basename(p)[:-len(".yingce-plugin")] for p in glob.glob(os.path.join(root,"*.yingce-plugin"))})
print("artifacts:",len(ids))
missing_src=[]; diffs=[]
for pid in ids:
    src=os.path.join(root,pid)
    art=os.path.join(root,pid+".yingce-plugin")
    if not os.path.isdir(src):
        missing_src.append(pid); continue
    # files that build-packages.sh packages
    want=[]
    for name in ["manifest.json","README.md","LICENSE"]:
        if os.path.isfile(os.path.join(src,name)): want.append(name)
    for d in ["docs","assets","web","backend"]:
        base=os.path.join(src,d)
        if os.path.isdir(base):
            for dp,dn,fn in os.walk(base):
                for f in fn:
                    want.append(os.path.relpath(os.path.join(dp,f),src).replace("\\","/"))
    want=sorted(want)
    z=zipfile.ZipFile(art)
    have=sorted(z.namelist())
    if want!=have:
        diffs.append((pid,"FILESET",want[:6],have[:6])); continue
    bad=[]
    for n in want:
        a=open(os.path.join(src,n),"rb").read()
        b=z.read(n)
        if a!=b: bad.append(n)
    if bad: diffs.append((pid,"CONTENT",bad[:8],len(bad)))
print("no src dir:",len(missing_src))
for m in missing_src: print("  ",m)
print("mismatches:",len(diffs))
for d in diffs: print("  ",d)
