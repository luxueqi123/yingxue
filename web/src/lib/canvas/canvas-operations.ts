import { canonicalize } from "json-canonicalize";
import type { CanvasOperation } from "@/services/api/user-data";
import type { CanvasProject } from "@/stores/canvas/use-canvas-store";
import { canvasContentSnapshot } from "./canvas-content";

export function canvasOperationValueEqual(left: unknown, right: unknown) {
    return canonicalize(left) === canonicalize(right);
}

export function diffCanvasObject(before: Record<string, unknown>, after: Record<string, unknown>, prefix = "") {
    const patch: Record<string, unknown> = {};
    const previous: Record<string, unknown> = {};
    const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort();
    for (const key of keys) {
        if (!prefix && key === "updatedAt") continue;
        const path = prefix ? `${prefix}.${key}` : key;
        const hasBefore = Object.prototype.hasOwnProperty.call(before, key);
        const hasAfter = Object.prototype.hasOwnProperty.call(after, key);
        const oldValue = before[key];
        const newValue = after[key];
        if (oldValue === undefined && newValue === undefined) continue;
        if (hasBefore && hasAfter && oldValue && newValue && typeof oldValue === "object" && typeof newValue === "object" && !Array.isArray(oldValue) && !Array.isArray(newValue)) {
            const nested = diffCanvasObject(oldValue as Record<string, unknown>, newValue as Record<string, unknown>, path);
            Object.assign(patch, nested.patch);
            Object.assign(previous, nested.previous);
            continue;
        }
        // undefined 在对象 JSON 中会被丢弃，导致 before 或 patch 为空。
        // 服务端用 null 表示不存在/删除；缺省字段与 undefined 之间不需要发送修改。
        if (canvasOperationValueEqual(canvasOperationValue(oldValue), canvasOperationValue(newValue))) continue;
        previous[path] = canvasOperationValue(oldValue);
        patch[path] = canvasOperationValue(newValue);
    }
    return { patch, previous };
}

export function canvasOperationValue(value: unknown) {
    return value === undefined ? null : value;
}

const CANVAS_OPERATION_FIELDS = ["title", "projectId", "chatSessions", "activeChatId", "agentDraft", "starterMode", "appearance", "backgroundMode", "showImageInfo", "previsScenes", "timeline"] as const;

export function buildCanvasOperations(base: CanvasProject | undefined, next: CanvasProject): CanvasOperation[] {
    const operations: CanvasOperation[] = [];
    if (!base) {
        operations.push({
            type: "create_canvas",
            id: next.id,
            patch: {
                title: next.title,
                projectId: next.projectId,
                chatSessions: next.chatSessions,
                activeChatId: next.activeChatId,
                agentDraft: next.agentDraft,
                starterMode: next.starterMode,
                appearance: next.appearance,
                backgroundMode: next.backgroundMode,
                showImageInfo: next.showImageInfo,
                previsScenes: next.previsScenes,
                timeline: next.timeline,
            },
        });
    }
    const baseNodes = new Map((base?.nodes || []).map((node) => [node.id, node]));
    const nextNodes = new Map(next.nodes.map((node) => [node.id, node]));
    for (const node of next.nodes) {
        const previous = baseNodes.get(node.id);
        if (!previous) {
            operations.push({ type: "create_node", node });
            continue;
        }
        const diff = diffCanvasObject(previous as unknown as Record<string, unknown>, node as unknown as Record<string, unknown>);
        if (Object.keys(diff.patch).length) {
            const taskTime = diff.patch["metadata.taskUpdatedAt"];
            const taskId = previous.metadata?.taskId;
            if (typeof taskTime === "string" && taskTime.trim() && typeof taskId === "string" && taskId.trim() && taskId === node.metadata?.taskId && !Object.hasOwn(diff.previous, "metadata.taskId")) {
                diff.previous["metadata.taskId"] = taskId;
            }
            operations.push({ type: "patch_node", id: node.id, patch: diff.patch, before: diff.previous });
        }
    }
    for (const node of base?.nodes || []) {
        if (!nextNodes.has(node.id)) operations.push({ type: "remove_node", id: node.id, expected: node });
    }
    const baseConnections = new Map((base?.connections || []).map((connection) => [connection.id, connection]));
    const nextConnections = new Map(next.connections.map((connection) => [connection.id, connection]));
    for (const connection of next.connections) {
        const previous = baseConnections.get(connection.id);
        if (previous && !canvasOperationValueEqual(previous, connection)) {
            operations.push({ type: "update_connection", id: connection.id, connection, expected: previous });
        } else if (!previous) {
            operations.push({ type: "create_connection", connection });
        }
    }
    for (const connection of base?.connections || []) {
        if (!nextConnections.has(connection.id)) operations.push({ type: "remove_connection", id: connection.id, expected: connection });
    }
    // 新画布的字段已由 create_canvas.patch 写入；再追加 set_field(beforeValue=null)
    // 会在服务端看到刚创建的字段而判定冲突，所以只有已有基线时才生成字段操作。
    if (!base) return operations;
    const beforeContent = canvasContentSnapshot(base);
    const afterContent = canvasContentSnapshot(next);
    for (const field of CANVAS_OPERATION_FIELDS) {
        if (!canvasOperationValueEqual(beforeContent[field], afterContent[field])) operations.push({ type: "set_field", field, value: canvasOperationValue(next[field]), beforeValue: canvasOperationValue(base[field]) });
    }
    return operations;
}
