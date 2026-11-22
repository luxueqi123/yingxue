import { expect, test } from "bun:test";
import { interfaceLocales, interfaceTranslator, loadInterfaceLocale } from "@/lib/interface-locale";
import { canvasAgentToolLabel } from "@/lib/canvas/canvas-agent-tool-label";
import { previewCanvasOperations, summarizeCanvasOperations, type CanvasOperation, type CanvasSnapshot } from "@/lib/canvas/canvas-operation-contract";
import { CanvasNodeType } from "@/types/canvas";

await Promise.all(interfaceLocales.map(loadInterfaceLocale));

test("Agent tool names follow each UI language and preserve custom tool names", () => {
    const expected = ["读取上下文", "讀取上下文", "讀取上下文", "Read context", "コンテキストを取得", "컨텍스트 읽기", "Leer contexto", "Ler contexto", "Lire le contexte", "Kontext lesen"];
    for (const [index, locale] of interfaceLocales.entries()) {
        const t = interfaceTranslator(locale);
        expect(canvasAgentToolLabel("canvas_get_context", t)).toBe(expected[index]!);
        expect(canvasAgentToolLabel("用户自定义工具 {name}", t)).toBe("用户自定义工具 {name}");
    }
});

test("approval previews translate actions and warnings while keeping source names and operation effects", () => {
    const snapshot: CanvasSnapshot = {
        nodes: [{ id: "original", type: CanvasNodeType.Text, title: "原始节点 {count}", position: { x: 0, y: 0 }, width: 200, height: 100, metadata: {} }],
        connections: [],
    };
    const operations: CanvasOperation[] = [
        { type: "delete_node", id: "original" },
        { type: "run_generation", nodeId: "original", mode: "text" },
        { type: "connect_nodes", fromNodeId: "original", toNodeId: "other" },
    ];
    const original = JSON.stringify({ snapshot, operations });
    for (const locale of interfaceLocales) {
        const t = interfaceTranslator(locale);
        const impact = previewCanvasOperations(operations, snapshot, t);
        expect(impact).toMatchObject({ operationCount: 3, affectedNodeCount: 2, destructiveCount: 1, generationCount: 1 });
        expect(impact.items[0]).toContain("原始节点 {count}");
        expect(impact.items[2]).toContain("other");
        expect(impact.warning).toContain(t("agentOpsUi.generationWarning"));
        expect(summarizeCanvasOperations(operations, t)).toContain(canvasAgentToolLabel("canvas_run_generation", t));
    }
    expect(JSON.stringify({ snapshot, operations })).toBe(original);
    expect(previewCanvasOperations(operations, snapshot, interfaceTranslator("pt-BR")).items[0]).toBe("Excluir 1 nós: 原始节点 {count}");
});
