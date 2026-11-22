import io
src = io.open(".local/cache/_h_gt.ts", encoding="utf-8", newline="").read()
orig = src
# 1) budget import -> disk module name
src = src.replace('import { assertAgentExchangeBudget } from "@/lib/canvas/canvas-agent-context-budget";',
                  'import { assertAgentExchangeBudget } from "@/lib/canvas/agent-context-budget";')
# 2) prepareGenerationReferences: accept mode + upstream ark asset resolution
old_sig = 'export async function prepareGenerationReferences({\n    config,\n    referenceImages = [],\n    referenceVideos = [],\n    referenceAudios = [],\n    mask,\n}: Pick<BackendGenerationTaskOptions, "config" | "referenceImages" | "referenceVideos" | "referenceAudios" | "mask">): Promise<PreparedGenerationReferences> {\n    const preferArkAssetUrl = usesArkVideoAssetReference(config);'
new_sig = 'export async function prepareGenerationReferences({\n    config,\n    mode,\n    referenceImages = [],\n    referenceVideos = [],\n    referenceAudios = [],\n    mask,\n}: Pick<BackendGenerationTaskOptions, "config" | "mode" | "referenceImages" | "referenceVideos" | "referenceAudios" | "mask">): Promise<PreparedGenerationReferences> {\n    // asset:// 仅视频生成可用；Agent Plan Seedream 与 Seedance 共用 /api/plan/v3，不能按 BaseURL 误判。\n    const preferArkAssetUrl = mode === "video" && usesArkVideoAssetReference(config);'
assert old_sig in src, "sig not found"
src = src.replace(old_sig, new_sig)
old_ark = '    return resolveModelRequestConfig(config, config.model).interfaceType === "volcengine-ark-video" || isArkPlanBaseUrl(config.baseUrl || "");'
new_ark = '    const interfaceType = resolveModelRequestConfig(config, config.model).interfaceType;\n    if (interfaceType === "volcengine-ark-video" || interfaceType === "volcengine-ark-agent-plan-video") return true;\n    if (interfaceType === "volcengine-ark-image" || interfaceType === "volcengine-ark-agent-plan-image") return false;\n    return isArkPlanBaseUrl(config.baseUrl || "");'
assert old_ark in src, "ark not found"
src = src.replace(old_ark, new_ark)
# 3) local dreamina callers must pass config+mode shape (already mode present in options)
io.open("web/src/services/api/generation-task.ts","w",encoding="utf-8",newline="").write(src)
print("written", len(src.split("\n")), "lines; changed:", src!=orig)
