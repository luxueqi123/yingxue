import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { interfaceLocales, loadInterfaceLocale } from "../src/lib/interface-locale";
import { getLoadedNativeLocale } from "../src/i18n/locale-catalogs";
import { describePrevisSaveStatus, resolvePrevisCloseOutcome } from "../src/lib/canvas/previs/previs-save-wiring";

const expectedSaved = { "zh-CN": "已保存到云端", "zh-HK": "已儲存至雲端", "zh-TW": "已儲存至雲端", "en-US": "Saved to cloud", "ja-JP": "クラウドに保存済み", "ko-KR": "클라우드에 저장됨", "es-ES": "Guardado en la nube", "pt-BR": "Salvo na nuvem", "fr-FR": "Enregistré dans le cloud", "de-DE": "In der Cloud gespeichert" };

for (const locale of interfaceLocales) {
    test(`${locale}: save feedback distinguishes confirmed, pending and failed persistence`, async () => {
        await loadInterfaceLocale(locale);
        const messages = getLoadedNativeLocale(locale)!.previsSave as Record<string, string>;
        expect(messages).toBeDefined();
        const t = (key: string) => messages[key];
        const progress = { status: "saved" as const, revision: 3, confirmedRevision: 3, draftStored: false };
        expect(describePrevisSaveStatus(progress, t).label).toBe(expectedSaved[locale]);
        const pending = describePrevisSaveStatus({ ...progress, confirmedRevision: 2 }, t);
        expect(pending).toMatchObject({ label: messages.unsaved, retryable: true, tone: "pending" });
        expect(describePrevisSaveStatus({ ...progress, status: "saving" }, t)).toMatchObject({ label: messages.saving, busy: true });
        for (const draftStored of [true, false]) {
            expect(describePrevisSaveStatus({ ...progress, status: "error", draftStored }, t)).toMatchObject({ label: messages[draftStored ? "failedWithDraft" : "failedWithoutDraft"], tone: "danger", retryable: true });
        }
        expect(resolvePrevisCloseOutcome("offer-draft-exit", t)).toEqual({ kind: "confirm-draft-exit", message: messages.confirmDraftExit });
        expect(resolvePrevisCloseOutcome("stay", t)).toEqual({ kind: "blocked", message: messages.blocked });
        expect(new Set(Object.values(messages)).size).toBe(Object.keys(messages).length);
    });
}

test("director persistence waits for the server and asset handoff keeps its route until cloud acknowledgement", () => {
    const project = readFileSync(new URL("../src/pages/canvas/project.tsx", import.meta.url), "utf8");
    const previs = project.slice(project.indexOf("<CanvasPrevisWorkbench"), project.indexOf("onboardingScope={previsOnboardingScope}"));
    expect(previs).toMatch(/onFlush=\{async \(\) => \{\s*await flushCanvasStorePersistence\(\);\s*await saveRemoteUserDataNow\(projectId\);\s*\}\}/);
    const handoff = project.slice(project.indexOf("const persistHandoff = async"), project.indexOf("const ownerId =", project.indexOf("const persistHandoff = async")));
    expect(handoff.indexOf("await saveRemoteUserDataNow(projectId)")).toBeGreaterThan(handoff.indexOf("await flushCanvasStorePersistence()"));
    expect(handoff.indexOf("await saveRemoteUserDataNow(projectId)")).toBeLessThan(handoff.indexOf("setSearchParams(finalized.searchParams"));
});
