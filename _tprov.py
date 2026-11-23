import io,os,re,subprocess,json
HEAD="98822b65"; UP="b9d60f98"; BASE="01a2d171"
def blob(rev,p):
    r=subprocess.run(["git","cat-file","blob",rev+":"+p],capture_output=True,encoding=None)
    return r.stdout if r.returncode==0 else None
files=[l.strip() for l in io.open("_failfiles.txt",encoding="utf-8") if l.strip()]
for f in files:
    h=blob(HEAD,f); u=blob(UP,f); b=blob(BASE,f)
    disk=io.open(f,"rb").read() if os.path.exists(f) else None
    tag=[]
    tag.append("H" if h is not None else "-")
    tag.append("U" if u is not None else "-")
    tag.append("B" if b is not None else "-")
    print("###",f," ".join(tag))
    print("    disk==HEAD:",disk is not None and h is not None and disk==h, " disk==UP:",disk is not None and u is not None and disk==u)
