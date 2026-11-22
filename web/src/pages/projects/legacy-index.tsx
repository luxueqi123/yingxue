import { CollectionToolbar } from "@/components/layout/collection-toolbar";
import { DeleteButton } from "@/components/ui/base/buttons/delete-button";
import { CachedResourceImage } from "@/components/cached-resource-image";
import { MediaPlaceholder } from "@/components/ui/product/media-placeholder";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { App, Button, Form, Input, Modal } from "antd";
import { ArrowRight, BookOpenText, FileText, FolderKanban, Images, LayoutGrid, Palette, Plus, Search, Sparkles } from "lucide-react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router";

import { CollectionGrid, PageHeader, WorkspacePage } from "@/components/layout/workspace-page";
import { WorkspaceErrorState, WorkspaceLoadingState, WorkspaceState } from "@/components/layout/workspace-state";
import { CanvasStylePickerModal, resolveCanvasStylePreset, resolveProjectCanvasStyle, type CanvasStylePreset } from "@/components/canvas/canvas-style-picker-modal";
import { resourceFileUrl } from "@/services/api/resources";
import { ModelPicker } from "@/components/model-picker";
import { createStyleProfileSnapshot, parseStyleProfile, serializeStyleProfile } from "@/lib/canvas/style-profile";
import { projectSummaryCompletion, projectSummaryStage, type ProjectSummaryStageId } from "@/lib/project-workbench";
import { shouldRetryProjectNameConflict } from "@/lib/project-name-conflict";
import { settingsPath } from "@/lib/settings-navigation";
import { PromptTemplateOperation, parseGeneratedStory, promptTemplateTaskPlaceholder, shortDramaOutlineVariables } from "@/lib/prompts";
import { runBackendGenerationTask } from "@/services/api/generation-task";
import { createProject, deleteProject, importProjectUnits, listProjects, type ProjectSummary } from "@/services/api/projects";
import { modelDisplayName, useEffectiveConfig } from "@/stores/use-config-store";
import type { InterfaceMessageKey, InterfaceTranslate } from "@/lib/interface-locale";
import { useInterfaceTranslation } from "@/stores/use-interface-locale-store";

import { sourceTypeLabel } from "./detail/shared";
import { Select } from "@/components/ui/base/select";

type ProjectForm = { name: string; aspectRatio: string; sourceType: string };
type GenerationStep = "createProject" | "generateStory" | "importChapters";
type GenerationStatus = { step: "createProject" | "generateStory" } | { step: "importChapters"; chapterCount: number } | null;

const summaryStageMessageKeys: Record<ProjectSummaryStageId, string> = {
    archived: "projectUi.summaryStageArchived",
    prepareStory: "projectUi.summaryStagePrepareStory",
    chaptersComplete: "projectUi.summaryStageChaptersComplete",
    organizeChapters: "projectUi.summaryStageOrganizeChapters",
    prepareAssets: "projectUi.summaryStagePrepareAssets",
    inProduction: "projectUi.summaryStageInProduction",
};

const sourceTypeOptions = [
    { labelKey: "projectUi.sourceBlank", value: "blank" },
    { labelKey: "projectUi.sourceNovel", value: "novel" },
    { labelKey: "projectUi.sourceText", value: "text" },
] as const satisfies readonly { labelKey: string; value: string }[];

const aspectRatioOptions = [
    { labelKey: "projectUi.aspectVertical", value: "9:16" },
    { labelKey: "projectUi.aspectHorizontal", value: "16:9" },
    { labelKey: "projectUi.aspectSquare", value: "1:1" },
] as const satisfies readonly { labelKey: string; value: string }[];

const structureOptions = [
    { labelKey: "projectUi.structureSingleLine", value: "单线推进" },
    { labelKey: "projectUi.structureParallel", value: "双线并行" },
    { labelKey: "projectUi.structureEnsemble", value: "群像多线" },
    { labelKey: "projectUi.structureNestedTwists", value: "反转嵌套" },
] as const satisfies readonly { labelKey: string; value: string }[];

const chapterLengthOptions = [
    { labelKey: "projectUi.lengthConcise", value: "短" },
    { labelKey: "projectUi.lengthBalanced", value: "中" },
    { labelKey: "projectUi.lengthFull", value: "长" },
] as const satisfies readonly { labelKey: string; value: string }[];

const perspectiveOptions = [
    { labelKey: "projectUi.perspectiveThirdPerson", value: "第三人称" },
    { labelKey: "projectUi.perspectiveFirstPerson", value: "第一人称" },
    { labelKey: "projectUi.perspectiveMultiple", value: "多视角" },
] as const satisfies readonly { labelKey: string; value: string }[];

const toneOptions = [
    { labelKey: "projectUi.toneSteady", value: "平稳叙事" },
    { labelKey: "projectUi.toneComedy", value: "轻松喜剧" },
    { labelKey: "projectUi.toneSuspense", value: "紧张悬疑" },
    { labelKey: "projectUi.toneGrowth", value: "热血成长" },
    { labelKey: "projectUi.toneHealing", value: "甜宠治愈" },
] as const satisfies readonly { labelKey: InterfaceMessageKey; value: string }[];

const characterScaleOptions = [
    { labelKey: "projectUi.characterScaleTwo", label: "2", value: "2 个" },
    { labelKey: "projectUi.characterScaleFour", label: "3–4", value: "3-4 个" },
    { labelKey: "projectUi.characterScaleSix", label: "5–6", value: "5-6 个" },
] as const;

const generationSteps: Array<{ id: GenerationStep; labelKey: string }> = [
    { id: "createProject", labelKey: "projectUi.generationStepCreateProject" },
    { id: "generateStory", labelKey: "projectUi.generationStepGenerateStory" },
    { id: "importChapters", labelKey: "projectUi.generationStepImportChapters" },
];

export default function ProjectsPage({ createPage = false }: { createPage?: boolean }) {
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const { message, modal } = App.useApp();
    const { locale, t } = useInterfaceTranslation();
    const tRef = useRef(t);
    tRef.current = t;
    const effectiveConfig = useEffectiveConfig();
    const [createForm] = Form.useForm<ProjectForm>();
    const [searchParams, setSearchParams] = useSearchParams();
    const [keyword, setKeyword] = useState("");
    const [status, setStatus] = useState<"all" | "active" | "archived">("all");
    const [sort, setSort] = useState<"updated" | "progress" | "name">("updated");
    const [storyDraft, setStoryDraft] = useState("");
    const [createSource, setCreateSource] = useState<"blank" | "novel" | "text">("blank");
    const [selectedStyle, setSelectedStyle] = useState<CanvasStylePreset | null>(null);
    const [stylePickerOpen, setStylePickerOpen] = useState(false);
    const [generateModel, setGenerateModel] = useState("");
    const [generateChapterCount, setGenerateChapterCount] = useState("5");
    const [generateStructure, setGenerateStructure] = useState("单线推进");
    const [generateChapterLength, setGenerateChapterLength] = useState("中");
    const [generateWordCount, setGenerateWordCount] = useState("800");
    const [generatePerspective, setGeneratePerspective] = useState("第三人称");
    const [generateTone, setGenerateTone] = useState("平稳叙事");
    const [generateCharacterScale, setGenerateCharacterScale] = useState("3-4 个");
    const [generating, setGenerating] = useState(false);
    const [generationStatus, setGenerationStatus] = useState<GenerationStatus>(null);
    const [generationPreview, setGenerationPreview] = useState("");
    const createOpen = createPage || searchParams.get("create") === "1";
    const setCreateOpen = (open: boolean) => {
        if (createPage && !open) { navigate("/projects"); return; }
        const next = new URLSearchParams(searchParams);
        if (open) next.set("create", "1");
        else next.delete("create");
        setSearchParams(next, { replace: true });
    };
    const openCreate = (source: "blank" | "novel" | "text") => {
        setCreateSource(source);
        setCreateOpen(true);
    };
    useEffect(() => {
        if (!createOpen) return;
        createForm.setFieldsValue({
            name: storyDraft.trim().slice(0, 24) || "",
            sourceType: createSource,
            aspectRatio: "9:16",
        });
    }, [createForm, createOpen, createSource, storyDraft]);

    const generateStory = async () => {
        const story = storyDraft.trim();
        if (!story || generating) return;
        const textModel = generateModel || effectiveConfig.textModel;
        if (!textModel || !effectiveConfig.textModels.includes(textModel)) {
            if (!textModel) {
                modal.warning({
                    title: t("projectUi.textModelRequiredTitle" as InterfaceMessageKey),
                    content: t("projectUi.textModelRequiredDescription" as InterfaceMessageKey),
                    okText: t("projectUi.goToSettings" as InterfaceMessageKey),
                    cancelText: t("projectUi.cancel" as InterfaceMessageKey),
                    onOk: () => navigate(settingsPath("models")),
                });
            } else {
                message.error(t("projectUi.textModelUnavailable" as InterfaceMessageKey, { model: textModel }));
            }
            return;
        }
        setGenerating(true);
        setGenerationStatus({ step: "createProject" });
        setGenerationPreview("");
        try {
            const project = await createUniqueProjectName(story, selectedStyle);
            setGenerationStatus({ step: "generateStory" });
            const result = await runBackendGenerationTask({
                projectId: project.project.id,
                mode: "text",
                prompt: promptTemplateTaskPlaceholder("短剧大纲"),
                config: { ...effectiveConfig, model: textModel, imageModel: textModel, videoModel: textModel, textModel },
                metadata: {
                    source: "project-story-generator",
                    projectId: project.project.id,
                    promptTemplateOperation: PromptTemplateOperation.ShortDramaOutline,
                    promptTemplateVariables: shortDramaOutlineVariables({
                        story,
                        chapterCount: generateChapterCount,
                        structure: generateStructure,
                        wordCount: generateWordCount,
                        perspective: generatePerspective,
                        tone: generateTone,
                        characterScale: generateCharacterScale,
                        chapterLength: generateChapterLength,
                    }),
                },
                onTextDelta: setGenerationPreview,
            });
            const answer = result.text || "";
            const parsed = parseGeneratedStory(answer);
            if (!parsed.chapters.length) throw new Error(tRef.current("projectUi.generatedStoryHasNoChapters" as InterfaceMessageKey));
            setGenerationStatus({ step: "importChapters", chapterCount: parsed.chapters.length });
            await importProjectUnits(project.project.id, parsed.chapters.map((chapter: { title: string; content: string }) => ({ kind: "chapter", title: chapter.title, sourceText: chapter.content })));
            await queryClient.invalidateQueries({ queryKey: ["projects"] });
            navigate(`/projects/${project.project.id}/overview`);
        } catch (error) {
            message.error(error instanceof Error ? error.message : tRef.current("projectUi.storyGenerationFailed" as InterfaceMessageKey));
        } finally {
            setGenerating(false);
            setGenerationStatus(null);
            setGenerationPreview("");
        }
    };
    const loadMoreRef = useRef<HTMLDivElement>(null);
    const query = useInfiniteQuery({
        // 分页查询和画布页的全量项目查询不能共用缓存形状，否则两个页面会互相覆盖缓存数据。
        queryKey: ["projects", "paged"],
        enabled: !createPage,
        queryFn: ({ pageParam }) => listProjects({ page: pageParam, pageSize: 50 }),
        initialPageParam: 1,
        getNextPageParam: (lastPage) => (lastPage.hasMore ? lastPage.page + 1 : undefined),
    });
    const mutation = useMutation({
        mutationFn: createProject,
        onSuccess: ({ project }) => {
            setCreateOpen(false);
            void queryClient.invalidateQueries({ queryKey: ["projects"] });
            navigate(`/projects/${project.id}/overview`);
        },
            onError: (error) => message.error(error instanceof Error ? error.message : tRef.current("projectUi.projectCreateFailed" as InterfaceMessageKey)),
    });
    const deleteMutation = useMutation({
        mutationFn: deleteProject,
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: ["projects"] });
            message.success(tRef.current("projectUi.projectDeleted" as InterfaceMessageKey));
        },
        onError: (error) => message.error(error instanceof Error ? error.message : tRef.current("projectUi.projectDeleteFailed" as InterfaceMessageKey)),
    });
    const allProjects = useMemo(() => query.data?.pages.flatMap((page) => page.projects) || [], [query.data]);
    const rows = useMemo(() => {
        const normalizedKeyword = keyword.trim().toLowerCase();
        return [...allProjects]
            .filter(({ project }) => status === "all" || project.status === status)
            .filter(({ project }) => !normalizedKeyword || `${project.name} ${project.description} ${project.stylePresetId} ${parseStyleProfile(project.styleProfileJson)?.title || resolveCanvasStylePreset(project.stylePresetId)?.title || ""}`.toLowerCase().includes(normalizedKeyword))
            .sort((left, right) => {
                if (sort === "name") return left.project.name.localeCompare(right.project.name, locale);
                if (sort === "progress") return projectSummaryCompletion(right) - projectSummaryCompletion(left);
                return right.project.updatedAt.localeCompare(left.project.updatedAt);
            });
    }, [allProjects, keyword, locale, sort, status]);
    const totalProjectCount = query.data?.pages[0]?.total ?? allProjects.length;
    useEffect(() => {
        const node = loadMoreRef.current;
        if (!node || !query.hasNextPage || query.isError) return;
        const observer = new IntersectionObserver(
            ([entry]) => {
                if (entry?.isIntersecting && !query.isFetchingNextPage) void query.fetchNextPage();
            },
            { rootMargin: "600px" },
        );
        observer.observe(node);
        return () => observer.disconnect();
    }, [query.fetchNextPage, query.hasNextPage, query.isError, query.isFetchingNextPage]);
    const hasInitialError = query.isError && !query.data;
    const sourceSelectOptions = sourceTypeOptions.map(({ labelKey, value }) => ({ label: t(labelKey as InterfaceMessageKey), value }));
    const aspectSelectOptions = aspectRatioOptions.map(({ labelKey, value }) => ({ label: t(labelKey as InterfaceMessageKey), value }));
    const optionLabel = (options: readonly { labelKey: string; value: string }[], value: string) => {
        const option = options.find((item) => item.value === value);
        return option ? t(option.labelKey as InterfaceMessageKey) : value;
    };
    const countOptions = [3, 5, 8, 10].map((count) => ({ label: t("projectUi.chapterCountOption" as InterfaceMessageKey, { count }), value: String(count) }));
    const wordCountOptions = [500, 800, 1200, 2000].map((count) => ({ label: t("projectUi.wordCountOption" as InterfaceMessageKey, { count }), value: String(count) }));
    const creationForm = <Form<ProjectForm> form={createForm} layout="vertical" initialValues={{ aspectRatio: "9:16", sourceType: "blank" }} onFinish={(values) => mutation.mutate({ ...values, type: "short-drama", ...(selectedStyle ? { stylePresetId: selectedStyle.id, styleProfileJson: serializeStyleProfile(selectedStyle.profile || createStyleProfileSnapshot(selectedStyle)) } : {}) })}>
                    <div className="mb-4 grid grid-cols-3 gap-2">
                        <button type="button" className={createSource === "blank" ? "app-story-source is-active" : "app-story-source"} onClick={() => { setCreateSource("blank"); createForm.setFieldValue("sourceType", "blank"); }}><FolderKanban className="size-4" /><span>{t("projectUi.sourceBlank" as InterfaceMessageKey)}</span></button>
                        <button type="button" className={createSource === "novel" ? "app-story-source is-active" : "app-story-source"} onClick={() => { setCreateSource("novel"); createForm.setFieldValue("sourceType", "novel"); }}><FileText className="size-4" /><span>{t("projectUi.sourceNovel" as InterfaceMessageKey)}</span></button>
                        <button type="button" className={createSource === "text" ? "app-story-source is-active" : "app-story-source"} onClick={() => { setCreateSource("text"); createForm.setFieldValue("sourceType", "text"); }}><BookOpenText className="size-4" /><span>{t("projectUi.sourceText" as InterfaceMessageKey)}</span></button>
                    </div>
                    <Form.Item name="name" label={t("projectUi.projectName" as InterfaceMessageKey)} rules={[{ required: true, whitespace: true, message: t("projectUi.projectNameRequired" as InterfaceMessageKey) }]}><Input autoFocus placeholder={t("completeUi.061")} /></Form.Item>
                    <div className="grid grid-cols-2 gap-3">
                        <Form.Item name="aspectRatio" label={t("projectUi.defaultAspectRatio" as InterfaceMessageKey)}><Select options={aspectSelectOptions} /></Form.Item>
                        <Form.Item name="sourceType" label={t("projectUi.contentSource" as InterfaceMessageKey)}><Select options={sourceSelectOptions} /></Form.Item>
                    </div>
                    <Form.Item label={t("projectUi.projectStyle" as InterfaceMessageKey)}><button type="button" className="app-story-modal-style" onClick={() => setStylePickerOpen(true)}>{selectedStyle ? <><img src={selectedStyle.imageUrl} alt="" /><span>{selectedStyle.title}</span><em>{t("projectUi.changeStyle" as InterfaceMessageKey)}</em></> : <><Palette className="size-4" /><span>{t("projectUi.chooseProjectStyleOptional" as InterfaceMessageKey)}</span></>}</button></Form.Item>
                    <p className="-mt-1 mb-5 text-xs leading-5 text-foreground/48">{t("projectUi.createProjectAfterNote" as InterfaceMessageKey)}</p>
                    <div className="flex justify-end gap-2"><Button onClick={() => setCreateOpen(false)}>{t("projectUi.cancel" as InterfaceMessageKey)}</Button><Button type="primary" htmlType="submit" loading={mutation.isPending}>{t("projectUi.createProject" as InterfaceMessageKey)}</Button></div>
                </Form>;
    return (
        <WorkspacePage className="library-page project-library-page" grid>
            <PageHeader title={createPage ? t("projectUi.newStoryProject" as InterfaceMessageKey) : t("projectUi.storyProjects" as InterfaceMessageKey)} actions={<div className="flex gap-2"><Link to="/projects"><Button>{t("projectUi.shortDramaWorks" as InterfaceMessageKey)}</Button></Link><Button onClick={() => createPage ? navigate("/projects/legacy") : openCreate("blank")}>{createPage ? t("projectUi.backToStoryProjects" as InterfaceMessageKey) : t("projectUi.newStoryProject" as InterfaceMessageKey)}</Button></div>} />
            <details className="story-launcher-panel" aria-label={t("projectUi.startNewShortDrama" as InterfaceMessageKey)} open={createPage || undefined}>
                <summary className="story-launcher-head">
                    <div className="story-launcher-title">
                        <span className="story-launcher-mark"><Sparkles className="size-4" /></span>
                        <div>
                            <h2>{t("projectUi.startNewShortDrama" as InterfaceMessageKey)}</h2>
                            <p>{t("projectUi.startNewShortDramaDescription" as InterfaceMessageKey)}</p>
                        </div>
                    </div>
                    <span className="story-launcher-expand"><Plus className="size-4" /><span>{t("projectUi.expandCreation" as InterfaceMessageKey)}</span></span>
                </summary>
                <div className="story-launcher-main">
                    <Input.TextArea
                        className="story-launcher-input"
                        value={storyDraft}
                        onChange={(event) => setStoryDraft(event.target.value)}
                        placeholder={t("completeUi.062")}
                        autoSize={{ minRows: 2, maxRows: 5 }}
                        aria-label={t("projectUi.oneLineStory" as InterfaceMessageKey)}
                    />
                    {selectedStyle ? <button type="button" className="story-launcher-style-chip" onClick={() => setStylePickerOpen(true)} title={selectedStyle.title}>
                        <img src={selectedStyle.imageUrl} alt="" />
                        <span>{selectedStyle.title}</span>
                    </button> : null}
                </div>
                    <div className="story-launcher-actions">
                        <Button icon={<FolderKanban />} onClick={() => openCreate("blank")}>{t("projectUi.blankProject" as InterfaceMessageKey)}</Button>
                        <Button icon={<FileText />} onClick={() => openCreate("novel")}>{t("projectUi.importNovel" as InterfaceMessageKey)}</Button>
                        <Button icon={<Palette />} onClick={() => setStylePickerOpen(true)}>{selectedStyle ? t("projectUi.changeStyle" as InterfaceMessageKey) : t("projectUi.chooseStyle" as InterfaceMessageKey)}</Button>
                        <ModelPicker
                            config={effectiveConfig}
                            value={generateModel || effectiveConfig.textModel}
                            onChange={setGenerateModel}
                            capability="text"
                            variant="creation"
                            placeholder={t("projectUi.selectTextModel" as InterfaceMessageKey)}
                            showSelectedPrice={false}
                            showOptionPrices
                            popoverClassName="agent-model-picker-popover"
                        />
                        <Button type="default" icon={<Sparkles className="size-3.5" />} disabled={!storyDraft.trim() || generating} loading={generating} onClick={() => void generateStory()}>{t("projectUi.generateChaptersWithAi" as InterfaceMessageKey)}</Button>
                        <Button type="primary" icon={<Plus className="size-3.5" />} onClick={() => openCreate(createSource)}>{t("projectUi.startCreating" as InterfaceMessageKey)}</Button>
                    </div>
                <details className="story-launcher-options">
                    <summary>{t("projectUi.storySettingsSummary" as InterfaceMessageKey, { count: generateChapterCount, perspective: optionLabel(perspectiveOptions, generatePerspective), tone: optionLabel(toneOptions, generateTone) })}</summary>
                <div className="story-launcher-controls">
                    <label><span>{t("projectUi.chapterCount" as InterfaceMessageKey)}</span><Select size="small" className="min-w-28" value={generateChapterCount} onChange={setGenerateChapterCount} options={countOptions} /></label>
                    <label><span>{t("projectUi.storyStructure" as InterfaceMessageKey)}</span><Select size="small" className="min-w-32" value={generateStructure} onChange={setGenerateStructure} options={structureOptions.map(({ labelKey, value }) => ({ label: t(labelKey as InterfaceMessageKey), value }))} /></label>
                    <label><span>{t("projectUi.chapterLength" as InterfaceMessageKey)}</span><Select size="small" className="min-w-28" value={generateChapterLength} onChange={setGenerateChapterLength} options={chapterLengthOptions.map(({ labelKey, value }) => ({ label: t(labelKey as InterfaceMessageKey), value }))} /></label>
                    <label><span>{t("projectUi.wordsPerChapter" as InterfaceMessageKey)}</span><Select size="small" className="min-w-28" value={generateWordCount} onChange={setGenerateWordCount} options={wordCountOptions} /></label>
                    <label><span>{t("projectUi.narrativePerspective" as InterfaceMessageKey)}</span><Select size="small" className="min-w-28" value={generatePerspective} onChange={setGeneratePerspective} options={perspectiveOptions.map(({ labelKey, value }) => ({ label: t(labelKey as InterfaceMessageKey), value }))} /></label>
                    <label><span>{t("projectUi.storyTone" as InterfaceMessageKey)}</span><Select size="small" className="min-w-32" value={generateTone} onChange={setGenerateTone} options={toneOptions.map(({ labelKey, value }) => ({ label: t(labelKey as InterfaceMessageKey), value }))} /></label>
                    <label><span>{t("projectUi.characterScale" as InterfaceMessageKey)}</span><Select size="small" className="min-w-28" value={generateCharacterScale} onChange={setGenerateCharacterScale} options={characterScaleOptions.map(({ labelKey, value }) => ({ label: t(labelKey as InterfaceMessageKey), value }))} /></label>
                </div>
                </details>
            </details>
            {!createPage && <>
            <CollectionToolbar active={Boolean(keyword || status !== "all" || sort !== "updated")} onReset={() => { setKeyword(""); setStatus("all"); setSort("updated"); }}>
                <Input allowClear className="app-list-search" prefix={<Search className="size-4 text-foreground/40" />} value={keyword} placeholder={t("projectUi.searchProjectsPlaceholder" as InterfaceMessageKey)} onChange={(event) => setKeyword(event.target.value)} />
                <Select className="w-32" value={status} onChange={setStatus} options={[{ label: t("projectUi.statusAll" as InterfaceMessageKey), value: "all" }, { label: t("projectUi.statusActive" as InterfaceMessageKey), value: "active" }, { label: t("projectUi.statusArchived" as InterfaceMessageKey), value: "archived" }]} />
                <Select className="w-32" value={sort} onChange={setSort} options={[{ label: t("projectUi.sortRecentlyUpdated" as InterfaceMessageKey), value: "updated" }, { label: t("projectUi.sortChapterProgress" as InterfaceMessageKey), value: "progress" }, { label: t("projectUi.sortProjectName" as InterfaceMessageKey), value: "name" }]} />
            </CollectionToolbar>

            {hasInitialError ? <WorkspaceErrorState title={t("projectUi.projectListLoadFailedTitle" as InterfaceMessageKey)} description={query.error instanceof Error ? query.error.message : t("projectUi.projectListLoadFailed" as InterfaceMessageKey)} onRetry={() => void query.refetch()} /> : null}
            {query.isLoading ? <WorkspaceLoadingState label={t("projectUi.loadingProjects" as InterfaceMessageKey)} detail={t("projectUi.loadingProjectsDetail" as InterfaceMessageKey)} /> : null}
            {!query.isLoading && !hasInitialError && rows.length ? (
                <CollectionGrid className="library-grid project-library-grid">
                    {rows.map((row) => <ProjectRow key={row.project.id} row={row} t={t} locale={locale} onDelete={() => deleteMutation.mutateAsync(row.project.id)} />)}
                </CollectionGrid>
            ) : null}
            {!query.isLoading && !hasInitialError ? <div ref={loadMoreRef} className="library-load-more" aria-live="polite">
                {query.isFetchingNextPage ? t("projectUi.loadingMoreProjects" as InterfaceMessageKey) : query.isError ? <button type="button" onClick={() => void query.fetchNextPage()}>{t("projectUi.loadMoreFailedRetry" as InterfaceMessageKey)}</button> : query.hasNextPage ? t("projectUi.scrollForMoreProjects" as InterfaceMessageKey, { count: 50 }) : allProjects.length ? t("projectUi.allProjectsLoaded" as InterfaceMessageKey, { count: totalProjectCount }) : null}
            </div> : null}
            {!query.isLoading && !rows.length && !hasInitialError && (keyword || status !== "all") ? (
                <WorkspaceState
                    icon="projects"
                    title={t("projectUi.noMatchingProjects" as InterfaceMessageKey)}
                    description={t("projectUi.adjustProjectSearch" as InterfaceMessageKey)}
                    action={!keyword && status === "all" ? <Button type="primary" icon={<Plus className="size-3.5" />} onClick={() => setCreateOpen(true)}>{t("projectUi.createProject" as InterfaceMessageKey)}</Button> : undefined}
                />
            ) : null}

            </>}
            {createPage ? <section className="story-launcher-panel" aria-label={t("projectUi.shortDramaProjectSettings" as InterfaceMessageKey)}>{creationForm}</section> :             <Modal className="library-modal" title={t("projectUi.createShortDramaProject" as InterfaceMessageKey)} open={createOpen} footer={null} destroyOnHidden onCancel={() => setCreateOpen(false)} width={560} styles={{ body: { paddingTop: 12 } }}>
                {creationForm}
            </Modal>}
            <CanvasStylePickerModal
                open={stylePickerOpen}
                value={selectedStyle?.id}
                onClose={() => setStylePickerOpen(false)}
                onSelect={(preset) => { setSelectedStyle(preset); setStylePickerOpen(false); }}
            />
            <Modal className="library-modal" title={t("projectUi.aiGenerateChaptersTitle" as InterfaceMessageKey)} open={generating} footer={null} closable={false} mask={{ closable: false }} keyboard={false} width={760}>
                <div className="app-story-generating">
                    <div className="app-story-generating-head">
                        <span className="app-story-generating-mark"><Sparkles className="size-4" /></span>
                        <div className="min-w-0">
                            <p>{t("projectUi.aiCreating" as InterfaceMessageKey)}</p>
                            <span className="block text-[var(--fs-tiny)] text-foreground/45">{t("projectUi.generatingTitleDescriptionChapters" as InterfaceMessageKey)}</span>
                        </div>
                        {generateModel || effectiveConfig.textModel ? <span className="app-story-generating-model">{modelDisplayName(effectiveConfig, generateModel || effectiveConfig.textModel)}</span> : null}
                    </div>
                    <div className="app-story-generating-progress" aria-hidden="true" />
                    <div className="app-story-generating-grid">
                        <div className="app-story-generating-story">
                            <span className="app-story-generating-caption">{t("projectUi.storyStartingPoint" as InterfaceMessageKey)}</span>
                            <p>{storyDraft.trim() || t("projectUi.waitingForStoryInput" as InterfaceMessageKey)}</p>
                            <span className="app-story-generating-meta">{t("projectUi.generationSettingsSummary" as InterfaceMessageKey, { chapters: generateChapterCount, words: generateWordCount, structure: optionLabel(structureOptions, generateStructure), perspective: optionLabel(perspectiveOptions, generatePerspective) })}</span>
                            {selectedStyle ? <span className="app-story-generating-style"><img src={selectedStyle.imageUrl} alt="" /><span>{selectedStyle.title}</span></span> : null}
                        </div>
                        <ol className="app-story-generating-steps">
                            {generationSteps.map((step, index) => {
                                const currentStepIndex = generationStatus ? generationSteps.findIndex((item) => item.id === generationStatus.step) : -1;
                                const state = currentStepIndex === index ? "is-active" : currentStepIndex > index ? "is-done" : "";
                                const count = generationStatus?.step === "importChapters" && step.id === "importChapters" ? generationStatus.chapterCount : undefined;
                                return <li key={step.id} className={state}><span className="app-story-generating-step-dot" /><span>{t(step.labelKey as InterfaceMessageKey, count === undefined ? undefined : { count })}</span><em>{state === "is-active" ? t("projectUi.generationStatusInProgress" as InterfaceMessageKey) : state === "is-done" ? t("projectUi.generationStatusDone" as InterfaceMessageKey) : t("projectUi.generationStatusWaiting" as InterfaceMessageKey)}</em></li>;
                            })}
                        </ol>
                    </div>
                    <div className="app-story-generating-preview">
                        <div className="app-story-generating-preview-head"><span>{t("projectUi.liveDraft" as InterfaceMessageKey)}</span><span className="app-story-generating-live" /><em>{generationPreview ? t("projectUi.modelOutputInProgress" as InterfaceMessageKey) : t("projectUi.waitingForModelOutput" as InterfaceMessageKey)}</em></div>
                        <pre>{generationPreview}</pre>
                    </div>
                </div>
            </Modal>
        </WorkspacePage>
    );
}

async function createUniqueProjectName(story: string, selectedStyle: CanvasStylePreset | null) {
    const base = story.trim().slice(0, 24);
    const buildInput = (name: string) => ({
        name,
        type: "short-drama" as const,
        aspectRatio: "9:16",
        sourceType: "blank",
        description: story.trim(),
        ...(selectedStyle ? { stylePresetId: selectedStyle.id, styleProfileJson: serializeStyleProfile(selectedStyle.profile || createStyleProfileSnapshot(selectedStyle)) } : {}),
    });
    let attempt = 0;
    for (;;) {
        try {
            return await createProject(buildInput(attempt === 0 ? base : `${base}（${attempt + 1}）`));
        } catch (error) {
            if (!shouldRetryProjectNameConflict(error, attempt)) throw error;
            attempt += 1;
        }
    }
}

function ProjectRow({ row, t, locale, onDelete }: { row: ProjectSummary; t: InterfaceTranslate; locale: string; onDelete: () => Promise<unknown> }) {
    const location = useLocation();
    const completion = projectSummaryCompletion(row);
    const stage = projectSummaryStage(row);
    const projectStyle = resolveProjectCanvasStyle(row.project.stylePresetId, row.project.styleProfileJson);
    const styleTitle = projectStyle?.title || parseStyleProfile(row.project.styleProfileJson)?.title || resolveCanvasStylePreset(row.project.stylePresetId)?.title || t((row.project.stylePresetId ? "projectUi.customStyle" : "projectUi.styleNotSet") as InterfaceMessageKey);
    const coverUrl = row.project.coverResourceId ? resourceFileUrl(row.project.coverResourceId) : projectStyle?.imageUrl;
    return (
        <Link to={`/projects/${row.project.id}/overview`} state={{ returnTo: location.pathname + location.search + location.hash, returnState: location.state }} className="product-collection-card library-card project-library-card group">
            <span className="project-library-cover">
                {coverUrl ? <CachedResourceImage className="project-library-cover-art" src={coverUrl} alt="" fallback={<MediaPlaceholder failed />} /> : <MediaPlaceholder label={t("projectUi.storyStartsHere" as InterfaceMessageKey)} />}
                <span className="project-library-cover-scrim" />
                <span className="project-library-cover-ratio">{row.project.aspectRatio}</span>
                <span className="project-library-cover-stage">{t(summaryStageMessageKeys[stage.id] as InterfaceMessageKey)}</span>
                <span className="project-collection-delete"><DeleteButton label={t("projectUi.deleteProjectNamed" as InterfaceMessageKey, { name: row.project.name })} description={t("projectUi.deleteProjectDescription" as InterfaceMessageKey)} onConfirm={onDelete} /></span>
            </span>
            <span className="project-library-body">
                <span className="project-library-heading"><strong title={row.project.name}>{row.project.name}</strong>{row.project.status === "archived" ? <em>{t("projectUi.summaryStageArchived" as InterfaceMessageKey)}</em> : null}<ArrowRight className="project-library-arrow size-4" /></span>
                <span className="project-library-subtitle">{styleTitle} · {sourceTypeLabel(row.project.sourceType, t)}</span>
                <span className="project-library-progress"><span><span>{t("projectUi.projectChapterProgress" as InterfaceMessageKey, { completed: row.completedUnitCount, total: row.unitCount })}</span><span>{t("projectUi.percentComplete" as InterfaceMessageKey, { percent: completion })}</span></span><i><b style={{ width: `${completion}%` }} /></i></span>
                <span className="project-library-stats"><ProjectCount icon={<BookOpenText className="size-3.5" />} labelKey="projectUi.chaptersLabel" value={row.unitCount} t={t} locale={locale} /><ProjectCount icon={<LayoutGrid className="size-3.5" />} labelKey="projectUi.canvasesLabel" value={row.canvasCount} t={t} locale={locale} /><ProjectCount icon={<Images className="size-3.5" />} labelKey="projectUi.assetsLabel" value={row.assetCount} t={t} locale={locale} /></span>
            </span>
        </Link>
    );
}

function ProjectCount({ icon, labelKey, value, t, locale }: { icon: ReactNode; labelKey: string; value: number; t: InterfaceTranslate; locale: string }) {
    const count = value.toLocaleString(locale);
    const label = t(labelKey as InterfaceMessageKey);
    return <span className="inline-flex items-center gap-1.5" title={t("projectUi.projectCountTitle" as InterfaceMessageKey, { count, label })}><span className="text-foreground/32">{icon}</span><strong className="font-medium tabular-nums text-foreground/65">{count}</strong><span>{label}</span></span>;
}
