import { expect, mock, test } from "bun:test";
import { createRef, forwardRef } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { defaultModelCapabilityConfig } from "../src/lib/model-capabilities";
import { defaultConfig } from "../src/stores/use-config-store";
import { useUserStore } from "../src/stores/use-user-store";
import { interfaceLocales, interfaceTranslator, loadInterfaceLocale, type InterfaceLocale } from "../src/lib/interface-locale";
import { renderInLocale } from "./helpers/locale-render";

await loadInterfaceLocale("en-US");
let locale: InterfaceLocale = "en-US";

mock.module("@/stores/use-interface-locale-store", () => ({
    useInterfaceTranslation: () => ({ locale, t: interfaceTranslator(locale) }),
}));
useUserStore.setState({ features: { ...useUserStore.getState().features, creditsEnabled: false } });
mock.module("@/components/canvas/canvas-resource-mention-textarea", () => ({
    CanvasResourceMentionTextarea: forwardRef<HTMLTextAreaElement, Record<string, unknown>>(function MockMentionTextarea(props, ref) {
        return <textarea ref={ref} aria-label={props["aria-label"] as string} value={props.value as string} disabled={props.disabled as boolean} placeholder={props.placeholder as string} onChange={() => {}} />;
    }),
}));
mock.module("@/components/conversation/voice-recording-button", () => ({ VoiceRecordingButton: () => null }));
mock.module("@/components/model-picker", () => ({ ModelPicker: ({ placeholder }: { placeholder: string }) => <button data-testid="model-picker" aria-label={placeholder} /> }));
mock.module("@/components/creation-models-menu", () => ({ CreationModelsMenu: () => <div data-testid="agent-models" /> }));
mock.module("@/components/creation-skill-picker", () => ({ CreationSkillPicker: () => <button type="button">skill picker</button> }));
mock.module("@/components/ui/base/tooltip", () => ({ Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
mock.module("@/components/ui/aceternity/hover-border-gradient", () => ({ HoverBorderGradient: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
mock.module("@/components/ui/aceternity/spotlight-surface", () => ({ SpotlightSurface: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
mock.module("@/components/ai/working-indicator", () => ({ WorkingGlow: () => null }));
mock.module("@/components/image-size-picker", () => ({ ImageSizePicker: () => null }));
mock.module("@/constant/credits", () => ({ CreditSymbol: () => null, requestCreditCost: () => null }));
mock.module("motion/react", () => ({
    Reorder: { Group: ({ as: Tag = "ul", children, axis, values, onReorder, layoutScroll, ...props }: React.ComponentProps<"ul"> & { as?: React.ElementType; axis?: unknown; values?: unknown; onReorder?: unknown; layoutScroll?: boolean }) => <Tag {...props}>{children}</Tag>, Item: "li" },
    LayoutGroup: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    motion: { div: "div", span: "span" },
    useReducedMotion: () => false,
}));
mock.module("../src/pages/create/creation-workspace-messages", () => ({
    CreationAttachmentThumbnail: () => null,
    CreationMediaPreviewModal: () => null,
    CreationMessageView: () => null,
    formatMessageTime: () => "",
}));

const { CreationComposer, partitionReferenceImageDropFiles } = await import("../src/pages/create/creation-workspace");

const noOp = () => {};
const profile = defaultModelCapabilityConfig();
const composerProps: Parameters<typeof CreationComposer>[0] = {
    variant: "thread",
    mode: "text",
    prompt: "请帮我完成这段创作",
    setPrompt: noOp,
    busy: false,
    generationActive: false,
    referenceReplacementBusy: false,
    attachments: [],
    maxReferences: 5,
    references: [],
    onRemoveAttachment: noOp,
    onClearAttachments: noOp,
    onClearComposer: noOp,
    onReorderAttachments: noOp,
    onReplaceAttachment: noOp,
    onReplaceReferenceFiles: noOp,
    onOpenLibrary: noOp,
    onModeChange: noOp,
    model: defaultConfig.textModel,
    modelRequirements: { capability: "text" },
    videoProfile: profile.video!,
    imageProfile: profile.image!,
    config: defaultConfig,
    onModelChange: noOp,
    ratio: "1:1",
    setRatio: noOp,
    seconds: "5",
    setSeconds: noOp,
    quality: "standard",
    setQuality: noOp,
    imageResolution: "auto",
    setImageResolution: noOp,
    setImageParameters: noOp,
    setTransparentBackground: noOp,
    videoQuality: "720",
    setVideoQuality: noOp,
    count: "1",
    setCount: noOp,
    textStreaming: false,
    setTextStreaming: noOp,
    textThinkingLevels: [],
    textThinkingLevel: "",
    textThinkingRequest: "auto",
    setTextThinkingLevel: noOp,
    promptOptimizerProvider: null,
    composerFocusRef: createRef<HTMLTextAreaElement>(),
    onPromptFocus: noOp,
    onSubmit: noOp,
    onSelectSkill: async () => {},
    skillPickerOpen: false,
    onSkillPickerOpenChange: noOp,
    uploading: false,
    uploadFailures: [],
    inputIssues: ["这个文件暂时不能作为参考内容使用"],
    submissionBlocked: true,
    onAddFiles: noOp,
    onRetryUploads: noOp,
    onDismissUploadFailure: noOp,
    fileInputRef: createRef<HTMLInputElement>(),
    onFileChange: noOp,
};

test("visible input issues block submitting even when the prompt is non-empty", () => {
    const html = renderToStaticMarkup(<CreationComposer {...composerProps} />);

    expect(html).toContain("这个文件暂时不能作为参考内容使用");
    const submit = html.match(/<button[^>]*class="[^"]*creation-submit[^"]*"[^>]*>/)?.[0] || "";
    expect(submit).toContain('disabled=""');
});

test("upload controls, retry state, model selection and skills remain available in the composer", () => {
    const file = new File(["image"], "reference.png", { type: "image/png" });
    const html = renderToStaticMarkup(<CreationComposer {...composerProps} uploadFailures={[{ file, error: "network error" }]} />);

    expect(html).toContain('type="file"');
    expect(html).toContain("reference.png：network error");
    expect(html).toContain("Retry failed attachments");
    expect(html).toContain("data-testid=\"model-picker\"");
    expect(html).toContain("skill picker");
});

test("busy labels distinguish attachment work, reference replacement, generation, and other processing", () => {
    const cases = [
        {
            state: { uploading: true },
            submitLabel: "Processing attachments",
            referenceLabel: "Processing attachments; references cannot be added yet",
        },
        {
            state: { referenceReplacementBusy: true },
            submitLabel: "Replacing reference image",
            referenceLabel: "Replacing reference image",
        },
        {
            state: { busy: true, generationActive: true, prompt: "", inputIssues: [], submissionBlocked: false },
            submitLabel: "Generating",
            referenceLabel: "References cannot be added while generating",
        },
        {
            state: { busy: true },
            submitLabel: "Processing",
            referenceLabel: "Processing; references cannot be added yet",
        },
    ];

    for (const { state, submitLabel, referenceLabel } of cases) {
        const html = renderToStaticMarkup(<CreationComposer {...composerProps} inputIssues={[]} submissionBlocked={false} {...state} />);
        expect(html).toContain(`aria-label="${submitLabel}"`);
        expect(html).toContain(`aria-label="${referenceLabel}"`);
        expect(html).toContain(`>${submitLabel}</span></span>`);
    }
});

test("image-reference drops replace one image and keep every remaining file for attachment", () => {
    const image = new File(["image"], "reference.png", { type: "image/png" });
    const secondImage = new File(["second image"], "extra.png", { type: "image/png" });
    const document = new File(["doc"], "notes.pdf", { type: "application/pdf" });
    const references = [{ id: "image-ref", kind: "image", attachmentId: "attachment-1", active: true, label: "Frame" }];

    expect(partitionReferenceImageDropFiles([image], "image-ref", references)).toEqual({ replacementFile: image, attachmentFiles: [] });
    expect(partitionReferenceImageDropFiles([image, document, secondImage], "image-ref", references)).toEqual({ replacementFile: image, attachmentFiles: [document, secondImage] });
    expect(partitionReferenceImageDropFiles([image], undefined, references)).toBeUndefined();
    expect(partitionReferenceImageDropFiles([document], "image-ref", references)).toBeUndefined();
});

for (const nextLocale of interfaceLocales) {
    test(`${nextLocale}: actual creation controls localize every mode and keep user content`, async () => {
        await loadInterfaceLocale(nextLocale);
        locale = nextLocale;
        try {
            const t = interfaceTranslator(nextLocale);
            for (const mode of ["text", "image", "video"] as const) {
                const html = renderInLocale(<CreationComposer {...composerProps} mode={mode} inputIssues={[]} submissionBlocked={false} prompt="用户原始提示词 {count}" />, nextLocale);
                expect(html).toContain("用户原始提示词 {count}");
                expect(html).toContain(`aria-label="${t("composerPromptLabel")}"`);
                expect(html).toContain(`aria-label="${t("composerSend")}"`);
                expect(html).toContain(t("composerClearShort"));
                expect(html).toContain(t("composerSelectModel", { mode: t(mode === "text" ? "composerModeText" : mode === "image" ? "composerModeImage" : "composerModeVideo") }));
                expect(html).toContain(t("composerStart"));
                if (["en-US", "ko-KR", "es-ES", "pt-BR", "fr-FR", "de-DE"].includes(nextLocale)) {
                    expect(html.replace(/<textarea\b[^>]*>[\s\S]*?<\/textarea>/g, "")).not.toMatch(/[\u3400-\u9fff]/);
                }
            }
        } finally { locale = "en-US"; }
    });
}
