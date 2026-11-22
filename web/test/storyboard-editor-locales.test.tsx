import { expect, mock, test } from "bun:test";
import { readFileSync } from "node:fs";
import { interfaceLocales, loadInterfaceLocale, interfaceTranslator, type InterfaceLocale } from "../src/lib/interface-locale";
import { createCanvasNode, createStoryboardRow } from "../src/lib/canvas/canvas-project-domain";
import { deriveStoryboardPipelineProgress } from "../src/lib/canvas/canvas-storyboard-progress";
import { CanvasNodeType } from "../src/types/canvas";
import { renderInLocale } from "./helpers/locale-render";

let activeLocale: InterfaceLocale = "zh-CN";
mock.module("../src/stores/use-interface-locale-store", () => ({
    useInterfaceTranslation: () => ({ locale: activeLocale, t: interfaceTranslator(activeLocale) }),
}));
const { CanvasScriptNodeContent } = await import("../src/components/canvas/canvas-script-node");

test("both storyboard editor surfaces have real French and German copy for every referenced label", async () => {
    const defaults = await loadInterfaceLocale("zh-CN");
    const keys = new Set<string>();
    for (const name of ["canvas-script-node.tsx", "canvas-script-node-parts.tsx", "storyboard-assets-cell.tsx", "storyboard-reference-cell.tsx"]) {
        const source = readFileSync(new URL(`../src/components/canvas/${name}`, import.meta.url), "utf8");
        for (const match of source.matchAll(/["']([A-Za-z][\w.]+)["']/g)) if (match[1] in defaults) keys.add(match[1]);
    }
    expect(keys.size).toBeGreaterThan(140);
    for (const locale of ["fr-FR", "de-DE"] as const) {
        const messages = await loadInterfaceLocale(locale);
        for (const key of keys) {
            const value = messages[key as keyof typeof messages];
            expect(value, `${locale}:${key}`).toBeDefined();
            expect(value?.trim(), `${locale}:${key}`).not.toBe("");
            expect(value, `${locale}:${key}`).not.toMatch(/[\u3400-\u9fff]/);
            const variables = (text: string) => [...text.matchAll(/\{\{?(\w+)\}?\}/g)].map(match => match[1]).sort();
            expect(variables(value!)).toEqual(variables(defaults[key as keyof typeof defaults]));
        }
    }
});

test("real storyboard controls keep user dialogue, fractional durations and models in every language", async () => {
    const dialogue = "林雪：原来你一直记得。";
    const row = createStoryboardRow(7, { id: "original-row", durationSeconds: 2.5, dialogue, videoMotionPrompt: "A train enters the station", characters: [] });
    const node = createCanvasNode(CanvasNodeType.Script, { x: 0, y: 0 }, { storyboard: { rows: [row], visibleColumns: [], referenceNodeIds: [] }, composerContent: "保持用户原文" });
    node.height = 600;
    const initial = structuredClone(node);
    const noop = () => { throw new Error("Rendering must not submit generation or mutate data"); };
    const props = {
        node, nodes: [node], pipeline: deriveStoryboardPipelineProgress(node, [node], []), scale: 1, mentionReferences: [],
        onOpen: noop, onCreateImageNodes: noop, onCreateVideoNodes: noop, onGenerateImages: noop, onGenerateVideos: noop,
        onVideoInputModeChange: noop, onMergeVideos: noop, onCreateActionBoards: noop, onRetryBatch: noop,
        onRetryBatchItem: noop, onStopBatch: noop, onAddRow: noop, onRemoveRow: noop, onUpdateRow: noop,
        onPromptChange: noop, onGenerateScript: noop, onModelChange: noop, onImageModelChange: noop,
        onShotDurationChange: noop, onShotCountChange: noop, onComposerHeightChange: noop,
        onConnectStart: noop, onScrollTopChange: noop, onEditAssets: noop,
    };
    for (const locale of interfaceLocales) {
        await loadInterfaceLocale(locale);
        activeLocale = locale;
        const html = renderInLocale(<CanvasScriptNodeContent {...props} />, locale);
        expect(html).toContain(dialogue);
        expect(html).toContain("2.5");
        expect(html).toContain("保持用户原文");
        expect(html).not.toContain("canvasScriptUi");
        const t = interfaceTranslator(locale);
        expect(html).toContain(t("canvasScriptUi014"));
        if (locale === "fr-FR" || locale === "de-DE") {
            expect(html).not.toContain("台词 / 旁白");
            expect(html).not.toContain("镜头视频描述");
            expect(html).not.toContain("分镜与项目设定");
            expect(html).not.toContain("已关联");
            expect(html).not.toContain("Eingeben-Anschlusspunkt");
            expect(html).toContain(t("canvasScriptDyn014", { label: t("studioUi.input") }));
            expect(html).toContain(t("canvasScriptDyn014", { label: t("studioUi.output") }));
        }
        expect(node).toEqual(initial);
    }
});
