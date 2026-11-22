import json,io,zipfile,difflib
src=json.load(io.open("plugin-packages/newapi-video-generations-v1/manifest.json",encoding="utf-8"))
z=zipfile.ZipFile("plugin-packages/newapi-video-generations-v1.yingce-plugin")
art=json.loads(z.read("manifest.json").decode("utf-8"))
print("src ver",src["version"],"art ver",art["version"])
def sm(x): return json.dumps(x,ensure_ascii=False,indent=1,sort_keys=True).splitlines()
a=sm(src); b=sm(art)
print("src lines",len(a),"art lines",len(b))
print("identical:", a==b)
d=[l for l in difflib.unified_diff(a,b,"src","artifact",lineterm="")][:60]
for l in d: print(l[:200])
