import io,os,re,json,subprocess
# 每个失败测试文件 -> 它读的源码路径（来自 _trefs2 结果+人工）
mapping={
 "test/app-theme.test.ts":["web/src/lib/app-theme.ts","web/src/lib/skin-themes.ts","web/src/pages/admin/theme/admin-ant-theme.ts"],
 "test/appearance-bootstrap.test.ts":["web/src/pages/auth/auth-scene.tsx","web/src/main.tsx","web/index.html","web/src/components/brand/brand-logo.tsx","web/src/services/api/appearance.ts","web/src/stores/use-appearance-store.ts"],
 "test/ark-video-execution.test.ts":[],
 "test/canvas-angle-dialog.test.ts":["web/src/pages/canvas/project.tsx"],
 "test/canvas-image-upload.test.tsx":["web/src/lib/canvas/canvas-file-upload.ts","web/src/components/canvas/canvas-file-upload-content.tsx"],
 "test/canvas-node-config-reset.test.ts":["web/src/lib/canvas/canvas-project-domain.ts"],
 "test/create-canvas-handoff.test.ts":["web/src/pages/create/index.tsx","web/src/pages/create/creation-workspace.tsx","web/src/pages/canvas/project.tsx","web/src/services/creation-conversation-store.ts","web/src/lib/canvas/canvas-asset-handoff.ts"],
 "test/create-library-button.test.ts":["web/src/pages/create/index.tsx","web/src/pages/create/creation-workspace.tsx","web/src/components/layout/workspace-top-bar.tsx","web/src/components/assets/asset-library-picker-modal.tsx","web/src/components/canvas/canvas-node-prompt-panel.tsx"],
 "test/generation-task-local.test.ts":["web/src/services/api/task-center.ts","web/src/lib/generation-task-display.ts","web/src/pages/tasks/index.tsx","web/src/services/api/generation-task.ts","web/src/pages/canvas/use-canvas-generation.ts","web/src/lib/canvas/canvas-generation-task-sync.ts","web/src/pages/canvas/use-canvas-operation-history.ts","web/src/services/local-dreamina-generation.ts"],
 "test/kling-native-execution.test.ts":["web/src/lib/canvas/canvas-generation-task-sync.ts","web/src/services/resource-blob-cache.ts","web/src/lib/canvas/ltv-kling-options.ts"],
 "test/local-channel-permission.test.ts":["web/src/lib/desktop-local-channel.ts","web/src/services/api/generation-task.ts","web/src/services/api/custom-channel-relay.ts","web/src/services/api/image.ts","web/src/stores/use-config-store.ts","web/src/pages/settings/channel-settings-pane.tsx"],
 "test/local-channel-runtime-projection.node.test.mjs":["web/src/services/api/generation-task.ts","web/src/services/api/image.ts"],
 "test/local-channel-task-center.node.test.mjs":["web/src/services/api/task-center.ts"],
 "test/local-channel-ui.node.test.mjs":["web/src/pages/admin/channels/channels-page.tsx","web/src/pages/settings/index.tsx"],
 "test/local-cli-settings.test.ts":["web/src/pages/settings/index.tsx","web/src/pages/settings/local-cli-settings.tsx","web/src/pages/create/index.tsx"],
 "test/local-runtime-connection.test.ts":["web/src/components/layout/client-root-init.tsx","web/src/services/local-runtime.ts"],
 "test/ltv-audio-execution.test.ts":[],
 "test/project-document-persistence.test.ts":["web/src/lib/canvas/canvas-project-documents.ts","web/src/services/user-data-sync.ts","web/src/stores/canvas/use-canvas-store.ts","web/src/stores/use-asset-store.ts"],
 "test/settings-preference-spacing.test.ts":["web/src/pages/settings/index.tsx","web/src/styles/globals.css"],
 "test/topaz-video-execution.test.ts":[],
 "test/ui-kit-retirement.test.ts":[],
 "test/user-scoped-generation-persistence.test.ts":["web/src/lib/user-session.ts","web/src/services/user-data-sync.ts","web/src/services/canvas-asset-repair.ts","web/src/stores/use-asset-store.ts","web/src/stores/canvas/use-canvas-store.ts"],
 "test/workspace-route-loading.test.ts":["web/src/router.tsx","web/src/components/brand/yingxue-brand-lockup.tsx","web/src/components/layout/workspace-sidebar-nav.tsx","web/src/layouts/user-layout.tsx","web/src/lib/workspace-route-modules.ts"],
}
def blob(rev,p):
    r=subprocess.run(["git","cat-file","blob",rev+":"+p],capture_output=True)
    return r.stdout.decode("utf-8","replace").replace("\r\n","\n") if r.returncode==0 else None
H={}; U={}; B={}
for p in set(sum(mapping.values(),[])):
    H[p]=blob("98822b65",p); U[p]=blob("b9d60f98",p); B[p]=blob("01a2d171",p)
def lost_count(p):
    h,u,b=H[p],U[p],B[p]
    if h is None: return None,"UP-only/ABSENT-in-HEAD"
    if u is None: return 0,"HEAD-only(映雪新增文件,未被动)"
    if h==u: return 0,"HEAD==UP"
    if not os.path.exists(p): return None,"NO-DISK"
    d=io.open(p,encoding="utf-8",errors="replace").read().replace("\r\n","\n")
    if d==h: return 0,"HEAD-won(未动)"
    if d==u: return 0,"UP-won(整文件被上游覆盖)"
    bset=set(x.rstrip() for x in (b or "").split("\n"))
    yx=[x.rstrip() for x in h.split("\n") if x.strip() and x.rstrip() not in bset]
    ds=set(x.rstrip() for x in d.split("\n"))
    lost=[x for x in yx if x not in ds]
    return len(lost),"UNION"
out=io.open("_attrib.txt","w",encoding="utf-8")
for t,srcs in sorted(mapping.items()):
    out.write("\n=== %s\n"%t)
    for p in srcs:
        n,st=lost_count(p)
        flag = "  <<< 丢映雪行 %s"%n if (n or 0)>0 else ""
        out.write("   %-46s %s%s\n"%(p,st,flag))
out.close()
print(io.open("_attrib.txt",encoding="utf-8").read())
