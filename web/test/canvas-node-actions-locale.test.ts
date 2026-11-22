import { expect, test } from "bun:test";
import { interfaceLocales, loadInterfaceLocale } from "../src/lib/interface-locale";
import { nodeHoverToolbarTools } from "../src/lib/canvas/tool-registry/definitions/node-hover-tools";
import { resolveToolbarEntries, type ToolContext, type ToolbarHandlers } from "../src/lib/canvas/tool-registry";
import { CanvasNodeType, type CanvasNodeData } from "../src/types/canvas";

function context(node: CanvasNodeData): ToolContext {
    return {
        selectedCount: 0, selectedNodeTypes: new Set(), selectedVideoCount: 0,
        canvasTool: "move", workspaceMode: "professional", isProjectLinked: false,
        canUndo: false, canRedo: false, node, nodeMetadata: node.metadata,
        extractingVideoFrames: false, extractingAudio: false, trimmingVideo: false,
        mergingVideos: false, addPanelOpen: false, appearancePanelOpen: false,
        settingsPanelOpen: false, handlers: {} as ToolbarHandlers,
    };
}
const read = (value: string | ((ctx: ToolContext) => string) | undefined, ctx: ToolContext) => typeof value === "function" ? value(ctx) : value;

test("node action definitions are unique", () => {
    const ids = nodeHoverToolbarTools.map(tool => tool.id);
    expect(new Set(ids).size).toBe(ids.length);
});

for (const locale of interfaceLocales) {
    test(`${locale}: node actions translate idle, busy, batch, character and locked states`, async () => {
        await loadInterfaceLocale(locale);
        const node: CanvasNodeData = { id: "original", type: CanvasNodeType.Video, title: "原始标题", position: { x: 0, y: 0 }, width: 640, height: 360, metadata: { content: "original.mp4" } };
        const ctx = context(node); ctx.locale = locale;
        const actual: string[] = [];
        for (const metadata of [node.metadata, { locked: true }, { workflowKind: "character", characterAssetId: "character" }, { isBatchRoot: true, batchChildIds: ["failed"], status: "error", batchFailedCount: 1 }]) {
            ctx.nodeMetadata = metadata as CanvasNodeData["metadata"];
            for (const busy of [false, true]) {
                ctx.extractingAudio = busy; ctx.extractingVideoFrames = busy; ctx.trimmingVideo = busy;
                for (const tool of nodeHoverToolbarTools) {
                    for (const value of [tool.label, tool.displayLabel, tool.nodeToolbar?.section, tool.nodeToolbar?.description]) {
                        const text = read(value, ctx);
                        if (text) actual.push(text);
                    }
                }
            }
        }
        expect(actual.some(text => text.includes("nodeTools."))).toBe(false);
        if (!["zh-CN", "zh-HK", "zh-TW", "ja-JP"].includes(locale)) expect([...new Set(actual.filter(text => /[\u3400-\u9fff]/.test(text)))]).toEqual([]);
        expect(node.title).toBe("原始标题");
        expect(node.metadata?.content).toBe("original.mp4");
    });
}

test("translated actions keep media handlers, busy guards and original node identity", async () => {
    await loadInterfaceLocale("en-US");
    const node: CanvasNodeData = { id: "source-video", type: CanvasNodeType.Video, title: "原视频", position: { x: 0, y: 0 }, width: 640, height: 360, metadata: { content: "source.mp4" } };
    const received: CanvasNodeData[] = [];
    const ctx = context(node); ctx.locale = "en-US";
    ctx.handlers.onNodeExtractAudioFromVideo = target => received.push(target);
    const entry = resolveToolbarEntries("node-hover", ctx, null).find(tool => tool.id === "extractAudio")!;
    expect(entry.kind).toBe("command");
    if (entry.kind !== "command") throw new Error("Expected an audio extraction command");
    expect(entry.displayLabel).toBe("Extract audio");
    expect(entry.disabled).toBe(false);
    expect(received).toEqual([]);
    entry.onClick({} as never);
    expect(received).toEqual([node]);
    ctx.extractingAudio = true;
    const busy = resolveToolbarEntries("node-hover", ctx, null).find(tool => tool.id === "extractAudio")!;
    expect(busy.kind === "command" && busy.disabled).toBe(true);
    expect(busy.kind === "command" && busy.displayLabel).toBe("Extracting");
});
