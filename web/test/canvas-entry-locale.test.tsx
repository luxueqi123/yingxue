import { loadInterfaceLocale as preloadInterfaceLocale } from "../src/lib/interface-locale";
await preloadInterfaceLocale("en-US");

import { expect, mock, test } from "bun:test";
import { renderInLocale } from "./helpers/locale-render";
import { interfaceTranslator, type InterfaceLocale } from "../src/lib/interface-locale";
import { CanvasNodeType, type CanvasNodeData } from "../src/types/canvas";

let locale: InterfaceLocale = "en-US";
const renderToStaticMarkup = (node: React.ReactNode) => renderInLocale(node, locale);
mock.module("../src/stores/use-interface-locale-store", () => ({
    useInterfaceTranslation: () => ({ locale, t: interfaceTranslator(locale) }),
}));
let role = "user";
let models: unknown[] = [];
mock.module("../src/stores/use-user-store", () => ({
    useUserStore: (select: (s: unknown) => unknown) => select({ hydrated: true, user: { role } }),
}));
mock.module("../src/stores/use-config-store", () => ({
    useConfigStore: (select: (s: unknown) => unknown) => select({ config: { models } }),
}));
const { CanvasShortDramaEmptyState, CanvasLinkedProjectEmptyState, CanvasStoryInputNodeContent, CanvasShortDramaGuide, CanvasFreeformEmptyState, CanvasStylePlaceholderNodeContent } = await import("../src/components/canvas/canvas-short-drama-entry");
const { ModelSetupGuide } = await import("../src/components/layout/model-setup-guide");
const noAction = () => { throw new Error("Rendering must not execute an action"); };

test("empty canvas actions render in all ten languages", async () => {
    const labels = {
        "zh-CN": "自己创作", "zh-HK": "自己創作", "zh-TW": "自行創作", "en-US": "Create yourself",
        "ja-JP": "自分で制作", "ko-KR": "직접 제작", "es-ES": "Crear por tu cuenta", "pt-BR": "Criar por conta própria",
        "fr-FR": "Créer soi-même", "de-DE": "Selbst erstellen",
    } satisfies Record<InterfaceLocale, string>;
    for (const language of Object.keys(labels) as InterfaceLocale[]) {
        await preloadInterfaceLocale(language);
        locale = language;
        const html = renderToStaticMarkup(<CanvasShortDramaEmptyState onCreatePipeline={noAction} onSubmitPrompt={noAction}
            onStartFreeform={noAction} onUpload={noAction} onAddText={noAction} onAddScript={noAction} />);
        expect(html).toContain(labels[language]);
        expect(html).not.toContain("canvasEntry.");
    }
});

test("empty canvas switches visible actions without executing or replacing content", () => {
    for (const language of ["en-US", "zh-CN"] as const) {
        locale = language;
        const html = renderToStaticMarkup(<CanvasShortDramaEmptyState onCreatePipeline={noAction} onSubmitPrompt={noAction}
            onStartFreeform={noAction} onUpload={noAction} onAddText={noAction} onAddScript={noAction} />);
        for (const text of language === "en-US" ? ["Turn ideas", "into films.", "Create with Agent", "Create yourself", "New text", "Blank storyboard"]
            : ["让灵感，", "开始成片。", "交给 Agent", "自己创作", "新建文本", "空白分镜"]) expect(html).toContain(text);
        expect(html).not.toContain(language === "en-US" ? "交给 Agent" : "Create with Agent");
    }
});

test("linked project and story retain author text while translating controls", () => {
    locale = "en-US";
    const html = renderToStaticMarkup(<CanvasLinkedProjectEmptyState projectName="原项目 {name}" hasChapter={false}
        onAddFirstChapter={noAction} onOpenAssets={noAction} onAddText={noAction} />);
    expect(html).toContain("原项目 {name}");
    expect(html).toContain("Add first chapter");
    expect(html).toContain('disabled=""');
    const node = { metadata: { content: "原故事 {name}" } } as CanvasNodeData;
    const story = renderToStaticMarkup(<CanvasStoryInputNodeContent node={node} onEdit={noAction} />);
    expect(story).toContain("原故事 {name}");
    expect(story).toContain("Edit story");
    expect(node.metadata?.content).toBe("原故事 {name}");
});

test("short drama guide translates stable step IDs without mutating progress", () => {
    locale = "en-US";
    const progress = { active: true, completed: false, completedCount: 0,
        steps: [{ id: "story" as const, label: "输入故事", status: "current" as const }] };
    const html = renderToStaticMarkup(<CanvasShortDramaGuide progress={progress} collapsed={false}
        onToggle={noAction} onSkip={noAction} onStepClick={noAction} />);
    expect(html).toContain("Enter story");
    expect(html).toContain('aria-current="step"');
    expect(html).toContain("Skip guide");
    expect(progress.steps[0].label).toBe("输入故事");
});

test("model setup guide translates labels and retains visibility boundaries", () => {
    locale = "en-US";
    role = "user"; models = [];
    const html = renderToStaticMarkup(<ModelSetupGuide />);
    expect(html).toContain("Choose your creation models first");
    expect(html).toContain("Prices are shown when you choose");
    expect(html).toContain('aria-label="Close model setup guide"');
    expect(renderToStaticMarkup(<ModelSetupGuide hidden />)).toBe("");
    role = "admin";
    expect(renderToStaticMarkup(<ModelSetupGuide />)).toBe("");
    role = "user"; models = [{}];
    expect(renderToStaticMarkup(<ModelSetupGuide />)).toBe("");
    models = []; locale = "zh-CN";
    expect(renderToStaticMarkup(<ModelSetupGuide />)).toContain("先选择创作模型");
});

test("freeform headings and style placeholder translate without changing author command labels", () => {
    locale = "en-US";
    const command = { id: CanvasNodeType.Text, label: "原命令 {name}", section: "node" as const, icon: null, onClick: noAction };
    const freeform = renderToStaticMarkup(<CanvasFreeformEmptyState commands={[command]} />);
    expect(freeform).toContain("原命令 {name}");
    expect(command.label).toBe("原命令 {name}");
    expect(freeform).toContain('aria-label="Creative starting points"');
    expect(freeform).toContain('aria-label="More creative tools"');
    expect(freeform).toContain('aria-expanded="false"');
    const style = renderToStaticMarkup(<CanvasStylePlaceholderNodeContent onChoose={noAction} />);
    expect(style).toContain("Project visual style");
    expect(style).toContain("Not selected");
    expect(style).toContain("Choose visual style");
    locale = "zh-CN";
    expect(renderToStaticMarkup(<CanvasStylePlaceholderNodeContent onChoose={noAction} />)).toContain("选择画风");
});
