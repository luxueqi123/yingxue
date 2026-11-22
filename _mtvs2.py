import io,subprocess,sys,os
MT="27356091de8b043cedf9a2f65e3fc95ae42f311a"
HEAD="HEAD"; UP="MERGE_HEAD"; BASE="01a2d171"
def blob(rev,p):
    r=subprocess.run(["git","cat-file","blob",rev+":"+p],capture_output=True)
    return None if r.returncode else r.stdout.decode("utf-8","replace").replace("\r\n","\n")
def lines(s):
    if s is None: return None
    return [l for l in s.split("\n")]
headtree=subprocess.run(["git","ls-tree","-r","--name-only",HEAD],capture_output=True).stdout.decode("utf-8","replace").split("\n")
files=[f for f in headtree if f.strip()]
# limit to code/doc files, skip binary-ish
rows=[]
for p in files:
    if p.startswith("web/test/") is False and not (p.startswith("web/src/") or p.startswith("backend/") or p.startswith("plugin-packages/") or p in ("README.md",) or p.startswith("docs/") or p.startswith("canvas-agent/") or p.endswith(".sh") or p.endswith(".json") or p.endswith(".mdx") or p.endswith(".yaml") or p.endswith(".yml") or p.endswith(".conf") or p.endswith(".html")): continue
    mt=blob(MT,p)
    if mt is None: continue
    if "<<<<<<<" in mt: continue
    try: d=io.open(p,encoding="utf-8").read().replace("\r\n","\n")
    except (FileNotFoundError,UnicodeDecodeError): continue
    hm=lines(blob(HEAD,p)); hu=lines(blob(UP,p))
    if mt==d: continue
    def retained(ref):
        if ref is None: return 0
        ds=set(x.strip() for x in d.split("\n") if x.strip())
        return sum(1 for x in ref if x.strip() and x.strip() in ds)
    rmt=retained(hm); rdk=retained(hm)
    rmu=retained(hu)
    rows.append((p,len(mt.split("\n")),len(d.split("\n")),rmt,rdk))
io.open("_mtvs2.txt","w",encoding="utf-8").write("%s | %s | %s | %s\n"%("file","MT行","disk行","HEAD行在MT/在disk"))
rows.sort()
for p,a,b,c,d in rows:
    io.open("_mtvs2.txt","a",encoding="utf-8").write("%-70s %6d %6d %6d %6d %s\n"%(p,a,b,c,d,"" if c<=d else "MT更多"))
print("conflict-free MT files differing from disk:",len(rows))
