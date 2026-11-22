import { videoGenerationsReferenceError } from "../video-generations-constraints";
import { buildLtvReferencePlan, type LtvReferencePlan } from "./ltv-reference-plan";
import { readLtvParameterLayers } from "./ltv-parameter-layers";

// Aliases must be established by the source protocol, not by similar display names.
// Source: 1di1-3y--egfx.js exports SEEDANCE_25_MODEL_KEY = "star-video2.5".
const sourceFamilies: Record<string, string> = { "star-video2.5": "seedance-2.5" };

type RecordValue = Record<string, any>;
export type LtvCompatibilityIssue = { code: string; nodeId?: string; detail: string };
export type LtvRouteCandidate = { nodeId: string; model: string; sourceModel: string; issues: LtvCompatibilityIssue[] };
export type LtvGenerationAssessment = { issues: LtvCompatibilityIssue[]; routes: LtvRouteCandidate[]; executable: boolean; referencePlans?: Array<LtvReferencePlan & { nodeId: string }> };

function record(value: unknown): RecordValue {
    return value && typeof value === "object" && !Array.isArray(value) ? value as RecordValue : {};
}

export function assessLtvGenerationCase(snapshot: unknown, catalog: unknown): LtvGenerationAssessment {
    const input = record(snapshot);
    const issues: LtvCompatibilityIssue[] = [];
    const routes: LtvRouteCandidate[] = [];
    if (!Array.isArray(input.nodes) || !Array.isArray(input.edges)) return { issues: [{ code: "invalid-graph", detail: "缺少节点或连线数组" }], routes, executable: false };
    const nodes = input.nodes.map(record);
    const referencePlans: Array<LtvReferencePlan & { nodeId: string }> = [];
    const resources = new Map(nodes.map(node => {
        const url = record(node.data).url;
        return [node.id, { kind: node.type, urls: Array.isArray(url) ? url.filter((item: unknown): item is string => typeof item === "string") : typeof url === "string" ? [url] : [] }];
    }));
    const ids = new Map(nodes.map(node => [node.id, node]));
    if (!nodes.length) issues.push({ code: "empty-graph", detail: "原工程没有节点" });
    if (ids.size !== nodes.length || nodes.some(node => typeof node.id !== "string" || !node.id)) issues.push({ code: "invalid-node-id", detail: "节点ID为空或重复" });
    for (const edge of input.edges.map(record)) if (!ids.has(edge.source) || !ids.has(edge.target)) issues.push({ code: "dangling-edge", detail: String(edge.id) });
    const channels = record(catalog).channels;
    const models: RecordValue[] = Array.isArray(channels) ? channels.map(record).flatMap(c => (Array.isArray(c.models) ? c.models : []).map((m: unknown): RecordValue => ({ ...record(m), channelId: c.id }))) : [];
    for (const node of nodes) {
        const data = record(node.data), params = record(data.params);
        const add = (code: string, detail: string) => issues.push({ code, nodeId: node.id, detail });
        if (!["image", "video", "audio", "text", "group"].includes(node.type)) { add("node-adapter-required", String(node.type)); continue; }
        const action = String(data.action || "");
        if (node.type === "group" || action.endsWith("_resource")) continue;
        if (!action.endsWith("_generate")) { add("operation-adapter-required", action); continue; }
        const family = sourceFamilies[String(params.model)];
        if (!family) { add("model-identity-unverified", String(params.model || "原模型为空")); continue; }
        const candidates = models.filter((m: RecordValue) => m.capability === node.type && family === "seedance-2.5" && /Seedance\s*2\.5/i.test(String(m.displayName)));
        if (!candidates.length) { add("configured-route-missing", String(params.model)); continue; }
        const parameterLayers = readLtvParameterLayers(params);
        const settings = parameterLayers.fields;
        try {
            referencePlans.push({ nodeId: node.id, ...buildLtvReferencePlan({ ...params, prompt: settings.prompt }, resources) });
        } catch (error) {
            add("reference-plan-invalid", error instanceof Error ? error.message : "引用转换失败");
        }
        if (Array.isArray(params.textList) && params.textList.length) add("text-reference-adapter-required", "需承接原文本输入，不能只使用prompt字段");
        if (settings.modeType === "text2video" && !String(settings.prompt || "").trim() && !parameterLayers.texts.some(text => text.trim())) add("empty-generation-prompt", "文生视频提示词及文本输入均为空");
        const mode = ({ text2video: "text_to_video", image2video: "image_to_video", mixed2video: "reference_to_video" } as Record<string, string>)[String(settings.modeType)];
        const refs = { image: params.imageList || [], video: params.videoList || [], audio: params.audioList || [] };
        for (const list of Object.values(refs)) {
            if (!Array.isArray(list)) { add("invalid-reference-list", "参考素材列表不是数组"); continue; }
            for (const value of list) {
                const ref = record(value);
                if (typeof ref.nodeId !== "string" || !ref.nodeId || typeof ref.url !== "string") {
                    add("invalid-reference", "参考素材缺少节点ID或资源地址");
                    continue;
                }
                if (!ids.has(ref.nodeId)) add("external-reference-adapter-required", String(ref.nodeId));
                else {
                    const urls = record(ids.get(ref.nodeId)?.data).url;
                    if (ref.url && !(Array.isArray(urls) ? urls.includes(ref.url) : urls === ref.url)) add("reference-version-mismatch", String(ref.nodeId));
                }
            }
        }
        if (Object.values(refs).some(list => Array.isArray(list) && list.length)) add("ordered-reference-adapter-required", "需映射素材顺序、占位符及节点引用，不能只复制连线");
        for (const key of parameterLayers.advancedKeys) add("advanced-option-adapter-required", key);
        for (const model of candidates) {
            const capability = record(record(model.capabilityConfig).video);
            const failures: LtvCompatibilityIssue[] = [];
            const fail = (code: string, detail: string) => failures.push({ code, nodeId: node.id, detail });
            if (model.protocol === "newapi-channel-2") {
                const error = videoGenerationsReferenceError(Array.isArray(refs.image) ? refs.image.length : 0, Array.isArray(refs.video) ? refs.video.length : 0, Array.isArray(refs.audio) ? refs.audio.length : 0, String(model.modelKey || ""));
                if (error) fail("protocol-reference-limit", error);
            }
            if (!mode || !Array.isArray(capability.operations) || !capability.operations.includes(mode)) fail("unsupported-mode", String(params.modeType));
            if (!Array.isArray(capability.ratios) || !capability.ratios.includes(settings.ratio)) fail("unsupported-ratio", String(settings.ratio));
            if (!Array.isArray(capability.resolutions) || !capability.resolutions.includes(settings.resolution)) fail("unsupported-resolution", String(settings.resolution));
            const duration = record(capability.duration), seconds = Number(settings.duration);
            if (!Number.isFinite(seconds) || (Array.isArray(duration.values) ? !duration.values.includes(seconds) : !(seconds >= duration.min && seconds <= duration.max && (!duration.step || Math.abs((seconds - duration.min) / duration.step - Math.round((seconds - duration.min) / duration.step)) < 1e-8)))) fail("unsupported-duration", String(settings.duration));
            if (settings.enableSound === "on" && !record(capability.generateAudio).supported) fail("unsupported-audio-generation", "原工程要求生成声音");
            const limits = record(capability.references);
            if (typeof limits.promptMaxChars !== "number" || String(settings.prompt || "").length > limits.promptMaxChars) fail("prompt-limit", "不能截断原提示词");
            if (settings.count !== undefined && settings.count !== 1) fail("batch-adapter-required", String(settings.count));
            for (const [kind, list] of Object.entries(refs)) {
                const limit = limits[({ image: "maxImages", video: "maxVideos", audio: "maxAudios" } as Record<string,string>)[kind]];
                if (Array.isArray(list) && list.length && (typeof limit !== "number" || list.length > limit)) fail("reference-count-limit", kind);
                if (kind !== "image" && Array.isArray(list)) for (const value of list) {
                    const ref = record(value);
                    const max = limits[kind === "video" ? "maxVideoDurationSeconds" : "maxAudioDurationSeconds"];
                    if (typeof ref.durationSec !== "number" || typeof max !== "number" || ref.durationSec > max) fail("reference-duration-limit", kind);
                }
            }
            routes.push({ nodeId: node.id, sourceModel: params.model, model: `${model.channelId}::${model.modelKey}`, issues: failures });
        }
        if (!routes.some(route => route.nodeId === node.id && !route.issues.length)) add("no-compatible-route", String(params.model));
    }
    return { issues, routes, referencePlans, executable: !issues.length };
}
