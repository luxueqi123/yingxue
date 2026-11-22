import { expect, mock, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { interfaceTranslator, loadInterfaceLocale, type InterfaceLocale } from "../src/lib/interface-locale";

let locale: InterfaceLocale = "en-US";
mock.module("../src/stores/use-interface-locale-store", () => ({
    useInterfaceTranslation: () => ({ locale, t: interfaceTranslator(locale) }),
}));
const { CanvasZoomControls } = await import("../src/components/canvas/canvas-zoom-controls");
const noAction = () => { throw new Error("Rendering must not change canvas state"); };

test("canvas controls use all ten languages without changing numeric state", async () => {
    const labels = {
        "zh-CN": ["打开小地图", "精确缩放"], "zh-HK": ["開啟小地圖", "精確縮放"], "zh-TW": ["開啟小地圖", "精確縮放"],
        "en-US": ["Open minimap", "Precise zoom"], "ja-JP": ["ミニマップを開く", "ズームを調整"],
        "ko-KR": ["미니맵 열기", "정밀 확대/축소"], "es-ES": ["Abrir minimapa", "Zoom preciso"],
        "pt-BR": ["Abrir minimapa", "Zoom preciso"], "fr-FR": ["Ouvrir la mini-carte", "Zoom précis"],
        "de-DE": ["Minikarte öffnen", "Genauer Zoom"],
    } satisfies Record<InterfaceLocale, string[]>;
    for (const language of Object.keys(labels) as InterfaceLocale[]) {
        await loadInterfaceLocale(language);
        locale = language;
        const html = renderToStaticMarkup(<CanvasZoomControls scale={0.5} onScaleChange={noAction} onFitContent={noAction}
            onAutoArrange={noAction} isMiniMapOpen={false} onToggleMiniMap={noAction} onOpenShortcuts={noAction}
            onHideNodeConnectionsChange={noAction} />);
        for (const label of labels[language]) expect(html).toContain(`aria-label="${label}"`);
        expect(html).toContain(">50</span>");
        expect(html).not.toContain("canvasControls.");
        expect(html).toContain('aria-expanded="false"');
    }
});
