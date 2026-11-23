import io,os,re,json,subprocess
files=[l.strip() for l in io.open("_failfiles.txt",encoding="utf-8") if l.strip()]
log=io.open("_faillog.txt",encoding="utf-8").read()
blocks=re.split(r"\n--- FAIL: ",log)
# extract expected strings per fail from log
exp={}
for b in blocks[1:]:
    title=b.split("\n",1)[0].split(" [")[0].strip()
    strs=[]
    m=re.search(r"Expected to contain: ((?:.|\n)*?)\n(?:error|AT|\(fail\)|$)", b)
    if m:
        s=m.group(1).strip()
        if s.startswith('"'): s=s.strip('"')
        if len(s)<200: strs.append(s)
    if strs: exp.setdefault(title,[]).extend(strs)
out=io.open("_locate.txt","w",encoding="utf-8")
# grep git HEAD tree for each string
def search(rev,s):
    if not s: return []
    r=subprocess.run(["git","grep","-l","-F",s,rev],capture_output=True,text=True,encoding="utf-8",errors="replace")
    return [x.split(":",1)[1] for x in r.stdout.split("\n") if ":" in x]
for title,ss in exp.items():
    out.write("### "+title+"\n")
    for s in ss[:4]:
        hits=search("98822b65",s)
        disk=[]
        for h in hits:
            if os.path.exists(h):
                try:
                    if s in io.open(h,encoding="utf-8",errors="replace").read(): disk.append(h)
                except Exception: pass
        missing=[h for h in hits if h not in disk]
        out.write("   STR: %s\n      HEAD-hits=%d  still-on-disk=%d  LOST-IN=%s\n"%(s[:110],len(hits),len(disk),missing[:6]))
out.close()
print("ok")
