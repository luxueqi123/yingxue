import json,os,shutil
d=json.load(open("_lossets.json",encoding="utf-8"))
n=0
for p in d["pure"]+d["xue"]:
    dst=os.path.join(".local/cache/pre-up-restore",p.replace("/","__"))
    shutil.copy2(p,dst); n+=1
print("backed up",n,"files to .local/cache/pre-up-restore/")
