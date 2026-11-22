import json
d=json.load(open("_spec_create.json",encoding="utf-8"))
for k in ["1","2","3","4","5","6","7","8","9","10"]:
    print("==== B",k)
    for l in d["web/src/pages/create/index.tsx"][k]: print("  |",l[:150])
