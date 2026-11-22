import { expect, test } from "bun:test";
import { interfaceLocales, interfaceTranslator, loadInterfaceLocale } from "../src/lib/interface-locale";
import { createStyleProfileSnapshot, styleAssetValidationMessage, styleProfileValidationMessage, type StyleAssetBinding } from "../src/lib/canvas/style-profile";

test("style validation follows all eight languages without changing user content or validation rules", async () => {
    const asset: StyleAssetBinding = { id: "test-asset", title: "雪山 Snow {count}", kind: "lora", provider: "test", status: "draft", weight: 3 };
    const profile = createStyleProfileSnapshot({ id: "test-style", title: "原始画风 {name}", description: "", prompt: "用户原文 Snow {count}", tags: [], assets: [] });
    const before = JSON.stringify({ asset, profile });
    for (const locale of interfaceLocales) {
        await loadInterfaceLocale(locale);
        const t = interfaceTranslator(locale);
        expect(styleAssetValidationMessage(asset, t)).toBe(t("styleValidationUi.weightRange"));
        expect(styleProfileValidationMessage({ ...profile, assets: [asset] }, t)).toBe(t("styleValidationUi.assetError", { name: asset.title, message: t("styleValidationUi.weightRange") }));
        expect(styleAssetValidationMessage({ ...asset, weight: 2 }, t)).toBe("");
        expect(styleProfileValidationMessage(profile, t)).toBe("");
    }
    expect(styleAssetValidationMessage(asset)).toBe("LoRA 权重必须在 0 到 2 之间");
    expect(JSON.stringify({ asset, profile })).toBe(before);
});
