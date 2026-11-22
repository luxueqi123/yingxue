import subprocess,difflib
def blob(rev,p):
    r=subprocess.run(["git","cat-file","blob",rev+":"+p],capture_output=True)
    return None if r.returncode!=0 else r.stdout
def lines(b): return b.replace(b"\r\n",b"\n").decode("utf-8","replace").splitlines()
for p in ["web/src/pages/settings/channel-settings-pane.tsx","web/src/services/api/custom-channel-relay.ts","backend/internal/platform/runtime_policy.go"]:
    up=lines(blob("MERGE_HEAD",p)); dk=lines(open(p,"rb").read())
    print("="*74); print(p)
    d=[l for l in difflib.unified_diff(up,dk,"上游v1.5.5","当前磁盘",lineterm="",n=1)]
    for l in d[:34]: print("   ",l[:170])
    print("    (总 diff 行 %d)"%len(d))
