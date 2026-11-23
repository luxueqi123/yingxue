import io,os,zipfile,json
# 复刻 build-packages.sh 的 package_plugin：
#   cd pkg && find manifest.json README.md docs assets web backend LICENSE -type f | LC_ALL=C sort | zip -X -q out -@
ENTRIES=["manifest.json","README.md","docs","assets","web","backend","LICENSE"]
def collect(pkg):
    out=[]
    for e in ENTRIES:
        if os.path.isfile(e): out.append(e)
        elif os.path.isdir(e):
            for dp,dn,fn in os.walk(e):
                for f in fn: out.append(os.path.relpath(os.path.join(dp,f),".").replace("\\","/"))
    return sorted(set(out), key=lambda s: s.encode("utf-8"))   # LC_ALL=C sort
def rebuild(pid, dry=False):
    pkg=os.path.join("plugin-packages",pid); art=pkg+".yingce-plugin"
    files=collect(pkg)
    before=zipfile.ZipFile(art).namelist()
    # 保留原 artifact 的条目属性，仅用源目录内容重写
    old=zipfile.ZipFile(art)
    info={i.filename:i for i in old.infolist()}
    buf=io.BytesIO()
    with zipfile.ZipFile(buf,"w",zipfile.ZIP_DEFLATED) as z:
        for f in files:
            src=os.path.join(pkg,f)
            if not os.path.isfile(src):
                print("   MISSING",f); continue
            data=open(src,"rb").read()
            zi=zipfile.ZipInfo(f, date_time=(1980,1,1,0,0,0))
            zi.compress_type=zipfile.ZIP_DEFLATED
            zi.external_attr=0x81b60000
            zi.create_system=0
            z.writestr(zi,data)
    print("rebuilt %-34s entries %d -> %d"%(pid,len(before),len(files)))
    if not dry:
        open(art,"wb").write(buf.getvalue())
    return files
for pid in ["newapi-video-generations-v1","volcengine-ark-seedance"]:
    rebuild(pid)
