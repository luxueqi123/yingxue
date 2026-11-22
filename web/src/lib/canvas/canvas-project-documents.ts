import type { CanvasOperation, CanvasSnapshot } from "./canvas-operation-contract";
import { CanvasNodeType } from "@/types/canvas";

function documentPath(value: unknown) {
    if (typeof value !== "string" || !value.trim()) throw new Error("请指定制作文档路径");
    const path = value.trim();
    if (path.startsWith("/") || /[\\:\x00-\x1f]/.test(path) || path.split("/").some((part) => !part || part === "." || part === "..")) {
        throw new Error("制作文档必须使用当前画布内的相对路径");
    }
    if (!/\.(md|txt|json|csv)$/i.test(path)) throw new Error("制作文档仅支持 md、txt、json、csv 文本");
    return path;
}

function findDocument(snapshot: CanvasSnapshot, path: string) {
    if (!snapshot.projectId) throw new Error("请先打开画布");
    const matches = snapshot.nodes.filter((node) => node.metadata?.projectDocumentPath === path);
    if (matches.length > 1) throw new Error(`制作文档 ${path} 存在多个版本节点，请先明确保留的文档`);
    if (matches[0] && matches[0].type !== CanvasNodeType.Text) throw new Error("制作文档关联的节点类型不正确");
    return matches[0];
}

export function readProjectDocument(snapshot: CanvasSnapshot, input: Record<string, unknown>) {
    const path = documentPath(input.path);
    const node = findDocument(snapshot, path);
    if (!node) throw new Error(`制作文档 ${path} 尚未创建`);
    return { projectId: snapshot.projectId, nodeId: node.id, path, content: node.metadata?.content || "" };
}

export function writeProjectDocumentOps(snapshot: CanvasSnapshot, input: Record<string, unknown>): CanvasOperation[] {
    const path = documentPath(input.path);
    const current = findDocument(snapshot, path);
    if (typeof input.content !== "string") throw new Error("制作文档内容必须是文本");
    if (!["create", "replace", "append"].includes(String(input.mode))) throw new Error("必须明确选择 create、replace 或 append 写入方式");
    if (input.mode === "create" && current) throw new Error("制作文档已存在，请先读取后修改");
    if (input.mode !== "create" && !current) throw new Error("制作文档尚未创建，请先创建");
    const content = input.mode === "append" ? (current?.metadata?.content || "") + input.content : input.content;
    const metadata = { content, projectDocumentPath: path };
    if (current) return [{ type: "update_node", id: current.id, metadata }];
    const right = snapshot.nodes.reduce((value, node) => Math.max(value, node.position.x + node.width), 0);
    return [{ type: "add_node", nodeType: CanvasNodeType.Text, title: path, x: right + 80, y: 0, metadata }];
}
