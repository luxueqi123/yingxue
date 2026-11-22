import { expect, test } from "bun:test";
import { applyCanvasOperations, verifyCanvasOperations, type CanvasSnapshot } from "../src/lib/canvas/canvas-operation-contract";
import { readProjectDocument } from "../src/lib/canvas/canvas-project-documents";
import { onlineToolToOps } from "../src/components/canvas/canvas-assistant-online-tools";
import { defaultConfig } from "../src/stores/use-config-store";
import { isCanvasReadTool } from "../src/lib/canvas/canvas-agent-protocol";

const empty = (): CanvasSnapshot => ({ projectId: "project-a", title: "制作", nodes: [], connections: [], selectedNodeIds: [], viewport: { x: 0, y: 0, k: 1 } });
const write = (snapshot: CanvasSnapshot, path: string, mode: string, content: unknown) => onlineToolToOps("canvas_write_project_document", { path, mode, content }, snapshot, defaultConfig);

test("真实工具分派到画布操作，创建追加替换后保留完整文档和JSON恢复", () => {
    const before = empty();
    const ops = write(before, "制作/Final_Video_Spec.md", "create", "# 规格\n画幅:16:9");
    const created = applyCanvasOperations(before, ops);
    expect(verifyCanvasOperations(before, created, ops).ok).toBe(true);
    const appended = applyCanvasOperations(created, write(created, "制作/Final_Video_Spec.md", "append", "\n时长:8秒"));
    expect(appended.nodes).toHaveLength(1);
    const restored = JSON.parse(JSON.stringify(appended));
    expect(readProjectDocument(restored, { path: "制作/Final_Video_Spec.md" }).content).toBe("# 规格\n画幅:16:9\n时长:8秒");
    const replaced = applyCanvasOperations(restored, write(restored, "制作/Final_Video_Spec.md", "replace", "完整修订"));
    expect(readProjectDocument(replaced, { path: "制作/Final_Video_Spec.md" }).content).toBe("完整修订");
    expect(isCanvasReadTool("canvas_read_project_document")).toBe(true);
    expect(isCanvasReadTool("canvas_write_project_document")).toBe(false);
});

test("文件操作范围、模式、缺文档与重复文档明确失败", () => {
    for (const path of ["../secret.md", "C:/secret.md", "/secret.md", "a//b.md", "scripts/run.py"]) {
        expect(() => write(empty(), path, "create", "x")).toThrow();
    }
    expect(() => write(empty(), "a.md", "append", "x")).toThrow("尚未创建");
    expect(() => write(empty(), "a.md", "guess", "x")).toThrow("必须明确");
    expect(() => write(empty(), "a.md", "create", null)).toThrow("必须是文本");
    const created = applyCanvasOperations(empty(), write(empty(), "a.md", "create", "x"));
    expect(() => write(created, "a.md", "create", "x")).toThrow("已存在");
    expect(() => readProjectDocument(empty(), { path: "a.md" })).toThrow("尚未创建");
    created.nodes.push({ ...created.nodes[0], id: "duplicate" });
    expect(() => readProjectDocument(created, { path: "a.md" })).toThrow("多个版本");
});
