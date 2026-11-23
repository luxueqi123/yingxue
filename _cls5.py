import io,subprocess,hashlib,sys,json
BASE="01a2d171"; HEAD="HEAD"; UP="MERGE_HEAD"; MT="27356091de8b043cedf9a2f65e3fc95ae42f311a"
def raw(rev,p):
    r=subprocess.run(["git","cat-file","blob",rev+":"+p],capture_output=True)
    return None if r.returncode else r.stdout
def txt(b): return None if b is None else b.decode("utf-8","replace").replace("\r\n","\n")
def h(b): return "------" if b is None else hashlib.md5(b).hexdigest()[:6]

# list files in HEAD tree
out=subprocess.run(["git","ls-tree","-r","--name-only",HEAD],capture_output=True).stdout.decode("utf-8","replace").split("\n")
files=[f for f in out if f.strip()]
rows=[]
for p in files:
    hb=raw(BASE,p); hh=raw(HEAD,p); hu=raw(UP,p)
    if hh==hb and hu==hh: continue          # untouched
    if hh==hb and hu!=hh: kind="UP-only"
    elif hu==hh: kind="SAME"
    else: kind="CUSTOM"
    try: d=io.open(p,"rb").read()
    except FileNotFoundError: d=None
    else: d=None if not p else d
    disk=d
    rows.append((p,kind,h(hb),h(hh),h(hu),h(disk),raw(MT,p) is not None and h(raw(MT,p))))
print("%-6s %-9s %-7s %-7s %-7s %-7s %s"%("kind","base","HEAD","UP","disk","MT","path"))
cnt={}
for r in sorted(rows,key=lambda r:(r[1],r[0])):
    cnt[r[1]]=cnt.get(r[1],0)+1
    if r[1]!="UP-only":
        print("%-6s %-9s %-7s %-7s %-7s %-7s %s"%(r[1],r[2],r[3],r[4],r[5],r[6],r[0]))
print("counts",cnt,"total",len(rows))
