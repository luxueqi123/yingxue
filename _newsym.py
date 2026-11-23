import subprocess,difflib,json,re
def blob(rev,p):
    r=subprocess.run(["git","cat-file","blob",rev+":"+p],capture_output=True)
    return None if r.returncode!=0 else r.stdout
def L(b): return b.replace(b"\r\n",b"\n").decode("utf-8","replace").splitlines()
d=json.load(open("_lossets.json",encoding="utf-8"))
files=d["pure"]+d["xue"]
ID=re.compile(r"[A-Za-z_][A-Za-z0-9_]{4,}")
out={}
for p in files:
    bs=L(blob("01a2d171",p)); up=L(blob("MERGE_HEAD",p)); dk=L(open(p,"rb").read())
    dkset=set(dk)
    sm=difflib.SequenceMatcher(None,bs,up,autojunk=False)
    added=[]
    for t,i1,i2,j1,j2 in sm.get_opcodes():
        if t in ("insert","replace"): added.extend(up[j1:j2])
    miss=[l for l in added if l.strip() and l not in dkset]
    # 上游新增里，引用了磁盘上完全没有的标识符（= 上游新引入的东西）
    new_syms=[]
    for l in miss:
        for s in ID.findall(l):
            if s not in {x for line in dk for x in ID.findall(line)}:
                new_syms.append((s,l.strip()[:110])); break
    out[p]={"missing":len(miss),"with_new_symbols":len(new_syms),"samples":new_syms[:6],"miss_samples":[l.strip()[:110] for l in miss[:6]]}
for p,v in sorted(out.items(),key=lambda x:-x[1]["with_new_symbols"]):
    print("%-62s 缺%3d行 其中引用新符号%3d"%(p[:62],v["missing"],v["with_new_symbols"]))
    for s,l in v["samples"][:3]: print("       [%s] %s"%(s,l))
json.dump(out,open("_newsyms.json","w",encoding="utf-8"),ensure_ascii=False,indent=1)
