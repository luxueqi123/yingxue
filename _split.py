import json,subprocess,difflib
def blob(rev,p):
    r=subprocess.run(["git","cat-file","blob",rev+":"+p],capture_output=True)
    return None if r.returncode!=0 else r.stdout
def n(b): return b.replace(b"\r\n",b"\n") if b else b
def L(b): return n(b).decode("utf-8","replace").splitlines()
lost=json.load(open("_lost_after.json",encoding="utf-8"))
full=[]; partial=[]
for p in lost:
    dk=blob("HEAD",p)   # HEAD==disk for these by construction? verify
    disk=open(p,"rb").read()
    if n(disk)==n(dk): full.append(p)
    else: partial.append(p)
print("=== A. 上游改动被 100%% 丢弃（disk 就是映雪 HEAD 原样）: %d 个 ==="%len(full))
for p in full:
    up=L(blob("MERGE_HEAD",p)); bs=L(blob("01a2d171",p))
    sm=difflib.SequenceMatcher(None,bs,up,autojunk=False)
    added=sum(i2-i1 for t,i1,i2,j1,j2 in sm.get_opcodes() if t in ("insert","replace"))
    print("   %-70s 上游新增%4d行"%(p[:70],added))
print()
print("=== B. 手工部分合并（仍缺上游内容）: %d 个 ==="%len(partial))
for p in partial: print("   ",p)
tot=0
for p in full+partial:
    up=L(blob("MERGE_HEAD",p)); dk=L(open(p,"rb").read())
    sm=difflib.SequenceMatcher(None,up,dk,autojunk=False)
    tot+=sum(i2-i1 for t,i1,i2,j1,j2 in sm.get_opcodes() if t in ("delete","replace"))
print("\n这 %d 个文件累计缺失上游文本行: %d"%(len(full+partial),tot))
json.dump({"full":full,"partial":partial},open("_lost_split.json","w",encoding="utf-8"),ensure_ascii=False,indent=1)
