import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { DEFAULT_CANVAS_COLOR_THEME } from "../src/lib/canvas-theme";

import {
    CANVAS_APPEARANCE_PRESETS,
    DEFAULT_CANVAS_BACKGROUND_MODE,
    canvasAppearanceForPreset,
    canvasAppearanceForTheme,
    customCanvasAppearanceFromTheme,
    enterCustomCanvasAppearance,
    normalizeCanvasAppearance,
    normalizeHexColor,
    readCanvasAppearanceDefault,
    resolveCanvasAppearance,
    resolveCanvasGridColor,
    switchCanvasAppearanceTheme,
    updateCustomCanvasAppearance,
    writeCanvasAppearanceDefault,
} from "../src/lib/canvas/canvas-appearance";

const values = new Map<string, string>();
// 本文件用 stub window 顶掉全局作用域；不还原会污染同进程其它测试文件（后者需要真实 window / localStorage）。
let originalWindow: PropertyDescriptor | undefined;

beforeEach(() => {
    originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
    values.clear();
    Object.defineProperty(globalThis, "window", {
        configurable: true,
        value: {
            localStorage: {
                getItem: (key: string) => values.get(key) || null,
                setItem: (key: string, value: string) => values.set(key, value),
                removeItem: (key: string) => values.delete(key),
            },
        },
    });
});

afterEach(() => {
    if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow);
    else Reflect.deleteProperty(globalThis, "window");
});

describe("canvas custom appearance", () => {
    test("uses point grid as the default for new canvases", () => {
        expect(DEFAULT_CANVAS_BACKGROUND_MODE).toBe("dots");
        expect(DEFAULT_CANVAS_COLOR_THEME).toBe("dark");
    });

    test("resolves the 映雪 dark preset to the archived LTV canvas substrate", () => {
        const appearance = canvasAppearanceForTheme(DEFAULT_CANVAS_COLOR_THEME);
        expect(resolveCanvasAppearance(appearance, "light")).toEqual({
            baseTheme: "dark",
            background: "#171717",
            grid: "rgba(175,175,175,.80)",
        });
        expect(resolveCanvasGridColor(appearance, "light", "dots")).toBe("rgba(175,175,175,.80)");
        expect(resolveCanvasAppearance(customCanvasAppearanceFromTheme("dark"), "light")).toEqual({
            baseTheme: "dark",
            background: "#171717",
            grid: "rgba(175,175,175,0.8)",
        });
    });

    test("switching tones preserves each tone's selected preset", () => {
        const pink = canvasAppearanceForPreset("pink");
        const dark = switchCanvasAppearanceTheme(pink, "dark");
        expect(dark.preset?.id).toBe("dark");
        expect(switchCanvasAppearanceTheme(dark, "light").preset).toEqual(pink.preset);
        expect(resolveCanvasGridColor(canvasAppearanceForTheme("light"), "dark", "dots")).toBe("rgba(0,0,0,.80)");
    });

    test("inherits the active fixed theme the first time custom mode is selected", () => {
        const light = enterCustomCanvasAppearance(canvasAppearanceForTheme("light"), "light");
        expect(light).toMatchObject({
            mode: "custom",
            custom: {
                baseTheme: "light",
                backgroundColor: "#FFFFFF",
                backgroundBrightness: 0,
                gridColor: "#000000",
                gridOpacity: 80,
            },
        });

        const dark = enterCustomCanvasAppearance(canvasAppearanceForTheme("dark"), "dark");
        expect(dark.custom).toMatchObject({ baseTheme: "dark", backgroundColor: "#171717", backgroundBrightness: 0, gridColor: "#AFAFAF", gridOpacity: 80 });
    });

    test("restores the current tone's custom profile and retains the other tone in memory", () => {
        const previous = customCanvasAppearanceFromTheme("light");
        previous.custom = { ...previous.custom!, backgroundColor: "#F3DCE5" };
        const fixedLight = canvasAppearanceForTheme("light", previous);
        expect(enterCustomCanvasAppearance(fixedLight, "light").custom).toEqual(previous.custom);

        const fixedDark = canvasAppearanceForTheme("dark", previous);
        expect(fixedDark.themeMemory?.light?.custom).toEqual(previous.custom);
        expect(enterCustomCanvasAppearance(fixedDark, "dark").custom).toMatchObject({
            baseTheme: "dark",
            backgroundColor: "#171717",
        });
    });

    test("keeps color-picker popups inside the appearance interaction boundary", async () => {
        const toolbarSource = await Bun.file(new URL("../src/components/canvas/canvas-toolbar.tsx", import.meta.url)).text();
        const controlsSource = await Bun.file(new URL("../src/components/canvas/canvas-appearance-controls.tsx", import.meta.url)).text();
        expect(toolbarSource).toContain('closest(".ant-color-picker,.ant-popover")');
        expect(controlsSource).toContain("if (normalized) onChange(normalized)");
    });

    test("custom edits survive serialization without changing the stored preset snapshot", () => {
        const preset = canvasAppearanceForPreset("mint");
        const next = updateCustomCanvasAppearance(preset, { backgroundColor: "#123456" }, "light");
        expect(normalizeCanvasAppearance(JSON.parse(JSON.stringify(next)), "dark").custom?.backgroundColor).toBe("#123456");
        expect(preset.preset?.values.backgroundColor).toBe("#DFE9E6");
    });

    test("keeps hex editing live across parent updates and common hex formats", async () => {
        expect(normalizeHexColor("F3DCE5")).toBe("#F3DCE5");
        expect(normalizeHexColor("#f3d")).toBe("#FF33DD");

        const controlsSource = await Bun.file(new URL("../src/components/canvas/canvas-appearance-controls.tsx", import.meta.url)).text();
        expect(controlsSource).toContain("if (!editing) setTextValue(value)");
        expect(controlsSource).toContain("updateCustom({ backgroundColor, backgroundBrightness: 0 })");
    });

    test("adjusts only the custom canvas substrate and grid", () => {
        const appearance = normalizeCanvasAppearance({
            mode: "custom",
            custom: {
                baseTheme: "light",
                backgroundColor: "#F3DCE5",
                backgroundBrightness: 0,
                backgroundOpacity: 10,
                gridColor: "#9D7182",
                gridOpacity: 22,
            },
        }, "dark");

        const resolved = resolveCanvasAppearance(appearance, "dark");
        expect(resolved.baseTheme).toBe("light");
        expect(resolved.background).toBe("#F3DCE5");
        expect(resolveCanvasGridColor(appearance, "dark", "lines")).toBe("rgba(157,113,130,0.22)");

        appearance.custom!.backgroundBrightness = 10;
        const brighter = resolveCanvasAppearance(appearance, "dark").background;
        appearance.custom!.backgroundBrightness = -10;
        const darker = resolveCanvasAppearance(appearance, "dark").background;

        const brighterParts = brighter.match(/^oklch\(([\d.]+)% ([\d.]+) ([\d.]+)\)$/);
        const darkerParts = darker.match(/^oklch\(([\d.]+)% ([\d.]+) ([\d.]+)\)$/);
        expect(brighterParts).not.toBeNull();
        expect(darkerParts).not.toBeNull();
        expect(Number(brighterParts![1])).toBeGreaterThan(Number(darkerParts![1]));
        expect(brighterParts!.slice(2)).toEqual(darkerParts!.slice(2));
    });

    test("switches the custom interface style without changing custom canvas colors", () => {
        const appearance = customCanvasAppearanceFromTheme("dark");
        appearance.custom = {
            ...appearance.custom!,
            baseTheme: "light",
            backgroundColor: "#F3DCE5",
            gridColor: "#9D7182",
            gridOpacity: 22,
        };

        expect(resolveCanvasAppearance(appearance, "dark")).toEqual({
            baseTheme: "light",
            background: "#F3DCE5",
            grid: "rgba(157,113,130,0.22)",
        });
    });

    test("does not expose background opacity after legacy values are ignored", async () => {
        const controlsSource = await Bun.file(new URL("../src/components/canvas/canvas-appearance-controls.tsx", import.meta.url)).text();
        expect(CANVAS_APPEARANCE_PRESETS.filter(preset => preset.values.baseTheme === "light").map(preset => preset.values.backgroundColor)).toContain("#FFFFFF");
        expect(CANVAS_APPEARANCE_PRESETS.filter(preset => preset.values.baseTheme === "dark").map(preset => preset.values.backgroundColor)).toContain("#000000");
        expect(controlsSource).not.toContain('label="背景透明度"');
        expect(controlsSource).toContain('aria-label={t("canvasA.appearance.themeMode")}');
        expect(controlsSource).toContain('label={t("canvasA.appearance.gridOpacity")}');
    });

    test("stores defaults locally with the active account scope", () => {
        window.localStorage.setItem("infinite-canvas:active-user-scope", "account-A");
        const value = { appearance: customCanvasAppearanceFromTheme("dark"), backgroundMode: "lines" as const };
        writeCanvasAppearanceDefault(value);

        expect(values.has("infinite-canvas:canvas-appearance-default:user:account-A")).toBe(true);
        expect(readCanvasAppearanceDefault()).toEqual(value);

        window.localStorage.setItem("infinite-canvas:active-user-scope", "account-B");
        expect(readCanvasAppearanceDefault()).toBeNull();
    });
});
