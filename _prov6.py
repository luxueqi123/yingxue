import subprocess,io,os
def blob(rev,p):
    r=subprocess.run(["git","cat-file","blob",rev+":"+p],capture_output=True)
    return r.stdout.decode("utf-8","replace").replace("\r\n","\n") if r.returncode==0 else None
for p in ["web/src/pages/settings/channel-settings-pane.tsx","web/src/pages/settings/comfyui-bridge-settings-pane.tsx","web/src/pages/settings/runninghub-settings-pane.tsx","web/src/pages/settings/local-cli-settings.tsx","web/src/components/brand/yingxue-brand-mark.tsx"]:
    h=blob("98822b65",p); u=blob("b9d60f98",p); b=blob("01a2d171",p)
    ex=os.path.exists(p)
    d=io.open(p,encoding="utf-8",errors="replace").read().replace("\r\n","\n") if ex else None
    st="NO-DISK"
    if d is not None:
        if h==d: st="HEAD-won"
        elif u==d: st="UP-won"
        elif h is None: st="UP-only"
        elif u is None: st="HEAD-only"
        elif h==u: st="same"
        else: st="UNION"
    print("%-11s H=%-6d U=%-6d B=%-6d  %s" % (st,len(h or ""),len(u or ""),len(b or ""),p))
