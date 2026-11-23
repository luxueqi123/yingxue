import os,json,zipfile,difflib
def norm(b): return b.decode("utf-8","replace").replace("\r\n","\n")
for pid in ["newapi-video-generations-v1","official-payment-xunhupay","volcengine-ark-seedance","wavespeed-image-edit","comfyui-workflow"]:
    src="plugin-packages/%s"%pid; art=src+".yingce-plugin"
    z=zipfile.ZipFile(art)
    print("="*70); print(pid)
    names=[n for n in ["manifest.json","README.md","docs/interface.md"] if os.path.isfile(os.path.join(src,n))]
    for n in names:
        a=norm(open(os.path.join(src,n),"rb").read()); b=norm(z.read(n))
        if a==b: print("  ",n,"OK"); continue
        print("  ",n,"DIFF")
        d=list(difflib.unified_diff(a.splitlines(),b.splitlines(),"src","artifact",lineterm="",n=1))
        for l in d[:40]: print("     ",l[:190])
        print("     ...(diff lines:",len(d),")")
