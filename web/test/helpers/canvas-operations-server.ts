import { canonicalize } from "json-canonicalize";
import type { CanvasOperationsRequest } from "../../src/services/api/user-data";
import { ApiError } from "../../src/services/api/request";
import type { CanvasProject } from "../../src/stores/canvas/use-canvas-store";

// Transactional HTTP fixture for persistence tests using the operations API.
// Keep assertions on saved documents, field conflicts and replay receipts.
export function createCanvasOperationsServer(projects: Map<string, CanvasProject>) {
    const receipts = new Map<string, { digest: string; response: { project: CanvasProject; mutationId: string } }>();
    const equal = (a: unknown, b: unknown) => canonicalize(a ?? null) === canonicalize(b ?? null);
    const conflict = (): never => { throw new ApiError("版本冲突", { status: 409, reason: "canvas_field_conflict" }); };
    const withoutUpdateTime = (value: unknown) => {
        if (!value || typeof value !== "object") return value;
        const { updatedAt: _, ...content } = value as Record<string, unknown>;
        return content;
    };
    return (id: string, request: CanvasOperationsRequest) => {
        const key = `${id}:${request.mutationId}`;
        const { editProofs: _, ...payload } = request;
        const digest = canonicalize(payload);
        const receipt = receipts.get(key);
        if (receipt) {
            if (digest !== receipt.digest) throw new ApiError("操作标识重复", { status: 409, reason: "canvas_mutation_id_reused" });
            return structuredClone(receipt.response);
        }
        let project = structuredClone(projects.get(id));
        for (const operation of request.operations) {
            if (operation.type === "create_canvas") {
                if (project || operation.id !== id) conflict();
                project = { id, revision: 0, createdAt: "2026-09-01T00:00:00Z", updatedAt: "2026-09-01T00:00:00Z", nodes: [], connections: [], viewport: { x: 0, y: 0, k: 1 }, ...operation.patch } as CanvasProject;
                continue;
            }
            if (!project) conflict();
            if (operation.type === "set_field") {
                if (!equal(project![operation.field], operation.beforeValue)) conflict();
                (project as unknown as Record<string, unknown>)[operation.field] = structuredClone(operation.value);
            } else if (operation.type === "create_node") {
                if (project!.nodes.some(node => node.id === operation.node.id)) conflict();
                project!.nodes.push(structuredClone(operation.node));
            } else if (operation.type === "patch_node") {
                const node = project!.nodes.find(node => node.id === operation.id);
                if (!node) conflict();
                for (const [path, before] of Object.entries(operation.before ?? {})) {
                    const value = path.split(".").reduce<unknown>((current, part) => (current as Record<string, unknown> | undefined)?.[part], node);
                    if (!equal(value, before)) conflict();
                }
                for (const [path, value] of Object.entries(operation.patch)) {
                    const parts = path.split(".");
                    const last = parts.pop()!;
                    let target = node as unknown as Record<string, unknown>;
                    for (const part of parts) target = (target[part] ??= {}) as Record<string, unknown>;
                    if (value === null) delete target[last];
                    else target[last] = structuredClone(value);
                }
            } else if (operation.type === "remove_node") {
                const node = project!.nodes.find(node => node.id === operation.id);
                if (!node || !equal(withoutUpdateTime(node), withoutUpdateTime(operation.expected))) conflict();
                project!.nodes = project!.nodes.filter(node => node.id !== operation.id);
            } else if (operation.type === "create_connection") {
                if (project!.connections.some(connection => connection.id === operation.connection.id)) conflict();
                project!.connections.push(structuredClone(operation.connection));
            } else if (operation.type === "update_connection" || operation.type === "remove_connection") {
                const connection = project!.connections.find(connection => connection.id === operation.id);
                if (!connection || !equal(connection, operation.expected)) conflict();
                project!.connections = operation.type === "remove_connection"
                    ? project!.connections.filter(connection => connection.id !== operation.id)
                    : project!.connections.map(connection => connection.id === operation.id ? structuredClone(operation.connection) : connection);
            }
        }
        if (!project) conflict();
        project!.revision = (project!.revision ?? 0) + 1;
        const response = { project: project!, mutationId: request.mutationId };
        projects.set(id, structuredClone(project!));
        receipts.set(key, { digest, response: structuredClone(response) });
        return response;
    };
}
