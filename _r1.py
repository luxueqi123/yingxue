import json,io
d=json.load(io.open("_iso_integrated.json",encoding="utf-8"))
tot=0; bad=[]
for k,v in d.items():
    if v["pass"] is None:
        bad.append(k)
    if v["fails"]: tot+=1
print("files:",len(d)," with fails:",tot," unparsed:",len(bad))
print("unparsed sample:", bad[:20])
print()
for k,v in d.items():
    if v["fails"]:
        print("###",k,v["pass"],"/ fail",v["failcount"])
        for x in v["fails"]: print("   -",x)
