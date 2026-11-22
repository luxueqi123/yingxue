import io,subprocess,hashlib
srcs="""web/src/lib/user-session.ts
web/src/services/user-data-sync.ts
web/src/stores/use-asset-store.ts
web/src/services/canvas-asset-repair.ts
web/src/lib/canvas/canvas-project-domain.ts
web/src/pages/settings/index.tsx
web/src/pages/canvas/project.tsx
web/src/lib/client-root-init.tsx
web/src/pages/create/index.tsx
web/src/components/layout/workspace-sidebar-nav.tsx
web/src/lib/canvas/canvas-generation-task-sync.ts
web/src/lib/canvas/canvas-node-config.ts
web/src/lib/canvas/ltv-kling-options.ts
web/src/components/brand/yingxue-brand-lockup.tsx
web/src/lib/skin-themes.ts
web/src/pages/admin/theme/admin-ant-theme.ts
web/src/styles/globals.css
web/src/services/api/request.ts
web/src/layouts/user-layout.tsx
web/src/router.tsx
web/src/pages/wallet/index.tsx
web/src/pages/create/creation-workspace.tsx
web/src/components/layout/workspace-top-bar.tsx
web/src/components/layout/app-top-nav.tsx
web/src/hooks/use-wallet-balance.ts
web/src/components/assets/asset-library-picker-modal.tsx
web/src/components/canvas/canvas-file-upload-content.tsx
web/src/stores/use-appearance-store.ts
web/src/components/brand/brand-logo.tsx
web/src/lib/canvas/canvas-media-generation-executors.ts
web/src/pages/canvas/use-canvas-generation.ts
web/src/components/model-picker.tsx
web/src/components/canvas/canvas-node-prompt-panel.tsx
web/src/lib/canvas/canvas-generation-layout.ts
web/src/pages/create/index.tsx""".split()
def blob(rev,p):
    r=subprocess.run(["git","cat-file","blob",rev+":"+p],capture_output=True)
    return None if r.returncode else r.stdout.decode("utf-8","replace").replace("\r\n","\n")
def h(s): return "MISSING" if s is None else hashlib.md5(s.encode()).hexdigest()[:8]
print("%-58s %-9s %-9s %-9s %s"%("file","disk","HEAD","UP","verdict"))
for p in dict.fromkeys(srcs):
    try: d=io.open(p,encoding="utf-8",errors="replace").read().replace("\r\n","\n")
    except FileNotFoundError: d=None
    a=blob("HEAD",p); b=blob("MERGE_HEAD",p)
    if d is None: v="NO-DISK"
    elif a==b: v="same-both"
    elif d==a: v="disk=HEAD(映雪)"
    elif d==b: v="disk=UP"
    else: v="UNION/OTHER"
    print("%-58s %-9s %-9s %-9s %s"%(p,h(d),h(a),h(b),v))
