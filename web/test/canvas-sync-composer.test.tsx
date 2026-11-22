import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { Window } from "happy-dom";
import { AgentChatComposer } from "../src/components/canvas/canvas-cloud-agent-composer";
import { canvasThemes } from "../src/lib/canvas-theme";
import { CanvasSyncStatus } from "../src/pages/canvas/canvas-sync-status";
import { useSyncProgressStore } from "../src/stores/use-sync-progress-store";

test("unconfirmed sync prevents sending without disabling the real Agent input", () => {
    const markup = renderToStaticMarkup(<AgentChatComposer prompt="Keep this draft" submitDisabled placeholder="Compose" theme={canvasThemes.dark} onPromptChange={() => {}} onSubmit={() => {}} />);
    const sendButton = markup.match(/<button[^>]*aria-label="发送"[^>]*>/)?.[0];
    expect(sendButton).toBeDefined();
    expect(sendButton).toContain("disabled");
    expect(markup).toContain('aria-label="Agent 输入"');
    expect(markup).not.toContain('contenteditable="false"');
});

test("real sync status keeps recovery actions collapsed until the status button opens", async () => {
    const dom = new Window({ url: "https://canvas.example/" });
    const globals = { window: dom, document: dom.document, navigator: dom.navigator, Element: dom.Element, HTMLElement: dom.HTMLElement, SVGElement: dom.SVGElement, ShadowRoot: dom.ShadowRoot, Node: dom.Node, Event: dom.Event, getComputedStyle: dom.getComputedStyle.bind(dom), MutationObserver: dom.MutationObserver, ResizeObserver: dom.ResizeObserver, IS_REACT_ACT_ENVIRONMENT: true };
    const descriptors = new Map(Object.keys(globals).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
    for (const [key, value] of Object.entries(globals)) Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
    const { act } = await import("react");
    const { createRoot } = await import("react-dom/client");
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    useSyncProgressStore.getState().setProjectProgress("status-test", { phase: "pending", errorKind: "network", message: "画布同步失败：连接中断" });
    try {
        await act(async () => root.render(<CanvasSyncStatus projectId="status-test" onLoadLatest={async () => { throw new Error("Rendering must not replace the editor"); }} />));
        const markup = host.innerHTML;
        expect(markup).toContain('aria-label="画布保存状态：正在同步"');
        expect(markup).toContain('aria-expanded="false"');
        expect(markup.match(/<button\b/g)).toHaveLength(1);
        expect(markup).not.toContain("采用云端");
        expect(markup).not.toContain("另存");
        expect(markup).not.toContain("导出");
    } finally {
        await act(async () => root.unmount());
        host.remove();
        useSyncProgressStore.getState().setProjectProgress("status-test", null);
        await dom.happyDOM.abort();
        for (const [key, descriptor] of descriptors) {
            if (descriptor) Object.defineProperty(globalThis, key, descriptor);
            else Reflect.deleteProperty(globalThis, key);
        }
    }
});
