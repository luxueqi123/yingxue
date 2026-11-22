import io,os,zipfile,sys
ROOT=os.path.abspath("plugin-packages")
ENTRIES=["manifest.json","README.md","docs","assets","web","backend","LICENSE"]
def collect(pkgdir):
    out=[]
    for e in ENTRIES:
        fp=os.path.join(pkgdir,e)
        if os.path.isfile(fp): out.append(e)
        elif os.path.isdir(fp):
            for dp,dn,fn in os.walk(fp):
                for f in fn:
                    rel=os.path.relpath(os.path.join(dp,f),pkgdir).replace("\\","/")
                    out.append(rel)
    return sorted(set(out),key=lambda s:s.encode("utf-8"))
def build(pid,dry=True):
    pkgdir=os.path.join(ROOT,pid)
    art=os.path.join(ROOT,pid+".yingce-plugin")
    files=collect(pkgdir)
    missing=[f for f in files if not os.path.isfile(os.path.join(pkgdir,f))]
    print("%-34s files=%d missing=%d"%(pid,len(files),len(missing)))
    if missing: print("   sample missing:",missing[:5]); return None
    buf=io.BytesIO()
    with zipfile.ZipFile(buf,"w",zipfile.ZIP_DEFLATED) as z:
        for f in files:
            data=open(os.path.join(pkgdir,f),"rb").read()
            zi=zipfile.ZipInfo(f,date_time=(1980,1,1,0,0,0))
            zi.compress_type=zipfile.ZIP_DEFLATED
            zi.create_system=0; zi.external_attr=0x81b60000
            z.writestr(zi,data)
    blob=buf.getvalue()
    z2=zipfile.ZipFile(io.BytesIO(blob))
    assert sorted(z2.namelist())==files
    print("   built %d bytes, entries=%d, zip test OK=%s"%(len(blob),len(files),z2.testzip() is None))
    if not dry: open(art,"wb").write(blob)
    return blob
for pid in ["newapi-video-generations-v1","volcengine-ark-seedance"]:
    build(pid,dry=True)
