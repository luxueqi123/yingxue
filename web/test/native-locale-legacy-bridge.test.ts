import { expect, test } from "bun:test";
import { interfaceTranslator, loadInterfaceLocale } from "@/lib/interface-locale";
import { legacyMessagesFromNative, nativeLocaleMessage } from "@/i18n/locale-catalogs";

test("registered locale requests share the complete legacy and native load", async () => {
    const first = loadInterfaceLocale("fr-FR");
    expect(loadInterfaceLocale("fr-FR")).toBe(first);
    await first;
    expect(loadInterfaceLocale("fr-FR")).toBe(first);
});

test("native catalogs retain direct legacy keys and dotted overrides", async () => {
    await Promise.all([loadInterfaceLocale("fr-FR"), loadInterfaceLocale("de-DE")]);
    expect(nativeLocaleMessage("fr-FR", "drama.storyboardRules.pacingRapid")).toBe("Rythme très rapide");
    expect(interfaceTranslator("fr-FR")("agentRuntimeUiSubmissionNotSent")).toContain("n’a pas été envoyé");
    expect(interfaceTranslator("de-DE")("authGoogleLogin")).toBe("Mit Google anmelden");
    const converted = legacyMessagesFromNative({ "agentOpsUi.deleteNodes": "Effacer {{count}} : {{names}}" });
    expect(converted["agentOpsUi.deleteNodes"]).toBe("Effacer {count} : {names}");
});

test("French and German action messages preserve placeholders and original content", async () => {
    for (const locale of ["fr-FR", "de-DE"] as const) {
        await loadInterfaceLocale(locale);
        const t = interfaceTranslator(locale);
        expect(t("toolLabelUi.context")).not.toBe(interfaceTranslator("zh-CN")("toolLabelUi.context"));
        const preview = t("agentOpsUi.deleteNodes", { count: 2, names: "原始节点 {count}" });
        expect(preview).toContain("2");
        expect(preview).toContain("原始节点 {count}");
        expect(preview).not.toContain("{{");
        expect(t("agentOpsUi.generationWarning")).not.toMatch(/[\u3400-\u9fff]/);
    }
});

test("incomplete native translations cannot discard or invent approval placeholders", () => {
    for (const translation of ["Effacer {{count}}", "Effacer {{count}} : {{other}}", "Effacer {{count}} : {{names}} {{names}}"])
        expect(legacyMessagesFromNative({ "agentOpsUi.deleteNodes": translation })["agentOpsUi.deleteNodes"]).toBeUndefined();
    expect(legacyMessagesFromNative({ "agentOpsUi.deleteNodes": "{{names}} : {{count}}" })["agentOpsUi.deleteNodes"])
        .toBe("{names} : {count}");
});
