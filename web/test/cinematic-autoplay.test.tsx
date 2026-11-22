import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { CinematicBackground } from "../src/components/brand/cinematic-background";

test("disabled autoplay starts paused with a discoverable manual play control", () => {
    const original = Object.getOwnPropertyDescriptor(globalThis, "window");
    try {
        Object.defineProperty(globalThis, "window", { configurable: true, value: {
            matchMedia: () => ({ matches: false }),
        } });
        const paused = renderToStaticMarkup(<CinematicBackground controls autoPlay={false} />);
        expect(paused).toContain('aria-label="播放背景影片"');
        expect(paused).toContain('aria-pressed="true"');
        const automatic = renderToStaticMarkup(<CinematicBackground controls />);
        expect(automatic).toContain('aria-label="暂停背景影片"');
        expect(automatic).not.toContain("<video");
        expect(automatic).toContain("hero-film.webp");
    } finally {
        if (original) Object.defineProperty(globalThis, "window", original);
        else Reflect.deleteProperty(globalThis, "window");
    }
});
