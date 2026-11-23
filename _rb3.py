import io,os,zipfile
ROOT=os.path.abspath("plugin-packages")
ENTRIES=["manifest.json","README.md","docs","assets","web","backend","LICENSE"]
def collect(pkgdir):
    out=[]
    for e in ENTRIES:
        fp=os.path.join(pkgdir,e)
        if os.path.isfile(fp): out.append(e)
        elif os.path.isdir(fp):
            for dp,dn,fn in os.walk(fp):
                for f in fn: out.append(os.path.relpath(os.path.join(dp,f),pkgdir).replace("\\","/"))
    return sorted(set(out),key=lambda s:s.encode("utf-8"))
for pid in ["newapi-video-generations-v1","volcengine-ark-seedance"]:
    pkgdir=os.path.join(ROOT,pid); art=os.path.join(ROOT,pid+".yingce-plugin")
    files=collect(pkgdir)
    buf=io.BytesIO()
    with zipfile.ZipFile(buf,"w",zipfile.ZIP_DEFLATED) as z:
        for f in files:
            zi=zipfile.ZipInfo(f,date_time=(1980,1,1,0,0,0))
            zi.compress_type=zipfile.ZIP_DEFLATED; zi.create_system=0; zi.external_attr=0x81b60000
            z.writestr(zi,open(os.path.join(pkgdir,f),"rb").read())
    blob=buf.getvalue()
    z2=zipfile.ZipFile(io.BytesIO(blob)); assert sorted(z2.namelist())==files and z2.testzip() is None
    open(art,"wb").write(blob)
    print("wrote %s (%d bytes, %d entries)"%(art,len(blob),len(files)))
