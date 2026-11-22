import { loadInterfaceLocale as preloadInterfaceLocale } from "../src/lib/interface-locale";
await preloadInterfaceLocale("en-US");

import { expect, mock, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { interfaceTranslator, type InterfaceLocale } from "../src/lib/interface-locale";
import type { SyncProjectProgress } from "../src/stores/use-sync-progress-store";

let locale: InterfaceLocale = "en-US";
let progress: SyncProjectProgress | undefined;
mock.module("../src/stores/use-interface-locale-store", () => ({
    useInterfaceTranslation: () => ({ locale, t: interfaceTranslator(locale) }),
}));
mock.module("../src/stores/use-sync-progress-store", () => ({
    useSyncProgressStore: (select: (state: { syncingProjects: Record<string, SyncProjectProgress> }) => unknown) =>
        select({ syncingProjects: progress ? { fixture: progress } : {} }),
}));
const { CanvasSyncStatus } = await import("../src/pages/canvas/canvas-sync-status");

test("sync status translates every phase without turning pending or failed writes into saved", () => {
    const phases = [
        [undefined, "Not synced", "尚未同步"],
        ["pending", "Syncing", "正在同步"],
        ["uploading", "Syncing", "正在同步"],
        ["saving", "Syncing", "正在同步"],
        ["done", "Saved to cloud", "已保存到云端"],
        ["error", "Cloud save failed", "云端保存失败"],
        ["conflict", "Resolve conflict", "需要处理冲突"],
    ] as const;
    for (const [phase, en, zh] of phases) {
        progress = phase ? { projectId: "fixture", total: 5, completed: 2, phase, message: "原始错误 {detail}", draftCount: 1 } : undefined;
        const before = JSON.stringify(progress);
        for (const language of ["en-US", "zh-CN"] as const) {
            locale = language;
            const html = renderToStaticMarkup(<CanvasSyncStatus projectId="fixture" onLoadLatest={async () => { throw new Error("Rendering must not load cloud data"); }} />);
            expect(html).toContain(language === "en-US" ? en : zh);
            expect(html).toContain('aria-expanded="false"');
            if (phase !== "done") expect(html).not.toContain(language === "en-US" ? "Saved to cloud" : "已保存到云端");
            expect(JSON.stringify(progress)).toBe(before);
        }
    }
});
