import subprocess,io,os,json
def blob(rev,p):
    r=subprocess.run(["git","cat-file","blob",rev+":"+p],capture_output=True)
    return r.stdout if r.returncode==0 else None
def norm(x): return x.replace(b"\r\n",b"\n") if x is not None else None
def state(p):
    h=norm(blob("98822b65",p)); u=norm(blob("b9d60f98",p)); b=norm(blob("01a2d171",p))
    d=norm(io.open(p,"rb").read()) if os.path.exists(p) else None
    if d is None: return "NO-DISK"
    if h is None: return "UP-only"
    if u is None: return "HEAD-only" + ("" if d==h else "!!disk!=HEAD")
    if h==u: return "same"
    if d==h: return "HEAD-won"
    if d==u: return "UP-won"
    return "UNION"
a=json.load(io.open("_iso_premerge.json",encoding="utf-8"))
basefail={k:set(v["fails"]) for k,v in a.items() if v["fails"]}
print("基线失败文件数:",len(basefail),"失败用例:",sum(len(v) for v in basefail.values()))
for k in sorted(basefail): print("   %-58s %d"%(k,len(basefail[k])))
print()
print("=== 关键文件状态 ===")
for p in ["web/src/components/brand/yingxue-brand-lockup.tsx","web/src/pages/auth/auth-scene.tsx","web/src/router.tsx",
          "web/src/lib/skin-themes.ts","web/src/pages/admin/theme/admin-ant-theme.ts","web/src/lib/app-theme.ts",
          "web/src/pages/canvas/canvas-media-generation-executors.ts","web/src/pages/settings/index.tsx",
          "web/src/styles/globals.css","web/src/main.tsx","web/index.html","web/src/components/brand/brand-logo.tsx",
          "web/src/stores/use-appearance-store.ts","web/src/lib/canvas/canvas-project-domain.ts",
          "web/src/components/layout/client-root-init.tsx","web/src/lib/user-session.ts","web/src/services/user-data-sync.ts",
          "web/src/stores/canvas/use-canvas-store.ts","web/src/stores/use-asset-store.ts","web/src/services/canvas-asset-repair.ts",
          "web/src/layouts/user-layout.tsx","web/src/pages/create/index.tsx","web/src/pages/create/creation-workspace.tsx",
          "web/src/components/assets/asset-library-picker-modal.tsx","web/src/services/api/image.ts"]:
    print("%-18s %s"%(state(p),p))
