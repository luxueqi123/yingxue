import { afterAll, expect, mock, test } from "bun:test";
import { Window } from "happy-dom";

const dom = new Window({ url: "http://localhost/" });
const originals = new Map<string, PropertyDescriptor | undefined>();
class TestAudio extends dom.EventTarget {
    static instances: TestAudio[] = [];
    currentTime = 0;
    duration = 3;
    preload = "";
    src = "";
    constructor() { super(); TestAudio.instances.push(this); }
    removeAttribute(name: string) { if (name === "src") this.src = ""; }
    load() { if (this.src) this.emit("loadedmetadata"); }
    async play() { this.emit("playing"); }
    pause() { this.emit("pause"); }
    emit(type: string) { this.dispatchEvent(new dom.Event(type)); }
}
for (const [key, value] of Object.entries({
    window: dom, document: dom.document, navigator: dom.navigator,
    HTMLElement: dom.HTMLElement, Element: dom.Element, Node: dom.Node,
    Audio: TestAudio, requestAnimationFrame: dom.requestAnimationFrame.bind(dom),
    cancelAnimationFrame: dom.cancelAnimationFrame.bind(dom), IS_REACT_ACT_ENVIRONMENT: true,
})) {
    originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
}
// Browser decoding is the external boundary; the actual component, playback
// service, subscription and click handlers remain in this test.
mock.module("@/lib/canvas/canvas-audio-waveform", () => ({ AUDIO_WAVEFORM_BARS: 48, loadAudioWaveform: async () => [] }));
const { act } = await import("react");
const { createRoot } = await import("react-dom/client");
const { CanvasAudioPlayer } = await import("../src/components/canvas/canvas-audio-player");
const { canvasThemes } = await import("../src/lib/canvas-theme");
const { CanvasNodeType } = await import("../src/types/canvas");
const { canvasAudioPlayback } = await import("../src/services/canvas-audio-playback");
const { useInterfaceLocaleStore } = await import("../src/stores/use-interface-locale-store");

afterAll(() => {
    canvasAudioPlayback.stop();
    dom.happyDOM.abort();
    for (const [key, value] of originals) {
        if (value) Object.defineProperty(globalThis, key, value);
        else Reflect.deleteProperty(globalThis, key);
    }
});

test("audio node renders duration, starts only on click, updates progress and pauses", async () => {
    await useInterfaceLocaleStore.getState().setLocale("zh-CN");
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    try {
        await act(async () => root.render(<CanvasAudioPlayer theme={canvasThemes.dark} node={{
            id: "player-a", type: CanvasNodeType.Audio, title: "音频", position: { x: 0, y: 0 }, width: 320, height: 180,
            metadata: { content: "data:audio/wav;base64,isolated", durationMs: 3000 },
        }} />));
        expect(host.querySelector("audio")).toBeNull();
        expect(TestAudio.instances).toHaveLength(0);
        expect(host.textContent).toContain("00:00 / 00:03");
        const button = host.querySelector("button")!;
        expect(button.getAttribute("aria-label")).toContain("播放");
        await act(async () => { button.click(); });
        expect(TestAudio.instances).toHaveLength(1);
        expect(button.getAttribute("aria-label")).toContain("暂停");
        const audio = TestAudio.instances[0]!;
        await act(async () => { audio.currentTime = 1.25; audio.emit("timeupdate"); });
        expect(host.textContent).toContain("00:01 / 00:03");
        await act(async () => { button.click(); });
        expect(button.getAttribute("aria-label")).toContain("播放");
        expect(TestAudio.instances).toHaveLength(1);
    } finally {
        await act(async () => root.unmount());
        host.remove();
    }
});
