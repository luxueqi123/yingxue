import os
for pid in ["comfyui-workflow","newapi-video-generations-v1","official-payment-xunhupay","volcengine-ark-seedance","wavespeed-image-edit"]:
    src="plugin-packages/"+pid
    fl=[]
    for dp,dn,fn in os.walk(src):
        for f in fn: fl.append(os.path.relpath(os.path.join(dp,f),src).replace("\\","/"))
    print(pid, "dirExists", os.path.isdir(src), len(fl))
    for f in sorted(fl)[:12]: print("   ",f)
