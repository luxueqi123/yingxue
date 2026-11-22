import subprocess,io,os
def blob(rev,p):
    r=subprocess.run(["git","show","%s:%s"%(rev,p)],capture_output=True)
    return None if r.returncode!=0 else r.stdout.replace(b"\r\n",b"\n")
def disk(p):
    return io.open(p,"rb").read().replace(b"\r\n",b"\n") if os.path.exists(p) else None
files=["web/src/services/resource-blob-cache.ts","web/src/services/api/generation-task.ts","web/src/pages/canvas/canvas-media-generation-executors.ts","web/src/lib/canvas/canvas-generation-task-sync.ts","web/src/stores/use-config-store.ts","web/src/pages/settings/index.tsx","web/src/pages/admin/channels/channels-page.tsx","web/src/main.tsx","web/src/router.tsx","web/src/components/layout/workspace-sidebar-nav.tsx","web/src/pages/create/creation-workspace.tsx","web/src/styles/globals.css","web/src/lib/app-theme.ts","web/src/pages/canvas/canvas-node-config.ts","web/src/components/canvas/canvas-angle-dialog.tsx","web/src/services/api/task-center.ts","web/src/services/api/auth.ts","web/src/stores/use-user-store.ts","web/src/services/api/custom-channel-relay.ts","web/src/lib/generation-error.ts"]
for p in files:
    h=blob("98822b65",p); u=blob("b9d60f98",p); d=disk(p)
    if h is None: k="NEW-UP"
    elif u is None: k="HEAD-ONLY"
    elif h==u: k="SAME"
    elif d==h and d!=u: k="HEAD-won"
    elif d==u and d!=h: k="UP-won"
    else: k="UNION/other"
    print(f"{k:10} {p}")
