import { loadInterfaceLocale as preloadInterfaceLocale } from "../src/lib/interface-locale";
await preloadInterfaceLocale("en-US");

import { expect, mock, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { ComponentProps } from "react";
import { interfaceTranslator, type InterfaceLocale } from "../src/lib/interface-locale";
import { resolveToolbarEntries, type ToolContext } from "../src/lib/canvas/tool-registry";
import { CanvasNodeType, type CanvasNodeData } from "../src/types/canvas";

let locale: InterfaceLocale = "en-US";
mock.module("../src/stores/use-interface-locale-store", () => ({ useInterfaceTranslation: () => ({ locale, t: interfaceTranslator(locale) }) }));
const { CanvasNodeContextMenu } = await import("../src/components/canvas/canvas-context-menu");
const noAction = () => { throw new Error("Rendering may not invoke a command"); };

test("main toolbar localizes command and mode labels without losing state or dispatch", () => {
    let deleted = 0;
    const ctx = { locale: "en-US", selectedCount: 2, selectedNodeTypes: new Set(), selectedVideoCount: 0,
        canvasTool: "move", workspaceMode: "professional", isProjectLinked: false, canUndo: false, canRedo: true,
        addPanelOpen: true, appearancePanelOpen: false, settingsPanelOpen: false,
        handlers: { onDeleteSelected: () => { deleted++; } } } as ToolContext;
    const entries = resolveToolbarEntries("main", ctx, null);
    const add = entries.find(e => e.id === "tool-add")!;
    expect(add.kind === "command" && add.label).toBe("Add nodes");
    expect(add.kind === "command" && add.active).toBe(true);
    const undo = entries.find(e => e.id === "tool-undo")!;
    expect(undo.kind === "command" && undo.disabled).toBe(true);
    const modes = entries.find(e => e.id === "tool-canvas-mode")!;
    expect(modes.kind === "switch" && modes.value).toBe("move");
    expect(modes.kind === "switch" && modes.options.map(o => o.label)).toEqual(["Box select", "Hand tool"]);
    const remove = entries.find(e => e.id === "tool-delete")!;
    expect(remove.kind === "command" && remove.label).toBe("Delete 2 nodes");
    expect(remove.kind === "command" && remove.danger).toBe(true);
    expect(deleted).toBe(0);
    if (remove.kind === "command") remove.onClick({} as never);
    expect(deleted).toBe(1);
});

function markup(type: "canvas" | "node", node?: CanvasNodeData, selectedCount = 0, downloadableSelectionCount = 0, onDownloadSelection?: () => void) {
    const props = { menu: { type, x: 20, y: 80, position: { x: 0, y: 0 } }, node, selectedCount,
        downloadableSelectionCount, onDownloadSelection, canUndo: false, canRedo: false, canPaste: false, onClose: noAction } as ComponentProps<typeof CanvasNodeContextMenu>;
    return renderToStaticMarkup(<CanvasNodeContextMenu {...props} />);
}

test("root canvas menu translates disabled actions without changing clipboard or undo state", () => {
    locale = "en-US";
    const html = markup("canvas");
    for (const label of ["Canvas commands", "Add nodes", "Upload here", "Insert from asset library", "History and clipboard", "Undo", "Redo", "Paste"]) expect(html).toContain(label);
    expect(html.match(/disabled=""/g)?.length).toBe(3);
    locale = "zh-CN";
    expect(markup("canvas")).toContain("画布命令");
});

test("node menus retain author titles and interpolate selection counts", () => {
    locale = "en-US";
    const node = { id: "test", type: CanvasNodeType.Text, title: "原始标题 {name}", metadata: { content: "原始正文" } } as CanvasNodeData;
    const html = markup("node", node);
    expect(html).toContain("原始标题 {name}");
    expect(html).toContain("Generate image from text");
    expect(html).toContain("Copy text");
    const multi = markup("node", node, 3);
    expect(multi).toContain("3 nodes selected");
    expect(multi).toContain("Delete 3 nodes");
    expect(node.metadata?.content).toBe("原始正文");
});

test("multi-select context menu offers independent media downloads only when resources are eligible", () => {
    locale = "zh-CN";
    const textNode = { id: "text", type: CanvasNodeType.Text, title: "备注", metadata: { content: "文本" } } as CanvasNodeData;
    const html = markup("node", textNode, 3, 2, noAction);
    expect(html).toContain("下载 2 个资源");
    expect(html).toContain("逐个下载，跳过 1 个无有效媒体资源的节点");

    const emptySelection = markup("node", textNode, 2, 0);
    expect(emptySelection).toContain("下载资源");
    expect(emptySelection).toContain("选区内没有可下载的媒体资源");
    expect(emptySelection).toContain('disabled=""');

    expect(markup("node", textNode, 1, 1, noAction)).not.toContain("下载资源");
});

test("media and empty-node commands retain disabled state and translated fallbacks", () => {
    locale = "en-US";
    const media = markup("node", { id: "image", type: CanvasNodeType.Image, metadata: {} } as CanvasNodeData);
    for (const label of ["Image node", "Set asset category", "Copy image URL", "Upload to Ark asset library", "Delete node"]) expect(media).toContain(label);
    expect(media).toContain('disabled=""');
    const text = markup("node", { id: "text", type: CanvasNodeType.Text, metadata: {} } as CanvasNodeData);
    expect(text).toContain("Text node");
    expect(text).toContain("Generate image from text");
    expect(text.match(/disabled=""/g)?.length).toBe(5);
    locale = "zh-CN";
    expect(markup("node", { id: "text", type: CanvasNodeType.Text, metadata: {} } as CanvasNodeData)).toContain("文本节点");
});
