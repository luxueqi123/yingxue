import { loadInterfaceLocale as preloadInterfaceLocale } from "../src/lib/interface-locale";
await preloadInterfaceLocale("en-US");

import { expect, mock, test } from "bun:test";
import { renderInLocale } from "./helpers/locale-render";
import { MemoryRouter } from "react-router";
import { interfaceTranslator, type InterfaceLocale } from "../src/lib/interface-locale";

let locale: InterfaceLocale = "en-US";
const renderToStaticMarkup = (node: React.ReactNode) => renderInLocale(node, locale);
mock.module("../src/stores/use-interface-locale-store", () => ({
    useInterfaceTranslation: () => ({ locale, t: interfaceTranslator(locale) }),
    useInterfaceLocaleStore: (select: (state: { loadFailed: boolean; setLocale: () => void }) => unknown) => select({
        loadFailed: false,
        setLocale: () => { throw new Error("Rendering must not change language"); },
    }),
}));
mock.module("../src/hooks/use-wallet-balance", () => ({
    useWalletBalance: () => ({ availableMicrocredits: null, refreshing: false }),
}));
const { CanvasTopBar } = await import("../src/pages/canvas/canvas-project-top-bar");
const { CanvasFocusModeBar } = await import("../src/components/canvas/canvas-focus-mode-bar");
const noAction = () => { throw new Error("Rendering a translated control must not execute it"); };

test("small-screen focus toolbar translates labels without changing toggle state or zoom", () => {
    locale = "en-US";
    const html = renderToStaticMarkup(<CanvasFocusModeBar versionsOpen={true} dockRevealed={true} zoomPercent={0.3}
        onToggleVersions={noAction} onToggleDock={noAction} onExit={noAction}
        onZoomIn={noAction} onZoomOut={noAction} onFit={noAction} />);
    for (const label of ["Focus mode toolbar", "Version history", "Tools", "Zoom out", "Zoom in"]) {
        expect(html).toContain(`aria-label="${label}"`);
    }
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain("30%");
});

test("real topbar labels switch language without translating or changing the canvas title", () => {
    for (const language of ["en-US", "zh-CN"] as const) {
        locale = language;
        const html = renderToStaticMarkup(<MemoryRouter><CanvasTopBar
            title="中文原工程 {name}" titleDraft="中文原工程 {name}" isTitleEditing={false}
            versionsOpen={false} canUndo={false} canRedo={false} shortcutRequestNonce={0}
            mediaPerformanceMode="auto" onMediaPerformanceModeChange={noAction}
            onToggleVersions={noAction} onTitleDraftChange={noAction} onStartTitleEditing={noAction}
            onFinishTitleEditing={noAction} onCancelTitleEditing={noAction} onCreateProject={noAction}
            onDeleteProject={noAction} onSave={noAction} onForceSave={noAction} onImportImage={noAction}
            onImportLibTV={noAction} onImportTapNow={noAction} onUndo={noAction} onRedo={noAction}
            onShare={noAction} onOpenSearch={noAction} onEnterFocusMode={noAction}
        /></MemoryRouter>);
        const en = locale === "en-US";
        expect(html).toContain("中文原工程 {name}");
        for (const label of en ? ["Open canvas menu", "Rename canvas", "Import canvas", "Version history", "Share canvas"]
            : ["打开画布菜单", "重命名画布", "导入第三方画布", "版本记录", "分享画布"]) {
            expect(html).toContain(`aria-label="${label}"`);
        }
        expect(html).not.toContain(`aria-label="${en ? "重命名画布" : "Rename canvas"}"`);
    }
});
