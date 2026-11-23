import json,io
d=json.load(io.open("plugin-packages/comfyui-workflow/manifest.json",encoding="utf-8"))
print("comfyui-workflow id:",d.get("id"),"ver",d.get("version"))
print("keys",list(d.keys()))
for w in d.get("contributes",{}).get("workflows",[])[:3]: print("  wf",w.get("id"))
print("workflows n:",len(d.get("contributes",{}).get("workflows",[])))
print("providers:",[p.get("id") for p in d.get("contributes",{}).get("providers",[])])
