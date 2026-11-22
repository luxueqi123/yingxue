import subprocess,io,os
def blob(rev,p):
    r=subprocess.run(["git","show","%s:%s"%(rev,p)],capture_output=True)
    return None if r.returncode!=0 else r.stdout.replace(b"\r\n",b"\n")
def disk(p):
    return io.open(p,"rb").read().replace(b"\r\n",b"\n") if os.path.exists(p) else None
cands="""web/src/lib/user-scope.ts
web/src/lib/generation-workflow-execution.ts
web/src/lib/desktop-local-channel.ts
web/src/services/api/image-models.ts
web/src/lib/canvas/agent-context-budget.ts
web/src/pages/settings/index.tsx
web/src/pages/admin/channels/channels-page.tsx
web/src/services/local-dreamina-generation.ts
web/src/services/local-dreamina-task-projection.ts
web/src/stores/use-local-dreamina-model-store.ts
web/src/services/api/generation-task.ts
web/src/services/resource-blob-cache.ts
web/src/main.tsx
web/src/lib/workspace-route-modules.ts
web/src/components/brand/yingxue-brand-lockup.tsx
web/src/pages/auth/auth-scene.tsx
web/src/services/api/skills.ts
web/src/services/project-document-sync.ts
web/src/components/canvas/nodes/canvas-angled-image-node.tsx
web/src/lib/app-theme.ts
web/src/styles/globals.css""".split()
for p in cands:
    h=blob("98822b65",p); u=blob("b9d60f98",p); d=disk(p)
    if d is None: k="MISSING-ON-DISK"
    elif h is None: k="NEW-UP"
    elif u is None: k="HEAD-ONLY"
    elif h==u: k="SAME"
    elif d==h and d!=u: k="HEAD-won"
    elif d==u and d!=h: k="UP-won(LOST!)"
    else: k="UNION"
    print(f"{k:16} {p}")
