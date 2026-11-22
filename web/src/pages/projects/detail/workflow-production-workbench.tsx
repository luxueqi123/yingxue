import { ImageSizePicker } from "@/components/image-size-picker";
import { imageResolutionUsesQuality } from "@/lib/image-size-presets";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { App, Button, Form, Image, Input, InputNumber } from "antd";
import { SegmentedControl } from "@/components/ui/base/segmented-control";
import { EmptyState } from "@/components/ui/product/empty-state";
import { StatusBadge } from "@/components/ui/base/badges";
import { AppModal } from "@/components/ui/product/app-modal/app-modal";
import { Box, ChevronDown, ChevronLeft, ChevronRight, Download, Film, Image as ImageIcon, Layers3, List, Maximize2, Play, Plus, RefreshCcw, Save, Search, SlidersHorizontal, Trash2, UsersRound, WandSparkles, X } from "lucide-react";
import { Link, useNavigate } from "react-router";

import { CanvasResourceMentionTextarea } from "@/components/canvas/canvas-resource-mention-textarea";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { ModelPicker } from "@/components/model-picker";
import { CreditSymbol, requestCreditCost } from "@/constant/credits";
import { modelCapabilityConfigFor, normalizeImageValue, normalizeVideoValue, videoDurationOptions } from "@/lib/model-capabilities";
import { modelQuoteDescription, modelQuoteRequest } from "@/lib/model-pricing";
import { customShotTitle, formatShotOrdinal, normalizeDefaultShotTitle } from "@/lib/shot-label";
import { modelCompatibilityError, resolveCompatibleModel, resolveModelVideoBooleanOptions, type ModelRequirements } from "@/lib/model-selection";
import { formatVideoResolutionLabel } from "@/lib/video-generation-options";
import { submitBackendGenerationTask } from "@/services/api/generation-task";
import { quoteModel, type LogicalModelQuote } from "@/services/api/logical-models";
import { type GenerationTask } from "@/services/api/task-center";
import { downloadBrowserMedia } from "@/services/browser-download";
import {
    createUnitWorkflow,
    deleteProjectShot,
    linkShotAsset,
    listProjectAssetsPage,
    saveProjectShot,
    unlinkShotAsset,
    type ProjectAsset,
    type ProjectDetail,
    type ProjectShot,
    type ShotAssetReference,
    type ShotArtifact,
    type ShotRevisionInput,
    type WorkflowStep,
} from "@/services/api/projects";
import { resourceFileUrl, resourceIdFromStorageKey, resourceStorageKey } from "@/services/api/resources";
import { skillRuntime } from "@/services/skill-runtime";
import { configuredModelMatchesCapability, modelDisplayName, modelOptionName, resolveModelChannel, selectableModelsByCapability, useConfigStore, useEffectiveConfig } from "@/stores/use-config-store";
import { useUserStore } from "@/stores/use-user-store";
import { SkillRuntimePicker, useSkillRuntimeCatalog } from "@/components/skills/skill-runtime-picker";
import type { InterfaceMessageKey, InterfaceTranslate } from "@/lib/interface-locale";
import { useInterfaceTranslation } from "@/stores/use-interface-locale-store";

import {
    ArtifactStatus,
    artifactTypeForStage,
    assetCategoryLabel,
    currentArtifact,
    currentRevision,
    formatDuration,
    type ShortDramaWorkflowStage,
} from "./workflow-shared";
import { buildShotAssetReferenceContext, ensureShotAssetMentionPrompt, resolveShotAssetMentionPrompt } from "./workflow-shot-references";
import { Select } from "@/components/ui/base/select";

type ShotEditorValues = Omit<ShotRevisionInput, "durationMs"> & {
    title: string;
    durationSeconds: number;
};

type Props = {
    activeStage: ShortDramaWorkflowStage;
    detail: ProjectDetail;
    projectId: string;
    unitId: string;
    workflowStep?: WorkflowStep;
    selectedShot?: ProjectShot;
    onSelectShot: (id: string) => void;
    onRefresh: () => Promise<void>;
    onAddShot: () => void;
    addingShot: boolean;
};

const productionStageCopy: Record<"storyboard" | "previz" | "video", { label: InterfaceMessageKey; action: InterfaceMessageKey; empty: InterfaceMessageKey }> = {
    storyboard: { label: "projectUi.stageStoryboardImage" as InterfaceMessageKey, action: "projectUi.generateStoryboardImage" as InterfaceMessageKey, empty: "projectUi.stageStoryboardImageDescription" as InterfaceMessageKey },
    previz: { label: "projectUi.stageActionPrevisualization" as InterfaceMessageKey, action: "projectUi.generateActionPrevisualization" as InterfaceMessageKey, empty: "projectUi.stageActionPrevisualizationDescription" as InterfaceMessageKey },
    video: { label: "projectUi.stageShotVideo" as InterfaceMessageKey, action: "projectUi.generateShotVideo" as InterfaceMessageKey, empty: "projectUi.stageShotVideoDescription" as InterfaceMessageKey },
};

export default function WorkflowProductionWorkbench(props: Props) {
    const { activeStage, detail, projectId, unitId, workflowStep, selectedShot, onSelectShot, onRefresh, onAddShot, addingShot } = props;
    const { message, modal } = App.useApp();
    const { locale, t } = useInterfaceTranslation();
    const navigate = useNavigate();
    const effectiveConfig = useEffectiveConfig();
    const isAiConfigReady = useConfigStore((state) => state.isAiConfigReady);
    const creditsEnabled = useUserStore((state) => state.features.creditsEnabled);
    const [form] = Form.useForm<ShotEditorValues>();
    const watchedDuration = Form.useWatch("durationSeconds", form);
    const watchedTitle = Form.useWatch("title", form);
    const [leftTab, setLeftTab] = useState<"assets" | "episodes" | "shots">("episodes");
    const [previewTab, setPreviewTab] = useState<"latest" | "history">("latest");
    const [previewArtifactId, setPreviewArtifactId] = useState("");
    const [imagePreviewArtifact, setImagePreviewArtifact] = useState<ShotArtifact | null>(null);
    const [editorDirty, setEditorDirty] = useState(false);
    const [submittingShotIds, setSubmittingShotIds] = useState<Set<string>>(() => new Set());
    const [taskClock, setTaskClock] = useState(() => Date.now());
    const activeShotIdRef = useRef(selectedShot?.id || "");
    activeShotIdRef.current = selectedShot?.id || "";
    const shots = useMemo(() => (detail.shots || []).filter((item) => item.unitId === unitId).slice().sort((left, right) => left.position - right.position), [detail.shots, unitId]);
    const shotIndex = selectedShot ? shots.findIndex((item) => item.id === selectedShot.id) : -1;
    const revision = currentRevision(detail, selectedShot);
    const artifactType = artifactTypeForStage(activeStage);
    const artifacts = useMemo(() => selectedShot ? (detail.shotArtifacts || []).filter((item) => item.shotId === selectedShot.id && item.type === artifactType).slice().sort((left, right) => right.version - left.version) : [], [artifactType, detail.shotArtifacts, selectedShot]);
    const shotTask = useMemo<GenerationTask | undefined>(() => {
        return (detail.tasks || []).filter((task) => task.clientContext?.shotId === selectedShot?.id && task.clientContext?.artifactType === artifactType).sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0];
    }, [artifactType, detail.tasks, selectedShot?.id]);
    useEffect(() => {
        if (shotTask?.status !== "queued" && shotTask?.status !== "running") return;
        const timer = window.setInterval(() => setTaskClock(Date.now()), 1_000);
        return () => window.clearInterval(timer);
    }, [shotTask?.status, shotTask?.id]);
    const shotTaskElapsed = shotTask ? formatTaskElapsed(Date.parse(shotTask.startedAt || shotTask.createdAt), taskClock, t, locale) : "";
    const newestArtifact = artifacts.find((item) => item.selected) || artifacts[0];
    const previewArtifact = artifacts.find((item) => item.id === previewArtifactId) || newestArtifact;
    const generationCapability = activeStage === "video" ? "video" as const : "image" as const;
    const modelOptions = useMemo(() => selectableModelsByCapability(effectiveConfig, generationCapability), [effectiveConfig, generationCapability]);
    const projectDefaultModel = generationCapability === "video" ? detail.project.defaultVideoModel : detail.project.defaultImageModel;
    const globalDefaultModel = generationCapability === "video" ? effectiveConfig.videoModel : effectiveConfig.imageModel;
    const defaultModel = projectDefaultModel && configuredModelMatchesCapability(effectiveConfig, projectDefaultModel, generationCapability) ? projectDefaultModel : globalDefaultModel;
    const initialModel = defaultModel || modelOptions[0] || "";
    const [selectedModel, setSelectedModel] = useState(initialModel);
    const selectedModelRef = useRef(initialModel);
    const [aspectRatio, setAspectRatio] = useState(detail.project.aspectRatio || "16:9");
    const [resolution, setResolution] = useState(effectiveConfig.vquality || "720");
    const [imageQuality, setImageQuality] = useState(effectiveConfig.quality || "auto");
    const [selectedSkillIds, setSelectedSkillIds] = useState<string[]>([]);
    const { skills: availableSkills, loading: skillsLoading } = useSkillRuntimeCatalog();
    const shotAssetReferenceContext = useMemo(() => buildShotAssetReferenceContext(detail, selectedShot?.id || ""), [detail, selectedShot?.id]);
    const referenceByVersionId = useMemo(() => {
        const references = (detail.shotReferences || []).filter((reference) => reference.shotId === selectedShot?.id && reference.role === "reference" && reference.status === "linked");
        return new Map(references.flatMap((reference) => [
            [reference.assetVersionId, reference] as const,
            ...(reference.asset?.primaryVersionId ? [[reference.asset.primaryVersionId, reference] as const] : []),
        ]));
    }, [detail.shotReferences, selectedShot?.id]);
    const currentDurationSeconds = Number(watchedDuration || Math.max(0.5, (selectedShot?.durationMs || 3000) / 1000));
    const generationSeconds = String(Math.max(1, Math.round(currentDurationSeconds)));
    const generationReferenceAudios = generationCapability === "video" ? shotAssetReferenceContext.referenceAudios : [];
    const videoEditOperation = generationCapability === "video" && shotAssetReferenceContext.referenceImages.length ? "reference_to_video" : undefined;
    const modelRequirements = useMemo<ModelRequirements>(() => ({
        capability: generationCapability,
        input: { textCount: 1, imageCount: shotAssetReferenceContext.referenceImages.length, videoCount: 0, audioCount: generationReferenceAudios.length, characterCount: 0 },
        videoOperation: videoEditOperation,
        videoSeconds: generationCapability === "video" ? generationSeconds : undefined,
        imageSize: generationCapability === "image" ? aspectRatio : undefined,
        options: generationCapability === "video"
            ? { size: aspectRatio, vquality: resolution, videoSeconds: Number(generationSeconds) }
            : { size: aspectRatio, quality: imageQuality },
    }), [aspectRatio, generationCapability, generationReferenceAudios.length, generationSeconds, imageQuality, resolution, shotAssetReferenceContext.referenceImages.length, videoEditOperation]);
    const routedModel = resolveCompatibleModel(effectiveConfig, selectedModel, modelRequirements) || selectedModel;
    const activeProfile = useMemo(() => modelCapabilityConfigFor(effectiveConfig, routedModel), [effectiveConfig, routedModel]);
    const videoProfile = generationCapability === "video" ? activeProfile.video : undefined;
    const imageProfile = generationCapability === "image" ? activeProfile.image : undefined;
    const videoBooleanOptions = useMemo(() => generationCapability === "video"
        ? resolveModelVideoBooleanOptions(effectiveConfig, routedModel, {}, {
              videoGenerateAudio: effectiveConfig.videoGenerateAudio,
              videoWatermark: effectiveConfig.videoWatermark,
          })
        : undefined, [effectiveConfig, generationCapability, routedModel]);
    const generationConfig = useMemo(() => ({
        ...effectiveConfig,
        model: routedModel,
        imageModel: generationCapability === "image" ? routedModel : effectiveConfig.imageModel,
        videoModel: generationCapability === "video" ? routedModel : effectiveConfig.videoModel,
        size: aspectRatio,
        quality: imageQuality,
        vquality: resolution,
        videoSeconds: generationSeconds,
        ...(videoBooleanOptions || {}),
    }), [aspectRatio, effectiveConfig, generationCapability, generationSeconds, imageQuality, resolution, routedModel, videoBooleanOptions]);
    const priceChannel = resolveModelChannel(generationConfig, routedModel);
    const configuredCredits = requestCreditCost({
        channelMode: priceChannel.scope === "system" ? "remote" : "local",
        modelCosts: priceChannel.modelCosts,
        model: modelOptionName(routedModel),
        count: 1,
        seconds: generationCapability === "video" ? generationSeconds : 1,
        capability: generationCapability,
        config: generationConfig,
        requirements: modelRequirements,
    });
    const quoteRequest = useMemo(() => modelQuoteRequest(generationConfig, routedModel, generationCapability, modelRequirements), [generationCapability, generationConfig, modelRequirements, routedModel]);
    const quoteRequestKey = JSON.stringify(quoteRequest || null);
    const [routeQuote, setRouteQuote] = useState<LogicalModelQuote | null>(null);
    const generationCredits = routeQuote ? routeQuote.amountMicrocredits / 1_000_000 : configuredCredits;
    const formattedGenerationCredits = generationCredits?.toLocaleString(locale, { maximumFractionDigits: 6 });
    const modelSummary = routedModel ? modelDisplayName(effectiveConfig, routedModel) : t("projectUi.modelNotSelected" as InterfaceMessageKey);
    const durationSummary = `${Number(watchedDuration || Math.max(0.5, (selectedShot?.durationMs || 3000) / 1000))}s`;
    const resolutionSummary = generationCapability === "video" ? formatVideoResolutionLabel(resolution) : imageQuality.toUpperCase();

    useEffect(() => {
        selectedModelRef.current = initialModel;
        setSelectedModel(initialModel);
        if (!initialModel) return;
        const profile = modelCapabilityConfigFor(effectiveConfig, initialModel);
        if (generationCapability === "video" && profile.video) {
            const normalized = normalizeVideoValue(profile.video, {
                seconds: effectiveConfig.videoSeconds,
                ratio: detail.project.aspectRatio || effectiveConfig.size,
                resolution: effectiveConfig.vquality,
            });
            setAspectRatio(normalized.ratio);
            setResolution(normalized.resolution);
            form.setFieldValue("durationSeconds", Number(normalized.seconds));
        } else if (generationCapability === "image" && profile.image) {
            const normalized = normalizeImageValue(profile.image, { size: detail.project.aspectRatio || effectiveConfig.size, quality: effectiveConfig.quality, count: "1" });
            setAspectRatio(normalized.size);
            setImageQuality(normalized.quality);
        }
    }, [detail.project.aspectRatio, effectiveConfig, form, generationCapability, initialModel]);

    useEffect(() => {
        if (!creditsEnabled || !quoteRequest) {
            setRouteQuote(null);
            return;
        }
        const controller = new AbortController();
        setRouteQuote(null);
        quoteModel(quoteRequest, controller.signal)
            .then(({ quote }) => setRouteQuote(quote))
            .catch(() => {
                if (!controller.signal.aborted) setRouteQuote(null);
            });
        return () => controller.abort();
        // quoteRequestKey captures the normalized request without retriggering on object identity.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [creditsEnabled, quoteRequestKey]);

    useEffect(() => {
        const shotDurationSeconds = Math.max(0.5, (revision?.durationMs || selectedShot?.durationMs || 3000) / 1000);
        const currentModel = selectedModelRef.current || initialModel;
        const normalizedDurationSeconds = generationCapability === "video" && currentModel
            ? Number(normalizeVideoValue(modelCapabilityConfigFor(effectiveConfig, currentModel).video!, { seconds: String(shotDurationSeconds) }).seconds)
            : shotDurationSeconds;
        const videoPrompt = ensureShotAssetMentionPrompt(revision?.videoPrompt || "", shotAssetReferenceContext.mentionReferences);
        form.setFieldsValue({
            title: normalizeDefaultShotTitle(selectedShot?.title, Math.max(0, shotIndex)),
            plotDescription: revision?.plotDescription || selectedShot?.description || "",
            action: revision?.action || "",
            dialogue: revision?.dialogue || "",
            shotSize: revision?.shotSize || "",
            cameraAngle: revision?.cameraAngle || "",
            cameraMovement: revision?.cameraMovement || "",
            durationSeconds: normalizedDurationSeconds,
            imagePrompt: revision?.imagePrompt || "",
            videoPrompt,
            negativePrompt: revision?.negativePrompt || "",
            continuityNotes: revision?.continuityNotes || "",
        });
        setPreviewArtifactId("");
        setImagePreviewArtifact(null);
        setEditorDirty(!revision || videoPrompt !== revision.videoPrompt);
    }, [effectiveConfig, form, generationCapability, initialModel, revision?.id, selectedShot?.id, shotAssetReferenceContext.mentionReferences]);

    const changeGenerationModel = (nextModel: string) => {
        selectedModelRef.current = nextModel;
        setSelectedModel(nextModel);
        const profile = modelCapabilityConfigFor(effectiveConfig, nextModel);
        if (generationCapability === "video" && profile.video) {
            const normalized = normalizeVideoValue(profile.video, {
                seconds: String(form.getFieldValue("durationSeconds") || generationSeconds),
                ratio: aspectRatio,
                resolution,
            });
            setAspectRatio(normalized.ratio);
            setResolution(normalized.resolution);
            form.setFieldValue("durationSeconds", Number(normalized.seconds));
            return;
        }
        if (generationCapability === "image" && profile.image) {
            const normalized = normalizeImageValue(profile.image, { size: aspectRatio, quality: imageQuality, count: "1" });
            setAspectRatio(normalized.size);
            setImageQuality(normalized.quality);
        }
    };

    const saveShot = useMutation({
        mutationFn: async (values: ShotEditorValues) => {
            if (!selectedShot) throw new Error(t("projectUi.selectShotFirst" as InterfaceMessageKey));
            return saveProjectShot(projectId, {
                id: selectedShot.id,
                unitId,
                title: values.title,
                description: values.plotDescription,
                position: selectedShot.position,
                durationMs: Math.round(values.durationSeconds * 1000),
                status: selectedShot.status,
                revision: revisionInput(values),
            });
        },
        onSuccess: async () => { setEditorDirty(false); await onRefresh(); message.success(t("projectUi.shotScriptSavedAsVersion" as InterfaceMessageKey)); },
        onError: (error) => message.error(error instanceof Error ? error.message : t("projectUi.shotSaveFailed" as InterfaceMessageKey)),
    });

    const deleteShot = useMutation({
        mutationFn: async ({ shotId }: { shotId: string; nextShotId: string }) => deleteProjectShot(projectId, shotId),
        onSuccess: async (_result, { nextShotId }) => {
            onSelectShot(nextShotId);
            await onRefresh();
            message.success(t("projectUi.shotDeleted" as InterfaceMessageKey));
        },
        onError: (error) => message.error(error instanceof Error ? error.message : t("projectUi.shotDeleteFailed" as InterfaceMessageKey)),
    });

    const changeAssetBinding = useMutation({
        mutationFn: async ({ asset, reference }: { asset?: ProjectAsset; reference?: ShotAssetReference }) => {
            if (!selectedShot) throw new Error(t("projectUi.selectShotFirst" as InterfaceMessageKey));
            if (reference) return unlinkShotAsset(projectId, selectedShot.id, reference.id);
            if (!asset?.primaryVersionId) throw new Error(t("projectUi.assetHasNoBindableVersion" as InterfaceMessageKey));
            return linkShotAsset(projectId, selectedShot.id, { assetVersionId: asset.primaryVersionId, role: "reference" });
        },
        onSuccess: async (_result, variables) => { await onRefresh(); message.success(variables.reference ? t("projectUi.shotAssetReferenceRemoved" as InterfaceMessageKey) : t("projectUi.assetBoundToShot" as InterfaceMessageKey)); },
        onError: (error) => message.error(error instanceof Error ? error.message : t("projectUi.shotAssetUpdateFailed" as InterfaceMessageKey)),
    });

    const generateArtifact = async () => {
        if (!selectedShot || submittingShotIds.has(selectedShot.id)) return;
        const submittingShot = selectedShot;
        setSubmittingShotIds((current) => new Set(current).add(submittingShot.id));
        try {
            const values = await form.validateFields();
            let productionStep = workflowStep;
            if (!productionStep) {
                const initialized = await createUnitWorkflow(projectId, unitId);
                productionStep = (initialized.workflow.steps || []).find((step) => step.stepKey === activeStage);
            }
            if (!productionStep) throw new Error(t("projectUi.generationStageUnavailable" as InterfaceMessageKey));
            if (productionStep.status === "failed") throw new Error(t("projectUi.generationStageFailed" as InterfaceMessageKey));
            if (!routedModel) throw new Error(activeStage === "video" ? t("projectUi.configureVideoModelFirst" as InterfaceMessageKey) : t("projectUi.configureImageModelFirst" as InterfaceMessageKey));
            const compatibilityError = modelCompatibilityError(effectiveConfig, routedModel, modelRequirements);
            if (compatibilityError) throw new Error(t("projectUi.modelConfigurationUnavailable" as InterfaceMessageKey, { reason: compatibilityError }));
            const saved = await saveProjectShot(projectId, {
                id: submittingShot.id,
                unitId,
                title: values.title,
                description: values.plotDescription,
                position: submittingShot.position,
                durationMs: Math.round(values.durationSeconds * 1000),
                status: submittingShot.status,
                revision: revisionInput(values),
            });
            const mode = generationCapability;
            const config = { ...generationConfig, videoSeconds: String(Math.max(1, Math.round(values.durationSeconds))) };
            if (!isAiConfigReady(config, routedModel)) throw new Error(t("projectUi.modelChannelConfigurationIncomplete" as InterfaceMessageKey));
            const basePrompt = mode === "video"
                ? [values.videoPrompt || values.plotDescription, values.action, values.dialogue && `台词：${values.dialogue}`, values.continuityNotes].filter(Boolean).join("\n")
                : [values.imagePrompt || values.plotDescription, values.action, "黑白分镜草图，清晰动作节拍，电影构图"].filter(Boolean).join("\n");
            const resolvedPrompt = resolveShotAssetMentionPrompt(basePrompt, shotAssetReferenceContext, { dialogue: values.dialogue });
            const skillExecution = await skillRuntime.prepare({
                profile: "shortDrama",
                prompt: resolvedPrompt,
                skills: availableSkills,
                selectedSkillIds,
            });
            await submitBackendGenerationTask({
                projectId,
                mode,
                prompt: skillExecution.prompt,
                config,
                referenceImages: shotAssetReferenceContext.referenceImages,
                referenceAudios: generationReferenceAudios,
                metadata: {
                    ...skillExecution.metadata,
                    workflowStepId: productionStep.id,
                    domainProjectId: projectId,
                    unitId,
                    shotId: saved.shot.id,
                    shotRevisionId: saved.shot.currentRevisionId,
                    artifactType,
                    role: "output",
                    source: "short-drama-workflow",
                    ...(mode === "video" && shotAssetReferenceContext.referenceImages.length ? { videoEditOperation: "reference_to_video" } : {}),
                    resolvedCharacterVersions: shotAssetReferenceContext.resolvedCharacterVersions,
                    artifactMetadata: { model: routedModel, aspectRatio, resolution, durationSeconds: values.durationSeconds, ...skillExecution.metadata },
                },
            });
            if (activeShotIdRef.current === submittingShot.id) setEditorDirty(false);
            await onRefresh();
            message.success(t("projectUi.generationTaskSubmitted" as InterfaceMessageKey, { stage: t(productionStageCopy[activeStage as "storyboard" | "previz" | "video"].label) }));
        } catch (error) {
            message.error(error instanceof Error ? error.message : t("projectUi.generationTaskSubmitFailed" as InterfaceMessageKey));
        } finally {
            setSubmittingShotIds((current) => {
                const next = new Set(current);
                next.delete(submittingShot.id);
                return next;
            });
        }
    };

    const stageCopyKeys = productionStageCopy[activeStage as "storyboard" | "previz" | "video"];
    const stageCopy = { label: t(stageCopyKeys.label), action: t(stageCopyKeys.action), empty: t(stageCopyKeys.empty) };
    const selectedShotSubmitting = submittingShotIds.has(selectedShot?.id || "");

    if (!selectedShot) {
        return <div className="workflow-empty-shot"><EmptyState size="compact" title={t("projectUi.chapterHasNoShots" as InterfaceMessageKey)} action={<Button type="primary" icon={<Plus className="size-4" />} loading={addingShot} onClick={onAddShot}>{t("projectUi.addFirstShot" as InterfaceMessageKey)}</Button>} /></div>;
    }

    const requestShotSelection = (nextShotId: string) => {
        if (nextShotId === selectedShot.id) return;
        if (!editorDirty) {
            onSelectShot(nextShotId);
            return;
        }
        modal.confirm({
            title: t("projectUi.shotHasUnsavedChanges" as InterfaceMessageKey),
            content: t("projectUi.switchingShotDiscardsChanges" as InterfaceMessageKey),
            okText: t("projectUi.discardAndSwitchShot" as InterfaceMessageKey),
            cancelText: t("projectUi.continueEditing" as InterfaceMessageKey),
            onOk: () => onSelectShot(nextShotId),
        });
    };

    const requestAddShot = () => {
        if (!editorDirty) {
            onAddShot();
            return;
        }
        modal.confirm({
            title: t("projectUi.shotHasUnsavedChanges" as InterfaceMessageKey),
            content: t("projectUi.addingShotLeavesCurrentEdit" as InterfaceMessageKey),
            okText: t("projectUi.discardAndAddShot" as InterfaceMessageKey),
            cancelText: t("projectUi.continueEditing" as InterfaceMessageKey),
            onOk: onAddShot,
        });
    };

    const requestDeleteShot = () => {
        const nextShot = shots[shotIndex + 1] || shots[shotIndex - 1];
        modal.confirm({
            title: t("projectUi.deleteNamedShotTitle" as InterfaceMessageKey, { title: watchedTitle || selectedShot.title || t("projectUi.untitledShot" as InterfaceMessageKey) }),
            content: editorDirty
                ? t("projectUi.deleteShotWithUnsavedDescription" as InterfaceMessageKey)
                : t("projectUi.deleteShotDescription" as InterfaceMessageKey),
            okText: t("projectUi.deleteShot" as InterfaceMessageKey),
            okButtonProps: { danger: true },
            cancelText: t("projectUi.cancel" as InterfaceMessageKey),
            centered: true,
            onOk: () => deleteShot.mutateAsync({ shotId: selectedShot.id, nextShotId: nextShot?.id || "" }),
        });
    };

    const selectRelativeShot = (offset: number) => {
        const next = shots[shotIndex + offset];
        if (next) requestShotSelection(next.id);
    };

    return (
        <div className="workflow-production-shell">
            <div className="workflow-production-main">
                <aside className="workflow-library-panel">
                        <SegmentedControl
                        block
                        size="sm"
                        value={leftTab}
                        onChange={(value) => setLeftTab(value as typeof leftTab)}
                        options={[{ value: "episodes", label: t("projectUi.chapters" as InterfaceMessageKey) }, { value: "shots", label: t("projectUi.shots" as InterfaceMessageKey) }, { value: "assets", label: t("projectUi.assets" as InterfaceMessageKey) }]}
                    />
                    <div className="workflow-library-scroll thin-scrollbar">
                        {leftTab === "assets" ? <AssetLibrary detail={detail} referenceByVersionId={referenceByVersionId} changing={changeAssetBinding.isPending} onToggle={(asset, reference) => changeAssetBinding.mutate({ asset, reference })} /> : null}
                        {leftTab === "episodes" ? <EpisodeLibrary detail={detail} activeUnitId={unitId} projectId={projectId} activeStage={activeStage} /> : null}
                        {leftTab === "shots" ? <ShotLibrary detail={detail} shots={shots} selectedShotId={selectedShot.id} onSelectShot={requestShotSelection} /> : null}
                    </div>
                </aside>

                <section className="workflow-shot-editor">
                    <header className="workflow-panel-header">
                        <div className="workflow-shot-heading">
                            <span className="workflow-shot-number">{formatShotOrdinal(shotIndex)}</span>
                            {customShotTitle(watchedTitle || selectedShot.title, shotIndex) ? <h2>{customShotTitle(watchedTitle || selectedShot.title, shotIndex)}</h2> : null}
                            <StatusBadge tone={saveShot.isPending ? "loading" : editorDirty ? "warning" : revision ? "success" : "neutral"} label={saveShot.isPending ? t("projectUi.saving" as InterfaceMessageKey) : editorDirty ? t("projectUi.unsavedChanges" as InterfaceMessageKey) : revision ? t("projectUi.saved" as InterfaceMessageKey) : t("projectUi.draft" as InterfaceMessageKey)} className="m-0" />
                        </div>
                        <div className="flex items-center gap-1"><span className="mr-1 text-[var(--fs-micro)] text-foreground/45">{new Intl.NumberFormat(locale).format(shotIndex + 1)} / {new Intl.NumberFormat(locale).format(shots.length)}</span><Button type="text" size="small" icon={<ChevronLeft className="size-4" />} disabled={shotIndex <= 0} onClick={() => selectRelativeShot(-1)} aria-label={t("projectUi.previousShot" as InterfaceMessageKey)} /><Button type="text" size="small" icon={<ChevronRight className="size-4" />} disabled={shotIndex >= shots.length - 1} onClick={() => selectRelativeShot(1)} aria-label={t("projectUi.nextShot" as InterfaceMessageKey)} /></div>
                    </header>
                    <Form form={form} layout="vertical" className="workflow-shot-form" onValuesChange={() => setEditorDirty(true)} onFinish={(values) => saveShot.mutate(values)}>
                        <div className="workflow-shot-form-scroll thin-scrollbar">
                            <div className="workflow-form-section-heading"><span>{t("projectUi.shotScript" as InterfaceMessageKey)}</span><small>{t("projectUi.shotScriptDescription" as InterfaceMessageKey)}</small></div>
                            <Form.Item name="title" label={t("projectUi.shotName" as InterfaceMessageKey)} rules={[{ required: true, message: t("projectUi.shotNameRequired" as InterfaceMessageKey) }]}><Input placeholder={t("projectUi.shotNamePlaceholder" as InterfaceMessageKey)} /></Form.Item>
                            <Form.Item name="videoPrompt" label={t("projectUi.videoPrompt" as InterfaceMessageKey)} rules={[{ required: true, message: t("projectUi.videoPromptRequired" as InterfaceMessageKey) }]}><ShotAssetMentionTextarea references={shotAssetReferenceContext.mentionReferences} /></Form.Item>
                            <BoundAssets detail={detail} shotId={selectedShot.id} changing={changeAssetBinding.isPending} onUnlink={(reference) => changeAssetBinding.mutate({ reference })} />
                            <div className="workflow-form-grid">
                                <Form.Item name="action" label={t("projectUi.performanceAndAction" as InterfaceMessageKey)}><Input.TextArea autoSize={{ minRows: 3, maxRows: 6 }} placeholder={t("projectUi.performanceAndActionPlaceholder" as InterfaceMessageKey)} /></Form.Item>
                                <Form.Item name="dialogue" label={t("projectUi.dialogueOrNarration" as InterfaceMessageKey)}><Input.TextArea autoSize={{ minRows: 3, maxRows: 6 }} placeholder={t("projectUi.dialoguePlaceholder" as InterfaceMessageKey)} /></Form.Item>
                            </div>
                            <WorkflowDisclosure
                                icon={<SlidersHorizontal />}
                                title={t("projectUi.generationSettings" as InterfaceMessageKey)}
                                description={t("projectUi.generationSettingsDescription" as InterfaceMessageKey)}
                                summary={<><span>{durationSummary}</span><span>{aspectRatio}</span><span>{resolutionSummary}</span><span className="is-model">{modelSummary}</span></>}
                            >
                                <div className="workflow-settings-section">
                                    <div className="workflow-settings-section-title">{t("projectUi.generationSpecification" as InterfaceMessageKey)}</div>
                                    <Form.Item label={t("projectUi.generationModel" as InterfaceMessageKey)}>
                                        <ModelPicker
                                            config={generationConfig}
                                            value={selectedModel}
                                            capability={generationCapability}
                                            requirements={modelRequirements}
                                            onChange={changeGenerationModel}
                                            fullWidth
                                            className="workflow-model-picker"
                                            placeholder={activeStage === "video" ? t("projectUi.selectVideoModel" as InterfaceMessageKey) : t("projectUi.selectImageModel" as InterfaceMessageKey)}
                                            showSelectedPrice
                                        />
                                    </Form.Item>
                                    <Form.Item label={t("projectUi.skillLibrary" as InterfaceMessageKey)}><SkillRuntimePicker profile="shortDrama" skills={availableSkills} loading={skillsLoading} value={selectedSkillIds} onChange={setSelectedSkillIds} /></Form.Item>
                                    <div className="workflow-form-grid is-three">
                                        <Form.Item name="durationSeconds" label={t("projectUi.shotDurationSeconds" as InterfaceMessageKey)}>
                                            {generationCapability === "video" && videoProfile?.duration.selection === "enum"
                                                ? <Select options={videoDurationOptions(videoProfile).map((value) => ({ value, label: t("projectUi.secondsCount" as InterfaceMessageKey, { count: value }) }))} />
                                                : <InputNumber className="w-full" min={generationCapability === "video" ? videoProfile?.duration.min || 1 : 0.5} max={generationCapability === "video" ? videoProfile?.duration.max || 60 : 60} step={generationCapability === "video" ? videoProfile?.duration.step || 1 : 0.5} />}
                                        </Form.Item>
                                        {generationCapability === "video" ? <Form.Item label={t("projectUi.aspectRatio" as InterfaceMessageKey)}><Select value={aspectRatio} onChange={setAspectRatio} options={(videoProfile?.ratios || []).map((value) => ({value, label:value}))} /></Form.Item> : null}
                                        {generationCapability === "video" ? (
                                            <Form.Item label={t("projectUi.resolution" as InterfaceMessageKey)}><Select value={resolution} onChange={setResolution} options={(videoProfile?.resolutions || []).map((value) => ({ value, label: formatVideoResolutionLabel(value) }))} /></Form.Item>
                                        ) : imageProfile?.quality.supported && !imageResolutionUsesQuality(imageProfile) ? (
                                            <Form.Item label={t("projectUi.generationQuality" as InterfaceMessageKey)}><Select value={imageQuality} onChange={setImageQuality} options={imageProfile.quality.values.map((value) => ({ value, label: value.toUpperCase() }))} /></Form.Item>
                                        ) : <div />}
                                    </div>
                                    {generationCapability === "image" && imageProfile ? <ImageSizePicker profile={imageProfile} size={aspectRatio} quality={imageQuality} onChange={(size, quality) => { setAspectRatio(size); if (quality) setImageQuality(quality); }} /> : null}
                                </div>
                                <div className="workflow-settings-section">
                                    <div className="workflow-settings-section-title">{t("projectUi.shotLanguage" as InterfaceMessageKey)}</div>
                                    <div className="workflow-form-grid is-three">
                                        <Form.Item name="shotSize" label={t("projectUi.shotSize" as InterfaceMessageKey)}><Select allowClear placeholder={t("projectUi.automatic" as InterfaceMessageKey)} options={[t("projectUi.shotSizeCloseUp"), t("projectUi.shotSizeMediumClose"), t("projectUi.shotSizeMedium"), t("projectUi.shotSizeWide"), t("projectUi.shotSizeLong")].map((value, index) => ({ value, label: t((["projectUi.shotSizeCloseUp", "projectUi.shotSizeMediumClose", "projectUi.shotSizeMedium", "projectUi.shotSizeWide", "projectUi.shotSizeLong"] as const)[index] as InterfaceMessageKey) }))} /></Form.Item>
                                        <Form.Item name="cameraAngle" label={t("projectUi.cameraAngle" as InterfaceMessageKey)}><Select allowClear placeholder={t("projectUi.automatic" as InterfaceMessageKey)} options={[t("projectUi.cameraAngleEyeLevel"), t("imageNodeUi.highAngle"), t("imageNodeUi.lowAngle"), t("projectUi.cameraAngleSide"), t("projectUi.cameraAngleOverShoulder")].map((value, index) => ({ value, label: t((["projectUi.cameraAngleEyeLevel", "projectUi.cameraAngleHigh", "projectUi.cameraAngleLow", "projectUi.cameraAngleSide", "projectUi.cameraAngleOverShoulder"] as const)[index] as InterfaceMessageKey) }))} /></Form.Item>
                                        <Form.Item name="cameraMovement" label={t("projectUi.cameraMovement" as InterfaceMessageKey)}><Select allowClear placeholder={t("projectUi.automatic" as InterfaceMessageKey)} options={[t("projectUi.cameraMoveStatic"), t("projectUi.cameraMovePush"), t("projectUi.cameraMovePull"), t("projectUi.cameraMovePan"), t("projectUi.cameraMoveTrack"), t("projectUi.cameraMoveFollow")].map((value, index) => ({ value, label: t((["projectUi.cameraMoveStatic", "projectUi.cameraMovePush", "projectUi.cameraMovePull", "projectUi.cameraMovePan", "projectUi.cameraMoveTrack", "projectUi.cameraMoveFollow"] as const)[index] as InterfaceMessageKey) }))} /></Form.Item>
                                    </div>
                                </div>
                            </WorkflowDisclosure>
                            <WorkflowDisclosure
                                className="is-advanced"
                                icon={<WandSparkles />}
                                title={t("projectUi.generationDetails" as InterfaceMessageKey)}
                                description={t("projectUi.generationDetailsDescription" as InterfaceMessageKey)}
                                summary={<span>{t("projectUi.generationDetailsSummary" as InterfaceMessageKey)}</span>}
                            >
                                <div className="workflow-form-grid">
                                    <Form.Item name="plotDescription" label={t("projectUi.shotVisual" as InterfaceMessageKey)} rules={[{ required: true, message: t("projectUi.shotVisualRequired" as InterfaceMessageKey) }]}><ShotAssetMentionTextarea variant="scene" references={shotAssetReferenceContext.mentionReferences} /></Form.Item>
                                    <Form.Item name="imagePrompt" label={t("projectUi.imagePrompt" as InterfaceMessageKey)}><Input.TextArea autoSize={{ minRows: 3, maxRows: 6 }} placeholder={t("projectUi.imagePromptEmptyHint" as InterfaceMessageKey)} /></Form.Item>
                                    <Form.Item name="negativePrompt" label={t("projectUi.exclusions" as InterfaceMessageKey)}><Input.TextArea autoSize={{ minRows: 2, maxRows: 4 }} placeholder={t("projectUi.exclusionsPlaceholder" as InterfaceMessageKey)} /></Form.Item>
                                    <Form.Item name="continuityNotes" label={t("projectUi.continuityNotes" as InterfaceMessageKey)}><Input.TextArea autoSize={{ minRows: 2, maxRows: 4 }} placeholder={t("projectUi.continuityNotesPlaceholder" as InterfaceMessageKey)} /></Form.Item>
                                </div>
                            </WorkflowDisclosure>
                        </div>
                        <footer className="workflow-editor-actions">
                            <div className="workflow-generation-cost" aria-live="polite">
                                {creditsEnabled && formattedGenerationCredits ? <><CreditSymbol /><span title={routeQuote ? modelQuoteDescription(routeQuote) : undefined}>{t(routeQuote?.estimated ? "projectUi.estimatedCost" as InterfaceMessageKey : "projectUi.generationCost" as InterfaceMessageKey, { amount: formattedGenerationCredits })}</span></> : creditsEnabled && routedModel ? <span>{t("projectUi.generationCostCalculatedOnSubmit" as InterfaceMessageKey)}</span> : null}
                            </div>
                            <div className="flex items-center gap-2"><Button danger icon={<Trash2 className="size-4" />} loading={deleteShot.isPending} disabled={saveShot.isPending || selectedShotSubmitting || changeAssetBinding.isPending} onClick={requestDeleteShot}>{t("projectUi.deleteShot" as InterfaceMessageKey)}</Button><Button htmlType="submit" icon={<Save className="size-4" />} loading={saveShot.isPending} disabled={!editorDirty || deleteShot.isPending}>{t("projectUi.saveScript" as InterfaceMessageKey)}</Button><Button type="primary" icon={<Play className="size-4" />} loading={selectedShotSubmitting || shotTask?.status === "queued" || shotTask?.status === "running"} disabled={deleteShot.isPending} onClick={() => void generateArtifact()}>{selectedShotSubmitting ? t("projectUi.generationSubmitting" as InterfaceMessageKey, { action: stageCopy.action }) : shotTask?.status === "queued" || shotTask?.status === "running" ? t("projectUi.generationRunning" as InterfaceMessageKey, { action: stageCopy.action, elapsed: shotTaskElapsed }) : shotTask?.status === "failed" ? t("projectUi.generationFailedRetryAvailable" as InterfaceMessageKey, { action: stageCopy.action }) : shotTask?.status === "succeeded" && !newestArtifact ? t("projectUi.generationCompletedSyncing" as InterfaceMessageKey, { action: stageCopy.action }) : newestArtifact ? t("projectUi.generationCompleted" as InterfaceMessageKey, { action: stageCopy.action }) : stageCopy.action}</Button></div>
                        </footer>
                    </Form>
                </section>

                <aside className="workflow-preview-panel">
                    <header className="workflow-preview-header">
                        <div className="workflow-preview-header-row">
                            <div className="workflow-preview-title"><Film className="size-4 shrink-0" /><span>{t("projectUi.artifactPreview" as InterfaceMessageKey)}</span></div>
<SegmentedControl size="sm" value={previewTab} onChange={(value) => setPreviewTab(value as typeof previewTab)} options={[{ value: "latest", label: t("projectUi.latest" as InterfaceMessageKey) }, { value: "history", label: t("projectUi.historyCount" as InterfaceMessageKey, { count: artifacts.length }) }]} />
                        </div>
<SegmentedControl
                            block
                            size="sm"
                            className="workflow-preview-stage-switch"
                            value={activeStage}
                            options={[{ value: "storyboard", label: t("projectUi.stageStoryboardImage" as InterfaceMessageKey) }, { value: "previz", label: t("projectUi.stageActionPrevisualization" as InterfaceMessageKey) }, { value: "video", label: t("projectUi.stageShotVideo" as InterfaceMessageKey) }]}
                            onChange={(nextStage) => navigate(`/projects/${projectId}/workflow/${unitId}/${nextStage}`)}
                        />
                    </header>
                    <div className="workflow-preview-scroll thin-scrollbar">
                        {previewTab === "latest" ? <LatestPreview artifact={previewArtifact} emptyText={stageCopy.empty} onPreviewImage={setImagePreviewArtifact} /> : <ArtifactHistory artifacts={artifacts} activeId={previewArtifact?.id} onSelect={(artifact) => { setPreviewArtifactId(artifact.id); setPreviewTab("latest"); }} />}
                        <div className="workflow-preview-summary"><div className="flex items-center justify-between gap-2"><span className="text-xs font-medium">{t("projectUi.currentArtifact" as InterfaceMessageKey)}</span><ArtifactStatus artifact={newestArtifact} compact /></div><div className="mt-1 text-[var(--fs-micro)] text-foreground/45">{newestArtifact ? `${formatDuration(selectedShot.durationMs)} · ${resolution}p · v${newestArtifact.version}` : t("projectUi.shotHasNoArtifact" as InterfaceMessageKey)}</div></div>
                        <div className="workflow-preview-actions"><Button icon={<RefreshCcw className="size-3.5" />} loading={selectedShotSubmitting || shotTask?.status === "queued" || shotTask?.status === "running"} onClick={() => void generateArtifact()}>{t("projectUi.regenerate" as InterfaceMessageKey)}</Button><Button icon={<Download className="size-3.5" />} disabled={!previewArtifact?.resourceId} onClick={() => previewArtifact?.resourceId && void downloadArtifact(previewArtifact, selectedShot.title, t, message.error)}>{t("projectUi.downloadType" as InterfaceMessageKey, { type: activeStage === "video" ? t("projectUi.mediaVideo" as InterfaceMessageKey) : t("projectUi.mediaImage" as InterfaceMessageKey) })}</Button></div>
                        <ArtifactHistory artifacts={artifacts.slice(0, 4)} activeId={previewArtifact?.id} onSelect={(artifact) => setPreviewArtifactId(artifact.id)} compact />
                    </div>
                </aside>
            </div>

            <AppModal
                flush
                open={Boolean(imagePreviewArtifact?.resourceId)}
                title={imagePreviewArtifact?.type === "action_board" ? t("projectUi.actionPrevisualizationPreview" as InterfaceMessageKey) : t("projectUi.storyboardImagePreview" as InterfaceMessageKey)}
                footer={null}
                centered
                width="min(960px, calc(100vw - 32px))"
                onCancel={() => setImagePreviewArtifact(null)}
            >
                {imagePreviewArtifact?.resourceId ? <img className={`workflow-image-preview-modal ${imagePreviewArtifact.type === "action_board" ? "grayscale" : ""}`} src={resourceFileUrl(imagePreviewArtifact.resourceId)} alt={imagePreviewArtifact.type === "action_board" ? t("projectUi.actionPrevisualizationFullImage" as InterfaceMessageKey) : t("projectUi.storyboardFullImage" as InterfaceMessageKey)} /> : null}
            </AppModal>

            <ShotTimeline activeStage={activeStage} detail={detail} shots={shots} selectedShotId={selectedShot.id} submittingShotIds={submittingShotIds} onSelectShot={requestShotSelection} onAddShot={requestAddShot} addingShot={addingShot} />
        </div>
    );
}

function formatTaskElapsed(startedAt: number, now: number, t: InterfaceTranslate, locale: string) {
    const totalSeconds = Math.max(0, Math.floor((now - (Number.isFinite(startedAt) ? startedAt : now)) / 1_000));
    return t("projectUi.elapsedMinutesSeconds" as InterfaceMessageKey, { minutes: new Intl.NumberFormat(locale).format(Math.floor(totalSeconds / 60)), seconds: new Intl.NumberFormat(locale, { minimumIntegerDigits: 2 }).format(totalSeconds % 60) });
}

function WorkflowDisclosure({ icon, title, description, summary, className = "", children }: { icon: ReactNode; title: string; description: string; summary: ReactNode; className?: string; children: ReactNode }) {
    return (
        <details className={`workflow-disclosure ${className}`}>
            <summary>
                <span className="workflow-disclosure-heading"><span className="workflow-disclosure-icon">{icon}</span><span><strong>{title}</strong><small>{description}</small></span></span>
                <span className="workflow-disclosure-summary">{summary}<ChevronDown className="workflow-disclosure-chevron" /></span>
            </summary>
            <div className="workflow-disclosure-body"><div className="workflow-disclosure-content">{children}</div></div>
        </details>
    );
}

function AssetLibrary({ detail, referenceByVersionId, changing, onToggle }: { detail: ProjectDetail; referenceByVersionId: Map<string, ShotAssetReference>; changing: boolean; onToggle: (asset: ProjectAsset, reference?: ShotAssetReference) => void }) {
    const { locale, t } = useInterfaceTranslation();
    const [category, setCategory] = useState("all");
    const [keyword, setKeyword] = useState("");
    const debouncedKeyword = useDebouncedValue(keyword.trim(), 250);
    const [page, setPage] = useState(1);
    const pageSize = 30;
    const assetsQuery = useQuery({
        queryKey: ["project", detail.project.id, "assets", "workflow-library", category, debouncedKeyword, page, pageSize],
        queryFn: () => listProjectAssetsPage(detail.project.id, { page, pageSize, category: category === "all" ? undefined : category, query: debouncedKeyword || undefined }),
    });
    useEffect(() => setPage(1), [debouncedKeyword]);
    const assetsPage = assetsQuery.data?.assets || [];
    const groups = useMemo(() => {
        const map = new Map<string, ProjectAsset[]>();
        assetsPage.forEach((asset) => map.set(asset.category || "other", [...(map.get(asset.category || "other") || []), asset]));
        return Array.from(map.entries());
    }, [assetsPage]);
    const total = assetsQuery.data?.total || 0;
    const pages = Math.max(1, Math.ceil(total / pageSize));
    const totalCount = Object.values(assetsQuery.data?.categoryCounts || {}).reduce((sum, count) => sum + count, 0);
    return <div className="workflow-asset-groups"><Input allowClear size="small" className="mb-2 w-full" value={keyword} onChange={(event) => setKeyword(event.target.value)} prefix={<Search className="size-3.5 text-foreground/35" />} placeholder={t("projectUi.searchAssetNames" as InterfaceMessageKey)} aria-label={t("projectUi.searchShotAssets" as InterfaceMessageKey)} /><Select size="small" className="mb-2 w-full" value={category} options={[{ value: "all", label: t("projectUi.allAssetsCount" as InterfaceMessageKey, { count: new Intl.NumberFormat(locale).format(totalCount) }) }, ...Object.entries(assetsQuery.data?.categoryCounts || {}).filter(([, count]) => count > 0).map(([value, count]) => ({ value, label: t("projectUi.assetCategoryCount" as InterfaceMessageKey, { category: assetCategoryLabel(value, t), count: new Intl.NumberFormat(locale).format(count) }) }))]} onChange={(value) => { setCategory(value); setPage(1); }} />{assetsQuery.isLoading ? <div className="py-6 text-center text-xs text-foreground/45">{t("projectUi.loadingAssets" as InterfaceMessageKey)}</div> : groups.length ? groups.map(([groupCategory, assets]) => <section key={groupCategory}><h3>{assetCategoryLabel(groupCategory, t)} <span>({new Intl.NumberFormat(locale).format(assets.length)})</span></h3><div className="workflow-asset-list">{assets.map((asset) => { const reference = asset.primaryVersionId ? referenceByVersionId.get(asset.primaryVersionId) : undefined; const active = Boolean(reference); const previewUrl = assetPreviewUrl(asset); return <button key={asset.id} type="button" className={`workflow-asset-row ${active ? "is-active" : ""}`} disabled={changing || !asset.primaryVersionId} aria-pressed={active} onClick={() => onToggle(asset, reference)}><span className="workflow-asset-thumb">{previewUrl ? <img src={previewUrl} alt="" loading="lazy" /> : asset.category === "character" ? <UsersRound /> : asset.mediaType === "image" ? <ImageIcon /> : <Box />}</span><span className="min-w-0 flex-1"><strong>{asset.title}</strong><small>{active ? t("projectUi.assetBoundClickToUnbind" as InterfaceMessageKey) : t("projectUi.assetVersionCategory" as InterfaceMessageKey, { category: assetCategoryLabel(asset.category, t), version: Math.max(1, asset.versionCount) })}</small></span>{active ? <span className="workflow-bound-dot" /> : null}</button>; })}</div></section>) : <EmptyState size="compact" title={debouncedKeyword ? t("projectUi.noMatchingAssets" as InterfaceMessageKey) : t("projectUi.projectHasNoAssets" as InterfaceMessageKey)} />}{total > pageSize ? <div className="mt-3 flex items-center justify-between border-t border-border/60 pt-2 text-[var(--fs-micro)] text-foreground/45"><span>{t("projectUi.pageOfTotal" as InterfaceMessageKey, { page: new Intl.NumberFormat(locale).format(page), pages: new Intl.NumberFormat(locale).format(pages), count: new Intl.NumberFormat(locale).format(total) })}</span><span className="flex gap-1"><Button type="text" size="small" icon={<ChevronLeft className="size-3.5" />} disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))} /><Button type="text" size="small" icon={<ChevronRight className="size-3.5" />} disabled={page >= pages} onClick={() => setPage((value) => Math.min(pages, value + 1))} /></span></div> : null}</div>;
}

function ShotAssetMentionTextarea({ value = "", onChange = () => undefined, references, variant = "motion" }: { value?: string; onChange?: (value: string) => void; references: ReturnType<typeof buildShotAssetReferenceContext>["mentionReferences"]; variant?: "scene" | "motion" }) {
    const { t } = useInterfaceTranslation();
    const isScene = variant === "scene";
    return (
        <CanvasResourceMentionTextarea
            value={value}
            references={references}
            onChange={onChange}
            sendOnEnter={false}
            containerClassName={`workflow-shot-mention-container ${isScene ? "is-scene" : ""}`}
            className={`thin-scrollbar workflow-shot-mention-editor ${isScene ? "is-scene" : ""}`}
            placeholder={isScene
                ? references.length ? t("projectUi.shotVisualMentionPlaceholder" as InterfaceMessageKey) : t("projectUi.shotVisualNoAssetsPlaceholder" as InterfaceMessageKey)
                : references.length ? t("projectUi.videoPromptMentionPlaceholder" as InterfaceMessageKey) : t("projectUi.videoPromptNoAssetsPlaceholder" as InterfaceMessageKey)}
            aria-label={isScene ? t("projectUi.shotVisualMentionAria" as InterfaceMessageKey) : t("projectUi.videoPromptMentionAria" as InterfaceMessageKey)}
        />
    );
}

function EpisodeLibrary({ detail, activeUnitId, projectId, activeStage }: { detail: ProjectDetail; activeUnitId: string; projectId: string; activeStage: ShortDramaWorkflowStage }) {
    return <div className="workflow-simple-list">{detail.units.slice().sort((left, right) => left.position - right.position).map((unit, index) => <Link key={unit.id} to={`/projects/${projectId}/workflow/${unit.id}/${activeStage}`} className={unit.id === activeUnitId ? "is-active" : ""}><span>{String(index + 1).padStart(2, "0")}</span><strong>{unit.title}</strong></Link>)}</div>;
}

function ShotLibrary({ detail, shots, selectedShotId, onSelectShot }: { detail: ProjectDetail; shots: ProjectShot[]; selectedShotId: string; onSelectShot: (id: string) => void }) {
    const { t } = useInterfaceTranslation();
    return <div className="workflow-simple-list">{shots.map((shot, index) => { const video = currentArtifact(detail, shot.id, "video"); return <button key={shot.id} type="button" className={shot.id === selectedShotId ? "is-active" : ""} onClick={() => onSelectShot(shot.id)}><span>{formatShotOrdinal(index)}</span><span className="min-w-0 flex-1"><strong>{customShotTitle(shot.title, index) || t("projectUi.untitledShot" as InterfaceMessageKey)}</strong><small>{formatDuration(shot.durationMs)}</small></span><ArtifactStatus artifact={video} compact /></button>; })}</div>;
}

function BoundAssets({ detail, shotId, changing, onUnlink }: { detail: ProjectDetail; shotId: string; changing: boolean; onUnlink: (reference: ShotAssetReference) => void }) {
    const { t } = useInterfaceTranslation();
    const references = (detail.shotReferences || []).filter((item) => item.shotId === shotId);
    const assetByVersionId = useMemo(() => new Map(detail.assets.filter((asset) => asset.primaryVersionId).map((asset) => [asset.primaryVersionId as string, asset])), [detail.assets]);
    return (
        <div className="workflow-bound-assets">
            <div className="workflow-bound-assets-heading"><span className="workflow-field-label">{t("projectUi.shotAssets" as InterfaceMessageKey)}</span><small>{references.length ? t("projectUi.boundItemCount" as InterfaceMessageKey, { count: references.length }) : t("projectUi.clickLeftAssetsToBind" as InterfaceMessageKey)}</small></div>
            <Image.PreviewGroup>
                <div className="workflow-bound-assets-content">
                    {references.length ? references.map((reference) => {
                        const asset = reference.asset || assetByVersionId.get(reference.assetVersionId);
                        const title = asset?.title || t("projectUi.historicalAssetVersion" as InterfaceMessageKey);
                        const previewUrl = asset ? assetPreviewUrl(asset) : "";
                        return <div key={reference.id} className="workflow-bound-asset-chip">
                            <span className="workflow-bound-asset-preview">{previewUrl ? <Image src={previewUrl} alt={t("projectUi.previewNamedAsset" as InterfaceMessageKey, { name: title })} width={40} height={40} loading="lazy" preview={{ mask: t("projectUi.preview" as InterfaceMessageKey) }} /> : <Box aria-hidden />}</span>
                            <span className="workflow-bound-asset-copy"><em>{asset ? assetCategoryLabel(asset.category, t) : t("projectUi.history" as InterfaceMessageKey)}</em><strong title={title}>{title}</strong></span>
                            <button type="button" disabled={changing} aria-label={t("projectUi.removeAssetReference" as InterfaceMessageKey, { name: title })} onClick={() => onUnlink(reference)}><X aria-hidden /></button>
                        </div>;
                    }) : <span>{t("projectUi.noCharactersScenesOrPropsBound" as InterfaceMessageKey)}</span>}
                </div>
            </Image.PreviewGroup>
        </div>
    );
}

function LatestPreview({ artifact, emptyText, onPreviewImage }: { artifact?: ShotArtifact; emptyText: string; onPreviewImage: (artifact: ShotArtifact) => void }) {
    const { t } = useInterfaceTranslation();
    if (!artifact?.resourceId) return <div className="workflow-media-empty"><span><Play className="size-7" /></span><p>{emptyText}</p></div>;
    const src = resourceFileUrl(artifact.resourceId);
    if (artifact.type === "video") return <VideoArtifactPreview src={src} title={t("projectUi.stageShotVideo" as InterfaceMessageKey)} />;
    return <button type="button" className="workflow-preview-media-button" onClick={() => onPreviewImage(artifact)} aria-label={artifact.type === "action_board" ? t("projectUi.previewActionPrevisualization" as InterfaceMessageKey) : t("projectUi.previewStoryboardImage" as InterfaceMessageKey)}>
        <img className={`workflow-preview-media ${artifact.type === "action_board" ? "grayscale" : ""}`} src={src} alt={t("projectUi.shotGenerationPreview" as InterfaceMessageKey)} loading="eager" />
        <span className="workflow-preview-expand" aria-hidden="true"><Maximize2 className="size-4" /></span>
    </button>;
}

function VideoArtifactPreview({ src, title }: { src: string; title: string }) {
    const { t } = useInterfaceTranslation();
    const [playing, setPlaying] = useState(false);

    useEffect(() => {
        setPlaying(false);
    }, [src]);

    if (playing) return <video className="workflow-preview-media" src={src} controls autoPlay playsInline preload="metadata" aria-label={title} />;
    return <button type="button" className="workflow-preview-media-button workflow-video-poster" onClick={() => setPlaying(true)} aria-label={t("projectUi.clickToPlayNamedVideo" as InterfaceMessageKey, { name: title })}>
        <span className="workflow-preview-media workflow-video-placeholder" aria-hidden="true"><Film /></span>
        <span className="workflow-video-play" aria-hidden="true"><Play className="size-6" fill="currentColor" /></span>
    </button>;
}

function ArtifactHistory({ artifacts, activeId, onSelect, compact = false }: { artifacts: ShotArtifact[]; activeId?: string; onSelect: (artifact: ShotArtifact) => void; compact?: boolean }) {
    const { locale, t } = useInterfaceTranslation();
    if (!artifacts.length) return compact ? null : <EmptyState size="compact" title={t("projectUi.noVersionHistory" as InterfaceMessageKey)} />;
    return <section className={`workflow-history ${compact ? "is-compact" : ""}`}><div className="workflow-history-title">{t("projectUi.versionHistory" as InterfaceMessageKey)}</div>{artifacts.map((artifact) => <button key={artifact.id} type="button" className={artifact.id === activeId ? "is-active" : ""} onClick={() => onSelect(artifact)}>{artifact.resourceId ? artifact.type === "video" ? <video src={resourceFileUrl(artifact.resourceId)} muted preload="metadata" /> : <img src={resourceFileUrl(artifact.resourceId)} alt="" loading="lazy" /> : <span className="workflow-history-placeholder"><Layers3 /></span>}<span className="min-w-0 flex-1"><strong>v{artifact.version}{artifact.selected ? ` · ${t("projectUi.current" as InterfaceMessageKey)}` : ""}</strong><small>{new Date(artifact.createdAt).toLocaleString(locale, { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}</small></span><ArtifactStatus artifact={artifact} compact /></button>)}</section>;
}

function ShotTimeline({ activeStage, detail, shots, selectedShotId, submittingShotIds, onSelectShot, onAddShot, addingShot }: { activeStage: ShortDramaWorkflowStage; detail: ProjectDetail; shots: ProjectShot[]; selectedShotId: string; submittingShotIds: Set<string>; onSelectShot: (id: string) => void; onAddShot: () => void; addingShot: boolean }) {
    const { locale, t } = useInterfaceTranslation();
    const artifactType = artifactTypeForStage(activeStage);
    const latestTaskByShotId = useMemo(() => {
        const tasks = new Map<string, GenerationTask>();
        for (const task of detail.tasks || []) {
            const shotId = task.clientContext?.shotId;
            if (!shotId || task.clientContext?.artifactType !== artifactType) continue;
            const current = tasks.get(shotId);
            if (!current || task.updatedAt > current.updatedAt) tasks.set(shotId, task);
        }
        return tasks;
    }, [artifactType, detail.tasks]);
    return <section className="workflow-shot-timeline"><header><div><strong>{detail.units.find((item) => item.id === shots[0]?.unitId)?.title || t("projectUi.currentEpisode" as InterfaceMessageKey)}</strong><span>{t("projectUi.shotTimelineSummary" as InterfaceMessageKey, { count: new Intl.NumberFormat(locale).format(shots.length), duration: formatDuration(shots.reduce((total, item) => total + item.durationMs, 0)) })}</span></div><div className="flex items-center gap-1 text-[var(--fs-micro)] text-foreground/40"><List className="size-3.5" /> {t("projectUi.shotCount" as InterfaceMessageKey, { count: new Intl.NumberFormat(locale).format(shots.length) })}</div></header><div className="workflow-shot-track thin-scrollbar">{shots.map((shot, index) => <TimelineShot key={shot.id} artifactType={artifactType} detail={detail} shot={shot} task={latestTaskByShotId.get(shot.id)} submitting={submittingShotIds.has(shot.id)} index={index} selected={shot.id === selectedShotId} onSelect={() => onSelectShot(shot.id)} />)}<button type="button" className="workflow-add-shot-card" disabled={addingShot} onClick={onAddShot}><Plus className="size-5" /><span>{t("projectUi.addShot" as InterfaceMessageKey)}</span></button></div></section>;
}

function TimelineShot({ artifactType, detail, shot, task, submitting, index, selected, onSelect }: { artifactType: string; detail: ProjectDetail; shot: ProjectShot; task?: GenerationTask; submitting: boolean; index: number; selected: boolean; onSelect: () => void }) {
    const { t } = useInterfaceTranslation();
    const video = currentArtifact(detail, shot.id, "video");
    const previz = currentArtifact(detail, shot.id, "action_board");
    const storyboard = currentArtifact(detail, shot.id, "storyboard");
    const preview = video?.resourceId ? video : previz?.resourceId ? previz : storyboard?.resourceId ? storyboard : undefined;
    const stateArtifact = artifactType === "video" ? video : artifactType === "action_board" ? previz : storyboard;
    const revision = currentRevision(detail, shot);
    const stageLabel = artifactType === "video" ? t("projectUi.stageShotVideo" as InterfaceMessageKey) : artifactType === "action_board" ? t("projectUi.stageActionPrevisualization" as InterfaceMessageKey) : t("projectUi.stageStoryboardImage" as InterfaceMessageKey);
    const shotSizeLabels: Record<string, string> = { "特写": t("projectUi.shotSizeCloseUp" as InterfaceMessageKey), "近景": t("projectUi.shotSizeMediumClose" as InterfaceMessageKey), "中景": t("projectUi.shotSizeMedium" as InterfaceMessageKey), "全景": t("projectUi.shotSizeWide" as InterfaceMessageKey), "远景": t("projectUi.shotSizeLong" as InterfaceMessageKey) };
    const cameraMovementLabels: Record<string, string> = { "固定": t("projectUi.cameraMoveStatic" as InterfaceMessageKey), "推镜": t("projectUi.cameraMovePush" as InterfaceMessageKey), "拉镜": t("projectUi.cameraMovePull" as InterfaceMessageKey), "摇镜": t("projectUi.cameraMovePan" as InterfaceMessageKey), "移镜": t("projectUi.cameraMoveTrack" as InterfaceMessageKey), "跟拍": t("projectUi.cameraMoveFollow" as InterfaceMessageKey) };
    const cameraMeta = [revision?.shotSize ? shotSizeLabels[revision.shotSize] || revision.shotSize : "", revision?.cameraMovement ? cameraMovementLabels[revision.cameraMovement] || revision.cameraMovement : ""].filter(Boolean).join(" · ") || t("projectUi.waitingForShotParameters" as InterfaceMessageKey);
    return <button type="button" className={`workflow-timeline-shot ${selected ? "is-active" : ""}`} onClick={onSelect}><span className="workflow-timeline-media">{preview?.resourceId && preview.type !== "video" ? <img src={resourceFileUrl(preview.resourceId)} alt="" loading="lazy" /> : <Film />}</span><span className="workflow-timeline-copy"><span className="workflow-timeline-heading"><strong>{formatShotOrdinal(index)}</strong><b>{formatDuration(shot.durationMs)}</b></span>{customShotTitle(shot.title, index) ? <em className="workflow-timeline-title">{customShotTitle(shot.title, index)}</em> : null}<small className="workflow-timeline-meta">{cameraMeta}</small><span className="workflow-timeline-status"><span>{stageLabel}{stateArtifact ? ` · v${stateArtifact.version}` : ""}</span><ArtifactStatus artifact={stateArtifact} taskStatus={submitting ? "queued" : task?.status} compact /></span></span></button>;
}

function revisionInput(values: ShotEditorValues): ShotRevisionInput {
    return {
        plotDescription: values.plotDescription,
        action: values.action,
        dialogue: values.dialogue,
        shotSize: values.shotSize,
        cameraAngle: values.cameraAngle,
        cameraMovement: values.cameraMovement,
        durationMs: Math.round(values.durationSeconds * 1000),
        imagePrompt: values.imagePrompt,
        videoPrompt: values.videoPrompt,
        negativePrompt: values.negativePrompt,
        continuityNotes: values.continuityNotes,
    };
}

async function downloadArtifact(artifact: ShotArtifact, shotTitle: string, t: InterfaceTranslate, onError: (content: string) => void) {
    if (!artifact.resourceId) return;
    try {
        await downloadBrowserMedia({
            storageKey: resourceStorageKey(artifact.resourceId),
            fileName: `${shotTitle || "shot"}-v${artifact.version}.${artifact.type === "video" ? "mp4" : "png"}`,
        });
    } catch (error) {
        onError(error instanceof Error ? t("projectUi.downloadFailedWithReason" as InterfaceMessageKey, { reason: error.message }) : t("projectUi.downloadFailed" as InterfaceMessageKey));
    }
}

function assetPreviewUrl(asset: ProjectAsset) {
    const representation = asset.character?.representations?.find((item) => item.role === "primary") || asset.character?.representations?.[0];
    if (representation?.resourceId) return resourceFileUrl(representation.resourceId);
    const resourceId = resourceIdFromStorageKey(asset.storageKey);
    return resourceId && asset.mediaType === "image" ? resourceFileUrl(resourceId) : "";
}
