import { afterAll, afterEach, expect, mock, test } from "bun:test";
import { Window } from "happy-dom";
import type { GenerationTask } from "@/services/api/task-center";

const dom = new Window({ url: "https://canvas.example/tasks" });
const previous = new Map<string, PropertyDescriptor | undefined>();
for (const [key, value] of Object.entries({ window: dom, document: dom.document, navigator: dom.navigator,
    HTMLElement: dom.HTMLElement, SVGElement: dom.SVGElement, Element: dom.Element, Node: dom.Node,
    ShadowRoot: dom.ShadowRoot, getComputedStyle: dom.getComputedStyle.bind(dom),
    IS_REACT_ACT_ENVIRONMENT: true })) {
    previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
}
const { act } = await import("react");
const { createRoot } = await import("react-dom/client");
const { App, ConfigProvider } = await import("antd");
const { TaskDetailModal } = await import("@/pages/tasks/task-detail-modal");
let root: ReturnType<typeof createRoot> | undefined;
let host: HTMLDivElement | undefined;
afterEach(async () => {
    await act(async () => root?.unmount());
    host?.remove();
});
afterAll(() => {
    dom.happyDOM.abort();
    for (const [key, descriptor] of previous) {
        if (descriptor) Object.defineProperty(globalThis, key, descriptor);
        else Reflect.deleteProperty(globalThis, key);
    }
});

async function openResult(result: unknown, type = "timeline_render") {
    const task: GenerationTask = { id: "owned-result", type, status: "succeeded",
        prompt: "剪辑成片", attempts: 1, createdAt: "2026-11-09T00:00:00Z", updatedAt: "2026-11-09T00:00:00Z",
        resultJson: JSON.stringify(result) };
    const close = mock(() => {});
    host = document.createElement("div"); document.body.append(host);
    root = createRoot(host);
    await act(async () => root!.render(<ConfigProvider theme={{ token: { motion: false } }}><App>
        <TaskDetailModal task={task} loading={false} logs={[]} logsLoading={false} actingId=""
            canvasName="验收画布" modelName="" creditsEnabled={false} onClose={close}
            onRetry={() => {}} onQueryProvider={() => {}} onDeleteLocalRecord={() => {}}
            onRefreshLocalStatus={() => {}} onExportDiagnostics={() => {}} onPreviewMedia={() => {}} />
    </App></ConfigProvider>));
    return { dialog: document.querySelector<HTMLElement>('[role="dialog"]')!, close };
}

test("task details expose the retained timeline video and separate exact subtitle download", async () => {
    const subtitle = "1\n00:00:00,000 --> 00:00:01,000\n原始字幕 <&>\n\n";
    const { dialog, close } = await openResult({ resourceId: "timeline-owned-resource", fileName: "原始成片.mp4", subtitleSrt: subtitle });
    expect(Boolean(dialog)).toBe(true);
    expect(dialog.querySelector("video")?.getAttribute("src")).toBe("/api/resources/timeline-owned-resource/file");
    expect(dialog.querySelector('a[download="原始成片.mp4"]')?.getAttribute("href")).toBe("/api/resources/timeline-owned-resource/file");
    const srt = dialog.querySelector('a[download="原始成片.srt"]')?.getAttribute("href");
    expect(srt).toBeDefined();
    expect(decodeURIComponent(srt!.split(",").slice(1).join(","))).toBe(subtitle);
    await act(async () => dialog.querySelector<HTMLButtonElement>(".task-detail-close")!.click());
    expect(close).toHaveBeenCalledTimes(1);
});

test("invalid timeline results never turn an unrelated source URL into a completed video", async () => {
    const { dialog } = await openResult({ resourceId: 7, inputUrl: "https://example.invalid/reference.mp4" });
    expect(Boolean(dialog.querySelector("video"))).toBe(false);
    expect(Boolean(dialog.querySelector("a[download]"))).toBe(false);
});

test("completed text is readable and copied exactly without promoting links into generated media", async () => {
    const text = "第一场\n剧本 <script>不是 HTML</script>\n参考：https://example.invalid/reference.png";
    const writeText = mock(async (_text: string) => {});
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    const { dialog } = await openResult({ mode: "text", text }, "canvas_text");
    expect(dialog.querySelector(".task-detail-result-text")?.textContent).toBe(text);
    expect(dialog.querySelector("script,img,video,audio")).toBeNull();
    await act(async () => dialog.querySelector<HTMLButtonElement>(".task-detail-result-copy")!.click());
    expect(writeText).toHaveBeenCalledWith(text);
});

test("structured text uses the same normalization as task materialization", async () => {
    const { dialog } = await openResult({ text: [{ text: "首段\n" }, { content: "尾段" }] }, "canvas_text");
    expect(dialog.querySelector(".task-detail-result-text")?.textContent).toBe("首段\n尾段");
});

test("owned audio outputs play through resource identity instead of an expired URL or reference input", async () => {
    const { dialog } = await openResult({ mode: "audio",
        audio: { storageKey: "resource:owned-audio", dataUrl: "https://example.invalid/expired.mp3" },
        referenceAudios: [{ url: "https://example.invalid/reference.mp3" }] }, "canvas_audio");
    const audio = dialog.querySelector("audio");
    expect(audio?.getAttribute("src")).toBe("/api/resources/owned-audio/file");
    expect(audio?.controls).toBe(true);
    expect(dialog.querySelectorAll("audio").length).toBe(1);
    expect(dialog.querySelector("img,video")).toBeNull();
});

test("multiple audio outputs remain separate and unrelated input URLs stay outside the gallery", async () => {
    const { dialog } = await openResult({ audios: [{ dataUrl: "data:audio/wav;base64,UklGRg==" },
        { dataUrl: "https://example.invalid/second.wav" }], inputUrl: "https://example.invalid/reference.png" }, "canvas_audio");
    expect(dialog.querySelectorAll("audio").length).toBe(2);
    expect(dialog.querySelector("img,video")).toBeNull();
});

test("image previews prefer owned resources and never display a source as the completed result", async () => {
    const { dialog } = await openResult({ images: [{ storageKey: "resource:owned-image", dataUrl: "https://example.invalid/expired.png" }],
        inputUrl: "https://example.invalid/reference.png" }, "canvas_image");
    expect(dialog.querySelector(".task-detail-stage img")?.getAttribute("src")).toBe("/api/resources/owned-image/file");
    expect(dialog.querySelectorAll(".task-detail-stage img").length).toBe(1);
});

test("resource-only outputs retain their MIME type even in a generic workflow task", async () => {
    const { dialog } = await openResult({ output: { resourceId: "owned-voice", mimeType: "audio/wav" } }, "workflow");
    expect(dialog.querySelector("audio")?.getAttribute("src")).toBe("/api/resources/owned-voice/file");
    expect(dialog.querySelector("img,video")).toBeNull();
});

test("mixed workflow gallery switches between the actual image and video resource kinds", async () => {
    const { dialog } = await openResult({ images: [{ storageKey: "resource:mixed-image" }],
        videos: [{ storageKey: "resource:mixed-video" }] }, "workflow");
    expect(dialog.querySelector(".task-detail-stage img")?.getAttribute("src")).toBe("/api/resources/mixed-image/file");
    const thumbnails = dialog.querySelectorAll<HTMLButtonElement>(".task-detail-thumbs button");
    expect(thumbnails.length).toBe(2);
    await act(async () => thumbnails[1]!.click());
    expect(dialog.querySelector(".task-detail-stage video")?.getAttribute("src")).toBe("/api/resources/mixed-video/file");
    expect(dialog.querySelector(".task-detail-zoom")).toBeNull();
});

test("all completed outputs remain accessible instead of silently discarding those after twelve", async () => {
    const images = Array.from({ length: 15 }, (_, i) => ({ storageKey: `resource:batch-${i}` }));
    const { dialog } = await openResult({ images }, "canvas_image");
    const thumbnails = dialog.querySelectorAll<HTMLButtonElement>(".task-detail-thumbs button");
    expect(thumbnails.length).toBe(15);
    await act(async () => thumbnails[14]!.click());
    expect(dialog.querySelector(".task-detail-stage img")?.getAttribute("src")).toBe("/api/resources/batch-14/file");
});
