import { expect, test } from "bun:test";
import { buildCanvasOperations } from "@/lib/canvas/canvas-operations";
import { mergeAgentCanvasEditor } from "@/lib/canvas/agent-canvas-patch";
import type { CanvasProject } from "@/stores/canvas/use-canvas-store";

function canvas(patch: Partial<CanvasProject> = {}): CanvasProject {
    return { id: "canvas", title: "画布", createdAt: "", updatedAt: "", nodes: [], connections: [], chatSessions: [], activeChatId: null, viewport: { x: 0, y: 0, k: 1 }, revision: 1, ...patch };
}

test("new canvas fields are written only by create_canvas", () => {
    const operations = buildCanvasOperations(undefined, canvas({ title: "新画布" }));
    expect(operations).toHaveLength(1);
    expect(operations[0]).toMatchObject({ type: "create_canvas", patch: { title: "新画布" } });
});

test("existing agentDraft persists on create, update and removal through operations", () => {
    const draft = { scope: "user-a", prompt: "接续创作", referenceNodeIds: [], models: { text: "text-model", image: "image-model", video: "video-model" }, confirmTools: true };
    expect(buildCanvasOperations(undefined, canvas({ agentDraft: draft }))[0]).toMatchObject({ type: "create_canvas", patch: { agentDraft: draft } });
    expect(buildCanvasOperations(canvas(), canvas({ agentDraft: draft }))).toEqual([{ type: "set_field", field: "agentDraft", value: draft, beforeValue: null }]);
    expect(buildCanvasOperations(canvas({ agentDraft: draft }), canvas())).toEqual([{ type: "set_field", field: "agentDraft", value: null, beforeValue: draft }]);
});

test("optional node fields survive JSON wire as explicit null baselines/deletions", () => {
    const before = canvas({ nodes: [{ id: "node", metadata: {} }] as CanvasProject["nodes"] });
    const after = canvas({ nodes: [{ id: "node", metadata: { title: "新" } }] as CanvasProject["nodes"] });
    expect(JSON.parse(JSON.stringify(buildCanvasOperations(before, after)))).toEqual([{ type: "patch_node", id: "node", patch: { "metadata.title": "新" }, before: { "metadata.title": null } }]);
    expect(buildCanvasOperations(after, before)).toEqual([{ type: "patch_node", id: "node", patch: { "metadata.title": null }, before: { "metadata.title": "新" } }]);
});

test("same-task timestamps are fenced to the original task identity", () => {
    const before = canvas({ nodes: [{ id: "node", metadata: { taskId: "task-a", taskUpdatedAt: "2026-10-29T00:00:00Z" } }] as CanvasProject["nodes"] });
    const after = canvas({ nodes: [{ id: "node", metadata: { taskId: "task-a", taskUpdatedAt: "2026-10-29T00:00:01Z" } }] as CanvasProject["nodes"] });
    expect(buildCanvasOperations(before, after)).toEqual([{ type: "patch_node", id: "node", patch: { "metadata.taskUpdatedAt": "2026-10-29T00:00:01Z" }, before: { "metadata.taskUpdatedAt": "2026-10-29T00:00:00Z", "metadata.taskId": "task-a" } }]);
    const rebound = { ...after, nodes: [{ ...after.nodes[0]!, metadata: { taskId: "task-b", taskUpdatedAt: "2026-10-29T00:00:01Z" } }] };
    expect(buildCanvasOperations(before, rebound)[0]).toMatchObject({ before: { "metadata.taskId": "task-a" }, patch: { "metadata.taskId": "task-b" } });
});

test("bookkeeping and empty project association do not create operations", () => {
    const before = canvas({ nodes: [{ id: "node", updatedAt: "old" }] as CanvasProject["nodes"], projectId: "" });
    const after = { ...before, projectId: undefined, revision: 4, updatedAt: "new", nodes: [{ ...before.nodes[0]!, updatedAt: "new" }] };
    expect(buildCanvasOperations(before, after)).toEqual([]);
});

test("connection changes retain their expected object, removals retain their node", () => {
    const node = { id: "node" } as CanvasProject["nodes"][number];
    const connection = { id: "edge", fromNodeId: "node", toNodeId: "other" };
    const before = canvas({ nodes: [node], connections: [connection] });
    const after = canvas({ connections: [{ ...connection, toNodeId: "third" }] });
    expect(buildCanvasOperations(before, after)).toEqual([{ type: "remove_node", id: "node", expected: node }, { type: "update_connection", id: "edge", connection: after.connections[0], expected: connection }]);
});

test("receipt refresh keeps other-tab fields and edits made after request preparation", () => {
    const prepared = canvas({ title: "已提交标题", nodes: [{ id: "node", title: "原节点" }] as CanvasProject["nodes"] });
    const remote = { ...prepared, revision: 7, appearance: "dark" as const };
    const current = { ...prepared, nodes: [{ ...prepared.nodes[0]!, title: "提交期间新编辑" }] };
    const merged = mergeAgentCanvasEditor(prepared, remote, current.nodes, current.connections, current);
    expect(merged.appearance).toBe("dark");
    expect(merged.nodes[0]!.title).toBe("提交期间新编辑");
    expect(merged.title).toBe("已提交标题");
    expect(merged.revision).toBe(7);
});

test("receipt refresh preserves an explicit conflict when later edits touch the same field", () => {
    const prepared = canvas({ title: "提交标题" });
    const remote = { ...prepared, title: "另一个窗口标题" };
    const current = { ...prepared, title: "本窗口后续标题" };
    expect(() => mergeAgentCanvasEditor(prepared, remote, [], [], current)).toThrow("冲突");
});
