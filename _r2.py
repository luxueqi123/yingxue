import json,io
a=json.load(io.open("_iso_premerge.json",encoding="utf-8"))
b=json.load(io.open("_iso_integrated.json",encoding="utf-8"))
pa=sum(len(v["fails"]) for v in a.values()); pb=sum(len(v["fails"]) for v in b.values())
print("PRE  fails:",pa,"files w fails:",sum(1 for v in a.values() if v['fails']))
print("POST fails:",pb,"files w fails:",sum(1 for v in b.values() if v['fails']))
print()
newf=[]; 
for k in sorted(set(a)|set(b)):
    fa=set(a.get(k,{}).get("fails",[])); fb=set(b.get(k,{}).get("fails",[]))
    n=sorted(fb-fa)
    if n: newf.append((k,n))
tot=0
for k,n in newf:
    tot+=len(n)
    print("###",k)
    for x in n: print("   NEW -",x)
print("\nTOTAL NEW:",tot)
