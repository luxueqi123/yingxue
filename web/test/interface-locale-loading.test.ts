import { describe, expect, test } from "bun:test";
import { createInterfaceLocaleRegistry, getLoadedInterfaceLocale, interfaceTranslator, loadInterfaceLocale, interfaceLocaleOptions } from "../src/lib/interface-locale";

describe("local interface language bundles", () => {
    test("falls back by key and retries a failed local import without caching failure", async () => {
        let attempts = 0;
        const registry = createInterfaceLocaleRegistry({ "en-US": () => {
            attempts += 1;
            return attempts === 1 ? Promise.reject(new Error("chunk unavailable")) : Promise.resolve({ home: "Home" });
        } });
        expect(registry.translate("en-US", "home")).toBe("首页");
        const failed = registry.load("en-US");
        expect(registry.load("en-US")).toBe(failed);
        await expect(failed).rejects.toThrow("chunk unavailable");
        expect(registry.get("en-US")).toBeUndefined();
        await registry.load("en-US");
        expect(attempts).toBe(2);
        expect(registry.translate("en-US", "home")).toBe("Home");
        expect(registry.translate("en-US", "language")).toBe("界面语言");
        await registry.load("en-US");
        expect(attempts).toBe(2);
        await expect(registry.load("../../unregistered" as never)).rejects.toThrow("Unregistered");
    });
    test("starts with Chinese and loads English without changing user values", async () => {
        expect(getLoadedInterfaceLocale("zh-CN")).toBeDefined();
        expect(interfaceLocaleOptions.map(option => option.value)).toEqual(["zh-CN", "zh-HK", "zh-TW", "en-US", "ja-JP", "ko-KR", "es-ES", "pt-BR", "fr-FR", "de-DE"]);
        const first = loadInterfaceLocale("en-US");
        const second = loadInterfaceLocale("en-US");
        expect(first).toBe(second);
        const bundle = await first;
        expect(getLoadedInterfaceLocale("en-US")).toBe(bundle);
        expect(interfaceTranslator("en-US")("canvasToolbarBackProject", { name: "雪山 {name} <script>" }))
            .toBe("Back to project: 雪山 {name} <script>");
        expect(interfaceTranslator("zh-CN")("canvasToolbarBackProject", { name: "Snow {name}" }))
            .toContain("Snow {name}");
    });

    test("every registered language contains the default keys and the same placeholders", async () => {
        const zh = await loadInterfaceLocale("zh-CN");
        for (const option of interfaceLocaleOptions) {
            const messages = await loadInterfaceLocale(option.value);
            expect(Object.keys(messages).sort()).toEqual(Object.keys(zh).sort());
            for (const key of Object.keys(zh) as (keyof typeof zh)[]) {
                const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map(match => match[1]).sort();
                expect(messages[key].trim().length).toBeGreaterThan(0);
                expect(placeholders(messages[key])).toEqual(placeholders(zh[key]));
            }
        }
    });
});
