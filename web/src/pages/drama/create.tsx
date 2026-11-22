import { useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { App, Button, Input, InputNumber, Select } from "antd";
import { AlertTriangle, ArrowLeft, BookOpenText, ClipboardPaste, FileUp, Save, Sparkles, Wand2 } from "lucide-react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router";

import { WorkspacePage } from "@/components/layout/workspace-page";
import { DEFAULT_DRAMA_STYLE_ID, findDramaStyle } from "@/lib/drama/drama-styles";
import { decodeNovelText } from "@/lib/canvas/canvas-document";
import { analyzeNovel, EPISODE_SOURCE_CHARS, sourceChars, titleFromFileName } from "@/lib/drama/novel-parse";
import { ApiError } from "@/services/api/request";
import { dramaChoiceKey } from "@/lib/drama/model-choice";
import { DEFAULT_STORYBOARD } from "@/lib/drama/storyboard";
import { useInterfaceTranslation } from "@/stores/use-interface-locale-store";
import {
    createDrama,
    estimateDrama,
    type DramaAssetSettings,
    type DramaCapability,
    type DramaEpisodeMode,
    type DramaMediaMode,
    type DramaModels,
    type DramaReviewMode,
    type DramaSkillRef,
    type DramaSourceFormat,
    type DramaStoryboardSettings,
} from "@/services/api/drama";

import { formatCount, formatCredits, SOURCE_FORMAT_LABEL, SOURCE_FORMAT_MESSAGE_KEYS, SourceFormatPicker } from "./drama-shared";
import { AssetSchemePicker, defaultAssetSettings, useAssetSchemes } from "./asset-scheme";
import { DramaModelPicker, useDramaModelCatalog } from "./drama-model-picker";
import { PromptSkillField } from "./prompt-skill";
import { EpisodeDurationInput, StoryboardRules } from "./storyboard-rules";
import { DramaStylePicker } from "./style-picker";
import "./drama.css";

const MAX_FILE_BYTES = 40 * 1024 * 1024;
const RATIOS = [
    { value: "9:16", labelKey: "drama.create.portraitRatio", w: 9, h: 16 },
    { value: "16:9", labelKey: "drama.create.landscapeRatio", w: 16, h: 9 },
    { value: "1:1", labelKey: "drama.create.squareRatio", w: 12, h: 12 },
] as const;
const LANGUAGE_OPTIONS = [
    { value: "中文普通话", labelKey: "drama.create.dialogueLanguageMandarin" },
    { value: "粤语", labelKey: "drama.create.dialogueLanguageCantonese" },
    { value: "英语", labelKey: "drama.create.dialogueLanguageEnglish" },
    { value: "日语", labelKey: "drama.create.dialogueLanguageJapanese" },
] as const;
const REVIEW_MODES = [
    { value: "sample", titleKey: "drama.create.reviewSampleTitle", detailKey: "drama.create.reviewSampleDetail" },
    { value: "every", titleKey: "drama.create.reviewEveryTitle", detailKey: "drama.create.reviewEveryDetail" },
    { value: "auto", titleKey: "drama.create.reviewAutoTitle", detailKey: "drama.create.reviewAutoDetail" },
] as const satisfies readonly { value: DramaReviewMode; titleKey: string; detailKey: string }[];
const CAPABILITY_LABEL_KEYS = {
    text: "drama.create.capabilityText",
    image: "drama.create.capabilityImage",
    video: "drama.create.capabilityVideo",
} as const satisfies Record<DramaCapability, string>;
const MEDIA_MODE_MESSAGE_KEYS = {
    manual: { title: "drama.create.mediaManualTitle", detail: "drama.create.mediaManualDetail" },
    auto: { title: "drama.create.mediaAutoTitle", detail: "drama.create.mediaAutoDetail" },
} as const satisfies Record<DramaMediaMode, { title: string; detail: string }>;
const EPISODE_MODES = [
    { value: "chapter", titleKey: "drama.create.chapterEpisodeModeTitle", detailKey: "drama.create.chapterEpisodeModeDetail" },
    { value: "auto", titleKey: "drama.create.autoEpisodeModeTitle", detailKey: "drama.create.autoEpisodeModeDetail" },
] as const satisfies readonly { value: DramaEpisodeMode; titleKey: string; detailKey: string }[];

export default function DramaCreatePage() {
    const { t } = useInterfaceTranslation();
    const navigate = useNavigate();
    const { message } = App.useApp();
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [dragOver, setDragOver] = useState(false);
    const location = useLocation();
    const [searchParams] = useSearchParams();
    const [pasteMode, setPasteMode] = useState(searchParams.get("paste") === "1");
    const [pasteText, setPasteText] = useState("");
    const [sourceText, setSourceText] = useState("");
    const [sourceFormat, setSourceFormat] = useState<DramaSourceFormat>("novel");
    // 默认逐集：一次只让流水线处理一集，长篇整本导入容易让改编任务超时。
    const [chapterMode, setChapterMode] = useState<DramaEpisodeMode>("chapter");
    const episodeMode: DramaEpisodeMode = sourceFormat === "novel" ? chapterMode : "chapter";
    const perEpisode = episodeMode === "chapter";
    const analysis = useMemo(() => (sourceText ? analyzeNovel(sourceText, { perEpisode }) : null), [perEpisode, sourceText]);
    const [name, setName] = useState("");
    const [aspectRatio, setAspectRatio] = useState("9:16");
    const [episodeSeconds, setEpisodeSeconds] = useState(90);
    const [styleId, setStyleId] = useState(DEFAULT_DRAMA_STYLE_ID);
    const [language, setLanguage] = useState(LANGUAGE_OPTIONS[0].value);
    const [reviewMode, setReviewMode] = useState<DramaReviewMode>("sample");
    // 默认先只跑文本：先看剧情、镜头、设定和段提示词对不对，再决定花钱生成参考图与视频。
    const [mediaMode, setMediaMode] = useState<DramaMediaMode>("manual");
    const [storyboard, setStoryboard] = useState<DramaStoryboardSettings>(DEFAULT_STORYBOARD);
    const [promptSkill, setPromptSkill] = useState<DramaSkillRef>();
    const [models, setModels] = useState<Partial<DramaModels>>({});
    const [budgetCredits, setBudgetCredits] = useState<number | null>(null);
    const assetCatalog = useAssetSchemes();
    const [assetDraft, setAssetDraft] = useState<DramaAssetSettings>();
    const assets = assetDraft || defaultAssetSettings(assetCatalog.data);
    const [previewIndex, setPreviewIndex] = useState(0);

    const style = findDramaStyle(styleId);
    const sourceFormatMessages = SOURCE_FORMAT_MESSAGE_KEYS[sourceFormat];
    const capabilityLabel = (capability: DramaCapability) => t(CAPABILITY_LABEL_KEYS[capability]);
    const catalogQuery = useDramaModelCatalog();
    const resolvedModels = useMemo<DramaModels | undefined>(() => {
        const defaults = catalogQuery.data?.defaults;
        if (!defaults) return undefined;
        return { text: models.text || defaults.text, image: models.image || defaults.image, video: models.video || defaults.video };
    }, [catalogQuery.data, models]);
    const videoOption = catalogQuery.data?.options.video?.find((option) => dramaChoiceKey(option.choice) === dramaChoiceKey(resolvedModels?.video));
    const missingCapabilities = (Object.keys(CAPABILITY_LABEL_KEYS) as DramaCapability[]).filter((capability) => catalogQuery.data && !dramaChoiceKey(resolvedModels?.[capability]));
    const settings = {
        aspectRatio,
        episodeSeconds,
        stylePrompt: style?.prompt || "",
        styleName: style?.name || "",
        language,
        reviewMode,
        mediaMode,
        storyboard,
        ...(promptSkill ? { promptSkill } : {}),
        concurrency: 4,
        models: resolvedModels,
        ...(assets ? { assets } : {}),
    };
    const estimateQuery = useQuery({
        queryKey: ["drama-estimate", analysis?.chapters.length, analysis?.words, episodeMode, episodeSeconds, JSON.stringify(storyboard), dramaChoiceKey(resolvedModels?.text), dramaChoiceKey(resolvedModels?.image), dramaChoiceKey(resolvedModels?.video)],
        queryFn: ({ signal }) => estimateDrama({ chapterCount: analysis!.chapters.length, wordCount: analysis!.words, settings, episodeMode }, signal),
        enabled: Boolean(analysis && resolvedModels),
        staleTime: 30_000,
    });
    const estimate = estimateQuery.data;
    useEffect(() => {
        if (estimate && budgetCredits === null && estimate.maxMicrocredits > 0) setBudgetCredits(Math.ceil(estimate.maxMicrocredits / 1_000_000));
    }, [estimate, budgetCredits]);

    const loadText = (text: string, fileName?: string) => {
        const result = analyzeNovel(text, { perEpisode });
        if (!result.chapters.length) {
            message.error(t("drama.create.noBodyText"));
            return;
        }
        setSourceText(text);
        setBudgetCredits(null);
        if (fileName && !name) setName(titleFromFileName(fileName));
        if (!fileName && !name) setName(result.chapters[0]?.title.slice(0, 20) || "未命名短剧");
    };
    const loadFile = async (file: File) => {
        if (!/\.(txt|md|markdown)$/i.test(file.name)) {
            message.warning(t("drama.create.unsupportedFileType"));
            return;
        }
        if (file.size > MAX_FILE_BYTES) {
            message.warning(t("drama.create.fileTooLarge"));
            return;
        }
        loadText(decodeNovelText(await file.arrayBuffer()), file.name);
    };
    const handedFile = (location.state as { file?: File } | null)?.file;
    const handedRef = useRef(false);
    useEffect(() => {
        if (!handedFile || handedRef.current) return;
        handedRef.current = true;
        void loadFile(handedFile);
        // 文件只用于首次进入，清掉路由状态避免刷新或返回时重复解析。
        navigate(".", { replace: true, state: null });
    }, [handedFile]); // eslint-disable-line react-hooks/exhaustive-deps
    const onDrop = (event: DragEvent<HTMLDivElement>) => {
        event.preventDefault();
        setDragOver(false);
        const file = event.dataTransfer.files?.[0];
        if (file) void loadFile(file);
    };

    const create = useMutation({
        mutationFn: (start: boolean) =>
            createDrama({
                name: name.trim(),
                chapters: analysis!.chapters.map((chapter) => ({ title: chapter.title, text: chapter.text })),
                settings: { ...settings, models: resolvedModels },
                budgetMicrocredits: Math.max(0, Math.round((budgetCredits || 0) * 1_000_000)),
                start,
                sourceFormat,
                episodeMode,
            }),
        onSuccess: (summary) => navigate(`/dramas/${summary.project.id}`, { replace: true }),
        onError: (error) => message.error(error instanceof ApiError || error instanceof Error ? error.message : t("drama.create.createFailed")),
    });
    const tooLong = Boolean(analysis?.issues.some((issue) => issue.kind === "too_long"));
    const canSaveDraft = Boolean(analysis?.chapters.length && name.trim() && !tooLong && !create.isPending);
    const canStart = Boolean(canSaveDraft && resolvedModels && assets && !catalogQuery.isError && !assetCatalog.isError && missingCapabilities.length === 0);
    const unitLabel = perEpisode ? t("drama.create.episodeCountUnit") : t("drama.create.chapterCountLabel");

    const previewChapter = analysis?.chapters[previewIndex];
    const reset = () => {
        setSourceText("");
        setPasteText("");
        setName("");
        setPreviewIndex(0);
    };

    if (!analysis) {
        return (
            <WorkspacePage fluid scroll={false}>
                <div className="drama-root drama-compose-empty">
                    <header className="drama-compose-head">
                        <Link to="/projects">
                            <Button type="text" shape="circle" icon={<ArrowLeft className="size-4" />} aria-label={t("drama.create.backToProjects")} />
                        </Link>
                        <h1>{t("drama.create.title")}</h1>
                    </header>
                    <div className="drama-compose-formats">
                        <SourceFormatPicker value={sourceFormat} onChange={setSourceFormat} row />
                    </div>
                    <div
                        className={`drama-drop ${dragOver ? "is-over" : ""}`}
                        onDragOver={(event) => {
                            event.preventDefault();
                            setDragOver(true);
                        }}
                        onDragLeave={() => setDragOver(false)}
                        onDrop={onDrop}
                    >
                        {pasteMode ? (
                            <div className="grid w-full max-w-[860px] gap-3">
                                <Input.TextArea
                                    autoFocus
                                    value={pasteText}
                                    onChange={(event) => setPasteText(event.target.value)}
                                    placeholder={`${t(SOURCE_FORMAT_LABEL[sourceFormat].placeholder)}\n\n${t(sourceFormat === "novel" ? "drama.create.pastePlaceholderNovel" : "drama.create.pastePlaceholderScript")}`}
                                    autoSize={{ minRows: 14, maxRows: 24 }}
                                />
                                <div className="flex justify-end gap-2">
                                    <Button onClick={() => setPasteMode(false)}>{t("drama.common.cancel")}</Button>
                                    <Button type="primary" disabled={!pasteText.trim()} onClick={() => loadText(pasteText)}>
                                        {t("drama.create.parseSource")}
                                    </Button>
                                </div>
                            </div>
                        ) : (
                            <>
                                <span className="drama-drop-icon">
                                    <BookOpenText className="size-7" />
                                </span>
                                <h2>{t("drama.create.dropTitle", { format: t(sourceFormatMessages.title) })}</h2>
                                <p>
                                    {t(sourceFormat === "novel" ? "drama.create.dropDescriptionNovel" : "drama.create.dropDescriptionScript")}
                                </p>
                                <Button type="primary" size="large" icon={<FileUp className="size-4" />} onClick={() => fileInputRef.current?.click()}>
                                    {t("drama.create.chooseSourceFile", { format: t(sourceFormatMessages.title) })}
                                </Button>
                                <button type="button" className="drama-link inline-flex items-center gap-1" onClick={() => setPasteMode(true)}>
                                    <ClipboardPaste className="size-3.5" />
                                    {t("drama.create.pasteLink")}
                                </button>
                                <div className="drama-drop-steps">
                                    {([
                                        sourceFormat === "storyboard" ? "drama.create.stepImportStoryboard" : "drama.create.stepParseEpisodes",
                                        "drama.create.stepBuildAssets",
                                        sourceFormat === "novel" ? "drama.create.stepAdaptPrompts" : "drama.create.stepBreakShots",
                                        "drama.create.stepGenerateVideos",
                                        "drama.create.stepAssembleFinal",
                                    ] as const).map((step, index) => (
                                        <span key={step}>
                                            <b>{index + 1}</b>
                                            {t(step)}
                                        </span>
                                    ))}
                                </div>
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    accept=".txt,.md,.markdown,text/plain,text/markdown"
                                    className="hidden"
                                    onChange={(event) => {
                                        const file = event.target.files?.[0];
                                        if (file) void loadFile(file);
                                        event.target.value = "";
                                    }}
                                />
                            </>
                        )}
                    </div>
                </div>
            </WorkspacePage>
        );
    }

    return (
        <WorkspacePage fluid scroll={false}>
            <div className="drama-root drama-compose">
                {/* 左：小说目录 */}
                <aside className="drama-compose-novel">
                    <header className="drama-compose-head">
                        <Link to="/projects">
                            <Button type="text" shape="circle" icon={<ArrowLeft className="size-4" />} aria-label={t("drama.create.backToProjects")} />
                        </Link>
                        <h1>{t("drama.create.title")}</h1>
                        <Button size="small" type="text" className="!ml-auto" onClick={reset}>
                            {t("drama.create.changeMaterials")}
                        </Button>
                    </header>
                    <div className="drama-stats">
                        <div className="drama-stat">
                            <div className="drama-stat-value">{formatCount(analysis.chapters.length)}</div>
                            <div className="drama-stat-label">{perEpisode ? t("drama.create.sourceSegmentsLabel") : t("drama.create.chapterCountLabel")}</div>
                        </div>
                        <div className="drama-stat">
                            <div className="drama-stat-value">{formatCount(analysis.words)}</div>
                            <div className="drama-stat-label">{t("drama.create.characterCountUnit")}</div>
                        </div>
                        <div className="drama-stat">
                            <div className="drama-stat-value">{estimate ? `≈${estimate.episodes}` : "—"}</div>
                            <div className="drama-stat-label">{t("drama.create.episodeCountUnit")}</div>
                        </div>
                    </div>
                    {analysis.issues.length ? (
                        <div className="drama-issues">
                            {analysis.issues.map((issue) => (
                                <div key={issue.kind} className="drama-issue">
                                    <AlertTriangle className="size-3.5" />
                                    {issue.message}
                                </div>
                            ))}
                        </div>
                    ) : null}
                    <div className="drama-chapter-list thin-scrollbar" role="listbox" aria-label={t("drama.create.chapterCountLabel")}>
                        {analysis.chapters.slice(0, 600).map((chapter, index) => (
                            <button
                                key={`${index}-${chapter.title}`}
                                type="button"
                                role="option"
                                aria-selected={index === previewIndex}
                                className={`drama-chapter-row ${(perEpisode ? sourceChars(chapter.text) > EPISODE_SOURCE_CHARS : chapter.words < 200) ? "is-warn" : ""}`}
                                onClick={() => setPreviewIndex(index)}
                            >
                                <span className="is-num">{String(index + 1).padStart(3, "0")}</span>
                                <span className="truncate text-left">{chapter.title}</span>
                                <span className="is-count">{formatCount(chapter.words)}</span>
                            </button>
                        ))}
                        {analysis.chapters.length > 600 ? (
                            <div className="px-4 py-3 text-center text-[var(--fs-tiny)] text-foreground/40">
                                {t("drama.create.moreItems", { count: analysis.chapters.length - 600, unit: unitLabel })}
                            </div>
                        ) : null}
                    </div>
                </aside>

                {/* 中：风格与审阅，下方原文预览 */}
                <main className="drama-compose-main thin-scrollbar">
                    <section>
                        <div className="drama-section-title">
                            <h2>{t("drama.create.materialsAndEpisodes")}</h2>
                            <span>{t(sourceFormat === "novel" ? "drama.create.novelDialoguePreserved" : "drama.create.scriptEpisodeRule")}</span>
                        </div>
                        <div className="grid gap-3">
                            <SourceFormatPicker value={sourceFormat} onChange={setSourceFormat} row />
                            {sourceFormat === "novel" ? (
                                <div className="drama-media-modes is-row is-two" role="radiogroup" aria-label={t("drama.create.episodeModeLabel")}>
                                    {EPISODE_MODES.map((mode) => (
                                        <button key={mode.value} type="button" role="radio" aria-checked={chapterMode === mode.value} className="drama-media-mode" onClick={() => setChapterMode(mode.value)}>
                                            <span className="drama-radio" />
                                            <span>
                                                <strong>
                                                    {t(mode.titleKey)}
                                                    {mode.value === "chapter" ? <em>{t("drama.create.recommended")}</em> : null}
                                                </strong>
                                                <span>{t(mode.detailKey)}</span>
                                            </span>
                                        </button>
                                    ))}
                                </div>
                            ) : null}
                        </div>
                    </section>
                    <DramaStylePicker value={styleId} onChange={setStyleId} />
                    <section>
                        <div className="drama-section-title">
                            <h2>{t("assetScheme.characterSchemeGroupLabel")}</h2>
                            <span>{t("drama.create.referenceImageHelp")}</span>
                        </div>
                        <AssetSchemePicker value={assets} onChange={setAssetDraft} sample={{ style: style?.prompt || "", characterName: t("drama.create.sampleCharacter"), sceneName: t("drama.create.sampleScene") }} layout="compact" />
                    </section>
                    <section>
                        <div className="drama-section-title">
                            <h2>{t("drama.create.storyboardRulesTitle")}</h2>
                            <span>{t("drama.create.storyboardRulesDescription")}</span>
                        </div>
                        <StoryboardRules value={storyboard} onChange={setStoryboard} episodeSeconds={episodeSeconds} maxVideoSeconds={videoOption?.maxVideoSeconds} videoModelLabel={resolvedModels?.video?.label} />
                    </section>
                    <section>
                        <div className="drama-section-title">
                            <h2>{t("drama.create.promptSkillTitle")}</h2>
                            <span>{t("drama.create.promptSkillDescription")}</span>
                        </div>
                        <PromptSkillField value={promptSkill} onChange={setPromptSkill} />
                    </section>
                    <section>
                        <div className="drama-section-title">
                            <h2>{t("drama.create.reviewModeLabel")}</h2>
                            <span>{t("drama.create.reviewModeSummary")}</span>
                        </div>
                        <div className="drama-review-modes" role="radiogroup" aria-label={t("drama.create.reviewModeLabel")}>
                            {REVIEW_MODES.map((mode) => (
                                <button key={mode.value} type="button" role="radio" aria-checked={reviewMode === mode.value} className="drama-review-mode" onClick={() => setReviewMode(mode.value)}>
                                    <span className="drama-radio" />
                                    <span>
                                        <strong>{t(mode.titleKey)}</strong>
                                        <span>{t(mode.detailKey)}</span>
                                    </span>
                                </button>
                            ))}
                        </div>
                    </section>
                    {previewChapter ? (
                        <section className="drama-compose-preview">
                            <div className="drama-section-title">
                                <h2>{previewChapter.title}</h2>
                                <span>{t("drama.create.sourcePreview", { count: formatCount(previewChapter.words) })}</span>
                            </div>
                            <div className="drama-compose-text thin-scrollbar">
                                {previewChapter.text.slice(0, 6000)}
                                {previewChapter.text.length > 6000 ? "……" : ""}
                            </div>
                        </section>
                    ) : null}
                </main>

                {/* 右：作品设置与启动 */}
                <aside className="drama-compose-side">
                    <div className="drama-compose-side-scroll thin-scrollbar">
                        <label className="block">
                            <div className="drama-option-label">{t("drama.create.projectName")}</div>
                            <Input size="large" value={name} maxLength={80} onChange={(event) => setName(event.target.value)} placeholder={t("drama.create.projectName")} />
                        </label>
                        <div>
                            <div className="drama-option-label">{t("drama.create.aspectRatioLabel")}</div>
                            <div className="drama-ratio-group" role="group" aria-label={t("drama.create.aspectRatioLabel")}>
                                {RATIOS.map((ratio) => (
                                    <button key={ratio.value} type="button" className="drama-ratio" aria-pressed={aspectRatio === ratio.value} onClick={() => setAspectRatio(ratio.value)}>
                                        <span className="drama-ratio-shape" style={{ width: ratio.w, height: ratio.h }} />
                                        {t(ratio.labelKey)}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div className="block">
                                <div className="drama-option-label">{t("drama.create.singleEpisodeDuration")}</div>
                                <EpisodeDurationInput value={episodeSeconds} onChange={setEpisodeSeconds} />
                            </div>
                            <label className="block">
                                <div className="drama-option-label">{t("drama.create.dialogueLanguageLabel")}</div>
                                <Select className="w-full" value={language} onChange={setLanguage} options={LANGUAGE_OPTIONS.map(({ value, labelKey }) => ({ value, label: t(labelKey) }))} />
                            </label>
                        </div>
                        <div>
                            <div className="drama-option-label">{t("drama.create.productionPaceLabel")}</div>
                            <div className="drama-media-modes" role="radiogroup" aria-label={t("drama.create.productionPaceLabel")}>
                                {(Object.keys(MEDIA_MODE_MESSAGE_KEYS) as DramaMediaMode[]).map((mode) => (
                                    <button key={mode} type="button" role="radio" aria-checked={mediaMode === mode} className="drama-media-mode" onClick={() => setMediaMode(mode)}>
                                        <span className="drama-radio" />
                                        <span>
                                            <strong>
                                                {t(MEDIA_MODE_MESSAGE_KEYS[mode].title)}
                                                {mode === "manual" ? <em>{t("drama.create.recommended")}</em> : null}
                                            </strong>
                                            <span>{t(MEDIA_MODE_MESSAGE_KEYS[mode].detail)}</span>
                                        </span>
                                    </button>
                                ))}
                            </div>
                        </div>
                        <section className="drama-compose-models" aria-label={t("drama.create.modelSectionTitle")}>
                            <div className="drama-compose-models-head">
                                <Wand2 className="size-4 text-[var(--workspace-accent)]" />
                                <strong>{t("drama.create.modelSectionTitle")}</strong>
                                <span>{catalogQuery.isLoading ? t("drama.create.modelLoading") : catalogQuery.isError ? t("drama.create.modelCatalogFailed") : missingCapabilities.length ? t("drama.create.modelMissingSelection") : t("drama.create.modelAutoSelected")}</span>
                            </div>
                            {catalogQuery.isError ? <div role="alert" className="flex items-center justify-between gap-2 text-[var(--status-error)]"><span>{t("drama.create.modelReadFailed")}</span><Button size="small" onClick={() => void catalogQuery.refetch()}>{t("assetScheme.retry")}</Button></div> : null}
                            {(Object.keys(CAPABILITY_LABEL_KEYS) as DramaCapability[]).map((capability) => (
                                <div key={capability} className="drama-compose-model-row">
                                    <span>{capabilityLabel(capability)}</span>
                                    <DramaModelPicker
                                        capability={capability}
                                        size="sm"
                                        showPrice={false}
                                        value={resolvedModels?.[capability]}
                                        placeholder={t("workbenchUi.chooseModel", { kind: capabilityLabel(capability) })}
                                        onChange={(choice) => setModels((current) => ({ ...current, [capability]: choice }))}
                                    />
                                </div>
                            ))}
                        </section>
                        <div className="drama-field">
                            <div className="drama-field-label">
                                <span>{t("drama.create.budgetLimit")}</span>
                                <small>{t("drama.create.budgetHelp")}</small>
                            </div>
                            <InputNumber className="!w-full" min={0} precision={0} value={budgetCredits} onChange={(value) => setBudgetCredits(value ?? 0)} suffix={t("credits")} aria-label={t("drama.create.budgetLimit")} />
                        </div>
                        {missingCapabilities.length ? (
                            <p className="flex items-start gap-2 text-[var(--fs-tiny)] leading-5 text-[var(--status-error)]">
                                <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                                {t("drama.create.missingCapabilityModels", { capabilities: missingCapabilities.map(capabilityLabel).join("、") })}
                            </p>
                        ) : null}
                    </div>
                    <footer className="drama-compose-launch">
                        <div className="drama-compose-estimate">
                            <div>
                                <b>{estimate ? t("storageUi.paymentCreditsGrantLabel", { value: estimate.episodes, unit: t("drama.create.episodeCountUnit") }) : "—"}</b>
                                <span>{t("drama.create.estimateDuration", { minutes: estimate?.durationMinutes ?? "—" })}</span>
                            </div>
                            <div>
                                <b>{estimate ? formatCount(estimate.shots) : "—"}</b>
                                <span>{t("drama.create.estimateShots")}</span>
                            </div>
                            <div>
                                <b>{estimate?.priced ? `${formatCredits(estimate.minMicrocredits)}–${formatCredits(estimate.maxMicrocredits)}` : "—"}</b>
                                <span>{t("drama.create.estimateCredits")}</span>
                            </div>
                        </div>
                        {mediaMode === "manual" ? (
                            <div className="text-[var(--fs-tiny)] text-foreground/50">{t("drama.create.textOnlyStartupNote")}</div>
                        ) : reviewMode === "sample" && estimate?.priced ? (
                            <div className="text-[var(--fs-tiny)] text-foreground/50">{t("drama.create.sampleBudgetNote", { credits: formatCredits(estimate.sampleMicrocredits) })}</div>
                        ) : null}
                        {estimate?.note ? <div className="text-[var(--fs-micro)] text-foreground/40">{estimate.note}</div> : null}
                        {estimateQuery.isError ? <div role="alert" className="text-[var(--fs-tiny)] text-[var(--status-error)]">{t("drama.create.budgetEstimateFailed")}<Button type="link" size="small" onClick={() => void estimateQuery.refetch()}>{t("drama.create.reestimate")}</Button></div> : null}
                        <Button type="primary" size="large" block icon={<Sparkles className="size-4" />} disabled={!canStart} loading={create.isPending && create.variables === true} onClick={() => create.mutate(true)}>
                            {mediaMode === "manual" ? t("drama.create.startAdaptation") : t("drama.create.startAutoProduction")}
                        </Button>
                        <Button size="large" block icon={<Save className="size-4" />} disabled={!canSaveDraft} loading={create.isPending && create.variables === false} onClick={() => create.mutate(false)}>
                            {t("drama.create.saveDraft")}
                        </Button>
                        <div className="text-[var(--fs-tiny)] text-foreground/50">{t("drama.create.draftHelp")}</div>
                    </footer>
                </aside>
            </div>
        </WorkspacePage>
    );
}
