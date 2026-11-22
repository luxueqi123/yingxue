import subprocess,io
def blob(rev,p):
    r=subprocess.run(["git","cat-file","blob",rev+":"+p],capture_output=True)
    return r.stdout.decode("utf-8","replace").replace("\r\n","\n") if r.returncode==0 else None
for p in ["web/src/lib/app-theme.ts"]:
    for rev in ["98822b65","b9d60f98"]:
        s=blob(rev,p)
        for i,l in enumerate(s.split("\n")):
            if "solidBg" in l or "solidFg" in l or "DEFAULT_CLASSIC_SKIN" in l:
                print(rev,i+1,l.strip())
        print("---")
