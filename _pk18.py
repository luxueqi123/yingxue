import json,zipfile
z=zipfile.ZipFile("plugin-packages/autodl-comfyui.yingce-plugin")
m=json.loads(z.read("manifest.json").decode("utf-8"))
print("id",m.get("id"),"ver",m.get("version"))
print("providers",[p.get("id") for p in m.get("contributes",{}).get("providers",[])])
