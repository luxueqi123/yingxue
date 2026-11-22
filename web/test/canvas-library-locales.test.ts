import { expect, test } from "bun:test";
import { interfaceLocales, interfaceTranslator, loadInterfaceLocale } from "@/lib/interface-locale";
import zh from "@/lib/locales/zh-CN";

const keys = Object.keys(zh).filter(key => /^(canvasLibrary|canvasSync|canvasDrafts)/.test(key) || key === "myCanvas") as Array<keyof typeof zh>;
const placeholders = (text: string) => [...text.matchAll(/\{\{?(\w+)\}?\}/g)].map(match => match[1]).sort();

test("canvas menus, workspace and toolbars preserve their labels and values in every language", async () => {
    const controls = Object.keys(zh).filter(key => /^(canvasToolbar|workspace|toolbar)/.test(key) || ["canvasUi.editNodeName", "canvasUi.connectionPoint", "canvasToolsUi.skipToCanvas", "studioUi.input", "studioUi.output"].includes(key)) as Array<keyof typeof zh>;
    for (const locale of interfaceLocales) {
        const bundle = await loadInterfaceLocale(locale);
        const t = interfaceTranslator(locale);
        for (const key of controls) {
            expect(bundle[key]?.trim().length, `${locale}:${key}`).toBeGreaterThan(0);
            expect(placeholders(t(key)), `${locale}:${key}`).toEqual(placeholders(zh[key]));
            // Japanese uses the same valid label for Save; require its own resource above.
            const sharedJapaneseLabel = locale === "ja-JP" && key === "canvasToolbarSave";
            if (!["zh-CN", "zh-HK", "zh-TW"].includes(locale) && !sharedJapaneseLabel) expect(t(key), `${locale}:${key}`).not.toBe(zh[key]);
        }
        const original = "原始项目 {{name}}";
        expect(t("canvasToolbarBackProject", { name: original })).toContain(original);
        expect(t("canvasUi.editNodeName", { name: original })).toContain(original);
    }
});

test("canvas library and save recovery messages cover every registered language", async () => {
    for (const locale of interfaceLocales) {
        await loadInterfaceLocale(locale);
        const t = interfaceTranslator(locale);
        for (const key of keys) {
            const actual = t(key);
            expect(actual.trim().length, `${locale}:${key}`).toBeGreaterThan(0);
            expect(placeholders(actual), `${locale}:${key}`).toEqual(placeholders(zh[key]));
            if (!["zh-CN", "zh-HK", "zh-TW"].includes(locale)) expect(actual, `${locale}:${key}`).not.toBe(zh[key]);
        }
        const original = "原始画布 {count}";
        expect(t("canvasLibraryOpen", { name: original })).toContain(original);
        expect(t("canvasSyncAccessibleStatus", { status: original })).toContain(original);
    }
});
