import json,io,subprocess
p="plugin-packages/newapi-video-generations-v1/manifest.json"
d=json.load(io.open(p,encoding="utf-8"))
print("disk src ver",d["version"])
v=d["contributes"]["providers"][0]["response"]["videos"]
arr=v["$coalesce"] if isinstance(v,dict) else v
print("has $map:", any(isinstance(x,dict) and "$map" in x for x in arr))
s=json.dumps(d,ensure_ascii=False)
print("has end_image_url:", "end_image_url" in s, "| has Artdance:", "Artdance" in s)
