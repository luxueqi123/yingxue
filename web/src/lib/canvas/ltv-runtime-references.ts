import type { CanvasConnection, CanvasNodeData } from "../../types/canvas";
import type { LtvReferencePlan } from "./ltv-reference-plan";

/** Keep source slot order in the native shelf before the first user edit. */
export function orderLtvReferenceConnections(nodes: CanvasNodeData[], connections: CanvasConnection[]) {
    const next = [...connections];
    for (const node of nodes) {
        const plan = node.metadata?.ltvReferencePlan;
        if (!plan) continue;
        const ranks = new Map([...plan.references, ...(plan.texts || [])].map((ref, index) => [ref.nodeId, index]));
        const slots = next.flatMap((edge, index) => edge.toNodeId === node.id && ranks.has(edge.fromNodeId) ? [index] : []);
        const ordered = slots.map(index => next[index]).sort((a, b) => ranks.get(a.fromNodeId)! - ranks.get(b.fromNodeId)!);
        slots.forEach((index, position) => { next[index] = ordered[position]; });
    }
    return next;
}

export function assertLtvConnectedReferenceOrder(plan: LtvReferencePlan, inputs: Array<{ nodeId: string; type: string }>) {
    for (const kind of ["image", "video", "audio", "text"]) {
        const expected = [...new Set((kind === "text" ? plan.texts || [] : plan.references.filter(ref => ref.kind === kind)).map(ref => ref.nodeId))];
        const actual = [...new Set(inputs.filter(input => input.type === kind).map(input => input.nodeId))];
        if (expected.length !== actual.length || expected.some((id, index) => id !== actual[index])) {
            throw new Error("参考素材或编号已变化，请点击输入框的「绑定参考」确认当前素材后再生成。");
        }
    }
}

/**
 * Called only after the user explicitly accepts the current reference shelf.
 * `previous` is the plan being replaced: an unchanged text body keeps its import-time marker
 * rewrite, because the source only ever stripped those markers from prompt fields and never from
 * textList. Rebuilding the entry without it would put the raw editor marker back in front of the model.
 */
export function bindLtvCurrentReferences(prompt: string, orderedNodeIds: string[], nodes: CanvasNodeData[], previous?: LtvReferencePlan): LtvReferencePlan {
    const byId = new Map(nodes.map(node => [node.id, node]));
    const carried = new Map((previous?.texts || []).map(ref => [ref.nodeId, ref]));
    const plan: LtvReferencePlan = { prompt, references: [], texts: [] };
    if (new Set(orderedNodeIds).size !== orderedNodeIds.length) throw new Error("参考素材重复，请先整理连线。");
    for (const id of orderedNodeIds) {
        const node = byId.get(id);
        if (!node) throw new Error("参考节点已删除，请重新打开绑定窗口。");
        const content = node.metadata?.content || "";
        const deferred = node.metadata?.generationMode === node.type;
        if (node.type === "text") {
            if (!content.trim() && !deferred) throw new Error(`文字参考「${node.title}」没有正文。`);
            // Only an untouched body may reuse the rewrite: an edited body has no saved slot mapping
            // to resolve its markers against, so it falls back to the saved content as before.
            const prior = carried.get(id);
            const resolved = prior?.content === content ? prior.resolved : undefined;
            plan.texts!.push({ nodeId: id, content, ...(resolved !== undefined && resolved !== content ? { resolved } : {}), ...(deferred ? { deferred: true as const } : {}) });
        } else if (node.type === "image" || node.type === "video" || node.type === "audio") {
            if (!content && !deferred) throw new Error(`参考素材「${node.title}」还没有文件。`);
            const seconds = (node.metadata?.durationMs || 0) / 1000;
            const kind = node.type === "image" ? "image" : node.type === "video" ? "video" : "audio";
            plan.references.push({ nodeId: id, kind, url: deferred ? "" : content,
                ...(deferred ? { deferred: true as const } : {}), ...(seconds > 0 ? { durationSec: seconds } : {}) });
        } else throw new Error(`「${node.title}」不是当前案例可绑定的文字、图片、视频或音频节点。`);
    }
    validateLtvReferenceLabels(prompt, {
        image: plan.references.filter(ref => ref.kind === "image").length,
        video: plan.references.filter(ref => ref.kind === "video").length,
        audio: plan.references.filter(ref => ref.kind === "audio").length,
    });
    return plan;
}

export function remapLtvReferencePlan(plan: LtvReferencePlan, ids: ReadonlyMap<string, string>, requireAll = false): LtvReferencePlan {
    const remap = (nodeId: string) => {
        const id = ids.get(nodeId);
        if (!id && requireAll) throw new Error("案例参考节点未包含在工程中，未创建画布。");
        return id || nodeId;
    };
    return { ...plan, ...(plan.texts ? { texts: plan.texts.map(ref => ({ ...ref, nodeId: remap(ref.nodeId) })) } : {}), references: plan.references.map(ref => {
        const id = ids.get(ref.nodeId);
        if (!id && requireAll) throw new Error("案例参考节点未包含在工程中，未创建画布。");
        return { ...ref, nodeId: id || ref.nodeId };
    }) };
}

export function resolveLtvRuntimeTexts(plan: LtvReferencePlan, nodes: CanvasNodeData[]) {
    const byId = new Map(nodes.map(node => [node.id, node]));
    return (plan.texts || []).map(ref => {
        const node = byId.get(ref.nodeId);
        if (!node || node.type !== "text") throw new Error("案例文字输入节点缺失或类型已变化。");
        const content = node.metadata?.content;
        if (ref.deferred) {
            if (node.metadata?.status !== "success" || !content?.trim()) throw new Error("上游文字尚未生成成功，请先完成上游节点。");
        } else if (content !== ref.content) throw new Error("案例文字输入版本已变化，请重新绑定。");
        return ltvTextReferenceBody(ref, content);
    });
}

/**
 * The model-facing body of one saved text reference. `resolved` carries the import-time rewrite of
 * the editor's `{{Image|Portrait|Video|Audio|Mixed N}}` markers, which the source only ever stripped
 * from prompt fields and never from textList; the saved `content` must keep those markers because it
 * is also the version key checked against the text node above.
 */
export function ltvTextReferenceBody(ref: { content?: string; resolved?: string }, current?: string | undefined) {
    return ref.resolved ?? current ?? ref.content ?? "";
}

export function resolveLtvRuntimeReferences(plan: LtvReferencePlan, nodes: CanvasNodeData[], prompt: string) {
    if (!Array.isArray(plan.references)) throw new Error("案例引用计划无效，请重新导入。");
    const byId = new Map(nodes.map(node => [node.id, node]));
    const seen = new Set<string>();
    const counts = { image: 0, video: 0, audio: 0 };
    const result = plan.references.map(ref => {
        if (!ref || !["image", "video", "audio"].includes(ref.kind) || seen.has(ref.nodeId)) throw new Error("案例引用计划包含无效或重复素材。");
        seen.add(ref.nodeId);
        const node = byId.get(ref.nodeId);
        if (!node || node.type !== ref.kind) throw new Error("案例参考素材已删除或类型已变化，请重新绑定参考素材后再生成。");
        if (ref.deferred) {
            if (ref.url !== "") throw new Error("案例动态引用包含冲突的固定版本，请重新导入。");
            if (!node.metadata?.content || node.metadata.status !== "success") throw new Error("上游参考节点尚未生成成功，请先完成上游节点。");
        } else if (node.metadata?.content !== ref.url) throw new Error("案例参考素材已删除或版本已变化，请重新绑定参考素材后再生成。");
        counts[ref.kind]++;
        return node;
    });
    // An imported case is authoritative at execution time: a slot keeps the reference the author saved and
    // a number beyond the saved slots stays prompt text, because the source platform itself never validated
    // it. A plan the user bound themselves keeps the strict range check, where a stale number really does
    // point at the wrong slot.
    validateLtvReferenceLabels(prompt, counts, plan.imported);
    return result;
}

function validateLtvReferenceLabels(prompt: string, counts: Record<"image" | "video" | "audio", number>, imported = false) {
    // Saved LTV slots remain fixed even when the prompt mentions the second slot first.
    if (/@\[(?:node|asset):|\{\{(?:Image|Video|Audio|Mixed|Portrait)\b/.test(prompt)) throw new Error("案例引用需要使用当前已绑定的图片、视频或音频编号。");
    const kinds = { 图片: "image", 视频: "video", 音频: "audio" } as const;
    for (const match of prompt.matchAll(/@(图片|视频|音频)(\d+)/g)) {
        const kind = kinds[match[1] as keyof typeof kinds];
        if (Number(match[2]) < 1) throw new Error(`参考素材不存在：${match[0]}`);
        if (!imported && Number(match[2]) > counts[kind]) throw new Error(`参考素材不存在：${match[0]}`);
    }
}
