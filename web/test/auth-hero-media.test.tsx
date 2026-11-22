import { afterAll, afterEach, expect, test } from "bun:test";
import { Window } from "happy-dom";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { I18nextProvider } from "react-i18next";
import { AuthHeroMedia } from "../src/components/auth/auth-hero-media";
import { i18n } from "../src/i18n";
import { DEFAULT_PUBLIC_APPEARANCE, useAppearanceStore } from "../src/stores/use-appearance-store";

const dom = new Window({ url: "https://canvas.example/" });
const originals = new Map<string, PropertyDescriptor | undefined>();
for (const [key, value] of Object.entries({ window: dom, document: dom.document, navigator: dom.navigator, HTMLElement: dom.HTMLElement, Element: dom.Element, IS_REACT_ACT_ENVIRONMENT: true })) {
    originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
}
const previousAppearance = useAppearanceStore.getState().appearance;
let plays = 0;
let pauses = 0;
dom.HTMLMediaElement.prototype.play = () => { plays++; return Promise.resolve(); };
dom.HTMLMediaElement.prototype.pause = () => { pauses++; };
let root: Root | undefined;
let container: HTMLDivElement;

async function render(props: { active?: boolean; hiddenQuery?: string } = {}) {
    if (!root) {
        container = document.createElement("div");
        document.body.append(container);
        root = createRoot(container);
    }
    await act(async () => { root!.render(<I18nextProvider i18n={i18n}><AuthHeroMedia {...props} /></I18nextProvider>); });
    return container;
}

afterEach(async () => {
    if (root) await act(async () => { root!.unmount(); });
    root = undefined;
    container?.remove();
    useAppearanceStore.setState({ appearance: previousAppearance });
    plays = 0;
    pauses = 0;
});
afterAll(() => {
    dom.happyDOM.abort();
    for (const [key, value] of originals) {
        if (value) Object.defineProperty(globalThis, key, value);
        else Reflect.deleteProperty(globalThis, key);
    }
});

function configure(autoplay = true) {
    useAppearanceStore.setState({ appearance: { ...DEFAULT_PUBLIC_APPEARANCE, authVideoUrl: "/brand-film.mp4", authVideoPosterUrl: "/brand-poster.webp", authVideoAutoplay: autoplay } });
}

test("uses configured video and plays muted inline without blocking the form", async () => {
    configure();
    const view = await render();
    const video = view.querySelector("video")!;
    expect(video.getAttribute("src")).toBe("/brand-film.mp4");
    expect(video.muted).toBe(true);
    expect(video.hasAttribute("playsinline")).toBe(true);
    expect(video.loop).toBe(true);
    expect(plays).toBeGreaterThan(0);
});

test("turning autoplay off shows the poster until the play control is clicked", async () => {
    configure(false);
    const view = await render();
    expect(view.querySelector("video")).toBeNull();
    expect(view.querySelector("img")?.getAttribute("src")).toBe("/brand-poster.webp");
    await act(async () => { view.querySelector("button")!.click(); });
    expect(view.querySelector("video")).not.toBeNull();
    expect(plays).toBeGreaterThan(0);
});

test("closing the dialog releases the video and reopening plays again", async () => {
    configure();
    await render();
    const closed = await render({ active: false });
    expect(closed.querySelector("video")).toBeNull();
    expect(pauses).toBeGreaterThan(0);
    const reopened = await render();
    expect(reopened.querySelector("video")).not.toBeNull();
});

test("hidden mobile brand stage does not request a video or poster", async () => {
    configure();
    const view = await render({ hiddenQuery: "(min-width: 0px)" });
    expect(view.querySelector("video, img")).toBeNull();
    expect(plays).toBe(0);
});

test("failed video falls back to the configured poster and offers retry", async () => {
    configure();
    const view = await render();
    await act(async () => { view.querySelector("video")!.dispatchEvent(new dom.Event("error")); });
    expect(view.querySelector("video")).toBeNull();
    expect(view.querySelector("img")?.getAttribute("src")).toBe("/brand-poster.webp");
    await act(async () => { view.querySelector("button")!.click(); });
    expect(view.querySelector("video")).not.toBeNull();
});
