import subprocess,io,json,zipfile
def blob(rev,p):
    r=subprocess.run(["git","cat-file","blob",rev+":"+p],capture_output=True)
    return r.stdout if r.returncode==0 else None
# pick a package untouched by the merge
for pid in ["adobe-firefly","anthropic-messages","deepseek-chat"]:
    art="plugin-packages/%s.yingce-plugin"%pid
    d=open(art,"rb").read()
    h=blob("HEAD",art); m=blob("MERGE_HEAD",art)
    srcm="plugin-packages/%s/manifest.json"%pid
    ds=open(srcm,"rb").read()
    hs=blob("HEAD",srcm); ms=blob("MERGE_HEAD",srcm)
    print(pid,"artifact disk==HEAD",d==h,"disk==MERGE",d==m,"| src disk==HEAD",ds==hs,"disk==MERGE",ds==ms)
