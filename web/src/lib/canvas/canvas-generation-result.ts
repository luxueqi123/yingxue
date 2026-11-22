import { recordCommittedMediaVersion } from "@/lib/canvas/canvas-media-versions";
import type { CanvasNodeData, CanvasNodeMetadata } from "@/types/canvas";

const completedTaskObservationKeys = [
    "status",
    "taskStatus",
    "taskProgress",
    "taskStage",
    "taskMediaStage",
    "taskCanRecoverMedia",
    "taskStartedAt",
    "taskCompletedAt",
    "taskDurationMs",
    "taskCreatedAt",
    "taskUpdatedAt",
    "errorDetails",
    "generationErrorCode",
    "failedPromptFingerprint",
    "resourceReloadAvailable",
] as const satisfies readonly (keyof CanvasNodeMetadata)[];

export function completedGenerationObservationBase(baseNodes: CanvasNodeData[], resultNodes: CanvasNodeData[], durableNodes: CanvasNodeData[], taskId: string, effectKey: string): CanvasNodeData[] {
    const results = new Map(resultNodes.map((node) => [node.id, node]));
    const durable = new Map(durableNodes.map((node) => [node.id, node]));
    return baseNodes.map((base) => {
        const result = results.get(base.id);
        const saved = durable.get(base.id);
        if (!saved || base.metadata?.taskId !== taskId || result?.metadata?.taskId !== taskId || result.metadata.taskStatus !== "succeeded" || result.metadata.status !== "success" || !result.metadata.generationEffectKeys?.includes(effectKey)) return base;
        if (saved.metadata?.taskId !== taskId) throw new Error("节点已绑定其他生成任务，旧任务结果不能覆盖当前节点");
        // UI recovery/polling can lead durable state. Only observations of this completed task
        // use the latest saved baseline; prompt, media, geometry and task identity remain fenced.
        const metadata = { ...base.metadata };
        for (const key of completedTaskObservationKeys) {
            if (Object.prototype.hasOwnProperty.call(saved.metadata, key)) Object.assign(metadata, { [key]: saved.metadata[key] });
            else delete metadata[key];
        }
        return { ...base, metadata };
    });
}

/** 生成只接管结果尺寸；保存期间的用户命名、移动和手工尺寸优先。 */
export function canvasGenerationPresentation(before: CanvasNodeData, result: CanvasNodeData, current: CanvasNodeData) {
    const geometryChanged = current.width !== before.width || current.height !== before.height || current.metadata?.manualSize || current.metadata?.locked || current.metadata?.freeResize;
    const moved = current.position.x !== before.position.x || current.position.y !== before.position.y;
    return {
        type: result.type === before.type ? current.type : result.type,
        title: current.metadata?.manualTitle || result.title === before.title || current.title !== before.title ? current.title : result.title,
        width: geometryChanged ? current.width : result.width,
        height: geometryChanged ? current.height : result.height,
        position: moved || geometryChanged ? current.position : result.position,
    };
}

/** 异步阶段只准备结果；提交时按节点身份合并，绝不能用旧文档覆盖当前文档。 */
export function commitCanvasGenerationResult(current: CanvasNodeData[], before: CanvasNodeData, result: CanvasNodeData, taskId: string, additionalNodes: CanvasNodeData[] = []): CanvasNodeData[] {
    const live = current.find((node) => node.id === before.id);
    if (!live) throw new Error("生成结果对应节点已删除，结果仍保留在任务中心");
    if (result.id !== before.id || (live.metadata?.taskId && live.metadata.taskId !== taskId) || (before.metadata?.taskId && !live.metadata?.taskId)) {
        throw new Error("节点已绑定其他生成任务，旧任务结果不能覆盖当前节点");
    }
    const metadata: CanvasNodeMetadata = { ...live.metadata };
    for (const key of new Set([...Object.keys(before.metadata || {}), ...Object.keys(result.metadata || {})]) as Set<keyof CanvasNodeMetadata>) {
        if (key === "manualTitle" || JSON.stringify(before.metadata?.[key]) === JSON.stringify(result.metadata?.[key])) continue;
        Object.assign(metadata, { [key]: result.metadata?.[key] });
    }
    const merged: CanvasNodeData = {
        ...live,
        ...canvasGenerationPresentation(before, result, live),
        metadata,
    };
    const versionRootId = merged.metadata?.versionOfNodeId;
    // 原位结果同时写入节点内版本历史，旧媒体在生成开始前已登记。
    const recorded = recordCommittedMediaVersion(merged);
    const committed = current.map((node) => {
        if (node.id === merged.id) return versionRootId ? { ...recorded, metadata: { ...recorded.metadata, versionPrimary: true } } : recorded;
        if (!versionRootId || (node.metadata?.versionOfNodeId || node.id) !== versionRootId) return node;
        return { ...node, metadata: { ...node.metadata, versionPrimary: false } };
    });
    const additionalById = new Map(additionalNodes.map((node) => [node.id, node]));
    const committedWithAdditional = committed.map((node) => {
        const refreshed = additionalById.get(node.id);
        if (!refreshed) return node;
        const manualSize = Boolean(node.metadata?.manualSize || node.metadata?.locked || node.metadata?.freeResize);
        return {
            ...refreshed,
            title: node.title,
            metadata: { ...refreshed.metadata, manualTitle: node.metadata?.manualTitle },
            position: node.position,
            width: manualSize ? node.width : refreshed.width,
            height: manualSize ? node.height : refreshed.height,
        };
    });
    const existingIds = new Set(current.map((node) => node.id));
    return [
        ...committedWithAdditional,
        ...additionalNodes.filter((node) => !existingIds.has(node.id)).map((node) => ({ ...node, position: { x: node.position.x + merged.position.x - result.position.x, y: node.position.y + merged.position.y - result.position.y } })),
    ];
}
