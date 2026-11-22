import subprocess,io,sys
def blob(rev,p):
    r=subprocess.run(["git","cat-file","blob","%s:%s"%(rev,p)],capture_output=True)
    return None if r.returncode else r.stdout.decode("utf-8","replace").replace("\r\n","\n")
def probe(rev,p,needles):
    s=blob(rev,p)
    if s is None: return "MISSING"
    return " ".join(("Y" if n in s else "n") for n in needles)
cases=[
 ("web/src/lib/user-session.ts",["managedModelChannels",'catalog.source === "frontend"',"PUBLIC_MODEL_CATALOG_ID","projectLogicalCapability"]),
 ("web/src/services/user-data-sync.ts",["remoteProjectLoadPromises","preserveCanvasSyncDraft","restoreRemoteCanvasHistory","agent-canvas-patch","canvasContentHash","syncDrafts","ApiError"]),
 ("web/src/stores/use-asset-store.ts",["readAllCanvasSyncDrafts","syncDrafts"]),
 ("web/src/services/canvas-asset-repair.ts",["rebindInconsistentCanvasAssets","collectCanvasMediaAssetIds","resourceIdFromStorageKey","isCanvasMediaNodeType"]),
 ("web/src/lib/canvas/canvas-project-domain.ts",["canonicalGenerationMetadata","generationSpec","applyNodeConfigPatch","clearGenerationParams"]),
 ("web/src/components/layout/client-root-init.tsx",["useLocalRuntimeBootstrap","useLocalDreaminaModelBootstrap",'@/lib/plugins/builtin"']),
 ("web/src/lib/app-theme.ts",['#09caf5','#171717','getWorkspaceAntThemeConfig']),
 ("web/src/pages/canvas/project.tsx",["CanvasNodePanelOverlay","<AppModal","CanvasNodeLightingPanel","destroyOnHidden"]),
]
for p,nd in cases:
    print("### %s"%p)
    print("   needles: %s"%nd)
    for rev,name in [("01a2d171","BASE"),("HEAD","HEAD映雪"),("MERGE_HEAD","UP上游"),(None,"disk")]:
        if rev is None:
            try: s=io.open(p,encoding="utf-8").read().replace("\r\n","\n")
            except FileNotFoundError: s=None
            v=("MISSING" if s is None else " ".join(("Y" if n in s else "n") for n in nd))
        else: v=probe(rev,p,nd)
        print("   %-8s %s"%(name,v))
