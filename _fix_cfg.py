from pathlib import Path
p = Path('web/src/stores/use-config-store.ts')
t = p.read_text(encoding='utf-8')
n = t
def rep(a, b, cnt=1, label=''):
    global n
    if a not in n:
        raise SystemExit('MISS [%s]: %r' % (label, a[:90]))
    n = n.replace(a, b, cnt)

# 1) imports
rep('import { scopedLocalStorage } from "@/lib/user-scope";',
    'import { projectDesktopLocalChannelRuntime } from "@/lib/desktop-local-channel";\nimport { scopedLocalStorage } from "@/lib/user-scope";',
    label='imports-projectDesktop')
rep('import { useUserStore } from "@/stores/use-user-store";',
    'import { useLocalDreaminaModelStore } from "@/stores/use-local-dreamina-model-store";\nimport { useUserStore } from "@/stores/use-user-store";',
    label='imports-dreaminaStore')
rep('import type { CapabilitySpec, PublicLogicalModelPriceTier } from "@/services/api/logical-models";',
    'import type { DreaminaLocalModel } from "@/services/local-dreamina-model-catalog";\nimport type { CapabilitySpec, PublicLogicalModelPriceTier } from "@/services/api/logical-models";',
    label='imports-dreaminaType')

# 2) ComfyBridge types (before WorkflowGraphPreview)
rep('export type WorkflowGraphPreview = {',
    'export type ComfyBridgeWorkflow = {\n'
    '    workflowId: string;\n'
    '    title?: string;\n'
    '    capability: "image" | "video" | "audio";\n'
    '    fields?: WorkflowFieldMapping[];\n'
    '    workflowJson?: Record<string, unknown>;\n'
    '    workflowGraph?: WorkflowGraphPreview;\n'
    '};\n\n'
    'export type WorkflowGraphPreview = {', label='ComfyBridgeWorkflow')
rep('// 兼容仍在使用旧目录标识的会话恢复和模型选择器。',
    'export type ComfyBridgeConfig = {\n'
    '    enabled: boolean;\n'
    '    bridgeId: string;\n'
    '    comfyUrl: string;\n'
    '    workflowDir: string;\n'
    '    workflowId: string;\n'
    '    capability: "image" | "video" | "audio";\n'
    '    workflows: ComfyBridgeWorkflow[];\n'
    '};\n\n'
    '// 兼容仍在使用旧目录标识的会话恢复和模型选择器。', label='ComfyBridgeConfig')

# 3) ModelChannel fields
rep('    name: string;\n    sortOrder?: number;',
    '    name: string;\n    publicAlias?: string;\n    sortOrder?: number;', label='ModelChannel-publicAlias')
rep('    baseUrl: string;\n    apiKey: string;',
    '    baseUrl: string;\n    allowLocalChannel?: boolean;\n    apiKey: string;', label='ModelChannel-allowLocalChannel')
rep('    }>;\n};',
    '    }>;\n    transport?: "backend-channel" | "local-runtime";\n    localModels?: DreaminaLocalModel[];\n};', label='ModelChannel-transport')

# 4) AiConfig
rep('    channelMode: "remote";', '    channelMode: "remote" | "local";', label='AiConfig-channelMode')
rep('    runningHub: RunningHubConfig;\n    /** 仅用于单次生成任务路由，不属于全局渠道启用状态。 */',
    '    runningHub: RunningHubConfig;\n    comfyBridge: ComfyBridgeConfig;\n    /** 仅用于单次生成任务路由，不属于全局渠道启用状态。 */',
    label='AiConfig-comfyBridge')
rep('    taskWorkflowProvider?: "model" | "runninghub";',
    '    taskWorkflowProvider?: "model" | "runninghub" | "comfyui";', label='AiConfig-taskWorkflowProvider')

# 5) defaultConfig
rep('export const defaultConfig: AiConfig = {\n    channelMode: "remote",',
    'export const defaultConfig: AiConfig = {\n    channelMode: "local",', label='default-channelMode')
rep('    taskWorkflowProvider: "model",',
    '    comfyBridge: { enabled: false, bridgeId: "", comfyUrl: "http://127.0.0.1:8188", workflowDir: "D:\\\\ComfyUI\\\\workflows", workflowId: "", capability: "image", workflows: [] },\n    taskWorkflowProvider: "model",',
    label='default-comfyBridge')

# 6) configuredModelMatchesCapability local models
rep('        const modelName = decoded?.model || modelOptionName(model);\n        const costEntry',
    '        const modelName = decoded?.model || modelOptionName(model);\n        const local = channel?.localModels?.find((item) => item.id === modelName);\n        if (local) return local.modality === capability;\n        const costEntry',
    label='localModels-match')

# 7) isAiConfigReady comfyui + local-runtime
rep('    const channel = resolveModelChannel(config, model);\n    return Boolean(model.trim() && channel.baseUrl.trim() && channel.apiKey.trim());',
    '    if (config.taskWorkflowProvider === "comfyui") {\n'
    '        return Boolean(config.comfyBridge.enabled && config.comfyBridge.bridgeId.trim() && config.comfyBridge.workflowId.trim());\n'
    '    }\n'
    '    const channel = resolveModelChannel(config, model);\n'
    '    if (channel.transport === "local-runtime") return channel.enabled !== false && Boolean(channel.localModels?.some((item) => item.id === modelOptionName(model)));\n'
    '    return Boolean(model.trim() && channel.baseUrl.trim() && channel.apiKey.trim());', label='isAiConfigReady')

# 8) normalizeComfyBridge before const config = {
rep('    const config = {\n',
    '    const persistedComfyBridge = persistedConfig.comfyBridge;\n'
    '    const comfyBridgeCapability = normalizeRunningHubCapability(persistedComfyBridge?.capability, defaultConfig.comfyBridge.capability);\n'
    '    const comfyBridgeWorkflows = Array.isArray(persistedComfyBridge?.workflows)\n'
    '        ? persistedComfyBridge.workflows\n'
    '              .filter((item): item is ComfyBridgeWorkflow => Boolean(item && typeof item === "object" && String(item.workflowId || "").trim()))\n'
    '              .map((item) => {\n'
    '                  const capability = normalizeRunningHubCapability(item.capability, comfyBridgeCapability);\n'
    '                  return {\n'
    '                      ...item,\n'
    '                      workflowId: String(item.workflowId || "").trim(),\n'
    '                      capability,\n'
    '                      fields: normalizeSavedWorkflowFields(item, capability),\n'
    '                  };\n'
    '              })\n'
    '        : [];\n'
    '    const config = {\n', label='normalizeComfyBridge')

rep('            workflows: runningHubWorkflows,\n        },',
    '            workflows: runningHubWorkflows,\n'
    '        },\n'
    '        comfyBridge: {\n'
    '            ...defaultConfig.comfyBridge,\n'
    '            ...(persistedComfyBridge || {}),\n'
    '            capability: comfyBridgeCapability,\n'
    '            workflowId: String(persistedComfyBridge?.workflowId || "").trim(),\n'
    '            workflows: comfyBridgeWorkflows,\n'
    '        },', label='normalizeComfyBridge-values')

rep('            channelMode: "remote" as const,', '            channelMode: "local" as const,', label='normalize-channelMode')

# 9) effectiveConfigWithDreamina
rep('    return useMemo(() => effectiveConfigForCustomChannels(config, customChannelsEnabled), [config, customChannelsEnabled]);',
    '    const catalogState = useLocalDreaminaModelStore((state) => state.state);\n'
    '    const dreaminaModels = useLocalDreaminaModelStore((state) => state.models);\n'
    '    return useMemo(() => effectiveConfigWithDreamina(effectiveConfigForCustomChannels(config, customChannelsEnabled), catalogState, dreaminaModels), [catalogState, config, customChannelsEnabled, dreaminaModels]);',
    label='useEffectiveConfig')

rep('    const channels = config.channels.filter((channel) => channel.scope === "system");',
    '    const channels = config.channels.filter((channel) => channel.scope === "system" || channel.transport === "local-runtime");',
    label='customChannels-filter')

rep('export function normalizeConfigSnapshot',
    'export function effectiveConfigWithDreamina(config: AiConfig, catalogState: "idle" | "loading" | "ready" | "error", dreaminaModels: DreaminaLocalModel[]): AiConfig {\n'
    '    if (catalogState !== "ready" || !dreaminaModels.length) return { ...config, channelMode: "local" };\n'
    '    const channel: ModelChannel = {\n'
    '        id: "local:dreamina-cli",\n'
    '        name: "官方即梦 CLI",\n'
    '        baseUrl: "",\n'
    '        apiKey: "",\n'
    '        apiFormat: "openai",\n'
    '        models: dreaminaModels.map((item) => item.id),\n'
    '        scope: "user",\n'
    '        enabled: true,\n'
    '        transport: "local-runtime",\n'
    '        localModels: dreaminaModels,\n'
    '    };\n'
    '    const channels = [...config.channels.filter((item) => item.id !== channel.id), channel];\n'
    '    const models = modelOptionsFromChannels(channels);\n'
    '    return {\n'
    '        ...config,\n'
    '        channelMode: "local",\n'
    '        channels,\n'
    '        models,\n'
    '        imageModels: filterModelsByCapability(models, "image", channels),\n'
    '        videoModels: filterModelsByCapability(models, "video", channels),\n'
    '        textModels: filterModelsByCapability(models, "text", channels),\n'
    '        audioModels: filterModelsByCapability(models, "audio", channels),\n'
    '    };\n'
    '}\n\n'
    'export function normalizeConfigSnapshot', label='effectiveConfigWithDreamina')

# 10) decodeChannelModel
rep('    const index = value.indexOf(CHANNEL_MODEL_SEPARATOR);',
    '    const local = /^local:dreamina-cli:([A-Za-z0-9][A-Za-z0-9._:-]{0,119})$/.exec(value.trim());\n'
    '    if (local) return { channelId: "local:dreamina-cli", model: local[1] };\n'
    '    const index = value.indexOf(CHANNEL_MODEL_SEPARATOR);', label='decodeChannelModel')

# 11) modelOptionsFromChannels local encode
rep('                .map((model) => encodeChannelModel(channel.id, model)),',
    '                .map((model) => (channel.transport === "local-runtime" ? `local:dreamina-cli:${model}` : encodeChannelModel(channel.id, model))),',
    label='modelOptionsFromChannels')

# 12) channelConnectionSignature + resolveModelRequestConfig + projectDesktopLocalChannelRuntime
rep('channel.interfaceType || "auto", JSON.stringify(channel.headers || [])].join("\\n");',
    'channel.interfaceType || "auto", channel.allowLocalChannel === true ? "local:1" : "local:0", JSON.stringify(channel.headers || [])].join("\\n");',
    label='channelConnectionSignature')
rep('    return {\n        ...config,',
    '    return projectDesktopLocalChannelRuntime({\n        ...config,', label='resolveModelRequestConfig-open')
rep('        channelId: channel.scope === "system" ? channel.id : "",\n    };\n}',
    '        channelId: channel.scope === "system" ? channel.id : "",\n    });\n}', label='resolveModelRequestConfig-close')
rep('        baseUrl: channel.baseUrl,\n        apiKey: channel.apiKey,',
    '        baseUrl: channel.baseUrl,\n        allowLocalChannel: channel.allowLocalChannel === true,\n        apiKey: channel.apiKey,',
    label='resolveModelRequestConfig-allowLocal')

p.write_text(n, encoding='utf-8')
print('use-config-store.ts restored; lines', len(n.split('\n')))
