import subprocess,io,os,json
MT="27356091de8b043cedf9a2f65e3fc95ae42f311a"; HEAD="98822b65"; UP="b9d60f98"
def blob(rev,p):
    r=subprocess.run(["git","cat-file","blob",rev+":"+p],capture_output=True)
    return r.stdout.decode("utf-8","replace").replace("\r\n","\n") if r.returncode==0 else None
def lines(s): return set(x.rstrip() for x in s.split("\n") if x.strip())
rows=[]
allpaths=subprocess.run(["git","ls-tree","-r","--name-only",MT],capture_output=True,text=True,encoding="utf-8").stdout.split("\n")
allpaths=[p for p in allpaths if p]
for p in allpaths:
    if not os.path.exists(p): continue
    m=blob(MT,p); h=blob(HEAD,p); u=blob(UP,p)
    if m is None: continue
    if m.startswith("<<<<<<<"): rows.append((p,"CONFLICT",0,0)); continue
    d=io.open(p,encoding="utf-8",errors="replace").read().replace("\r\n","\n")
    if d.replace("\n","")==m.replace("\n",""): continue
    if h is None or u is None: continue
    if h==u: continue
    ls_m=lines(m); ls_h=lines(h); ls_u=lines(u)
    head_lost=len(ls_h-ls_m); up_lost=len(ls_u-ls_m)
    rows.append((p,"",head_lost,up_lost))
good=[r for r in rows if r[1]=="" and r[2]==0]
bad=[r for r in rows if r[1]=="" and r[2]>0]
conf=[r for r in rows if r[1]=="CONFLICT"]
print("total divergent:",len(rows),"merge-tree keeps all HEAD lines:",len(good),"loses HEAD lines:",len(bad),"conflicts:",len(conf))
print()
print("=== BAD (merge-tree also drops HEAD lines) ===")
for p,k,hl,ul in sorted(bad,key=lambda r:-r[2]): print("  HEADlost=%-4d UPlost=%-4d %s"%(hl,ul,p))
print()
print("=== CONFLICT ===")
for p,k,hl,ul in conf: print("  ",p)
json.dump([r[0] for r in good], io.open("_mtsafe.txt","w",encoding="utf-8"), ensure_ascii=False, indent=1)
