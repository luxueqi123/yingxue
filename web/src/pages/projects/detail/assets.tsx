import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useSearchParams } from "react-router";
import { keepPreviousData, useMutation, useMutationState, useQuery, useQueryClient } from "@tanstack/react-query";
import { App, Button, Dropdown, Form, Input, Modal, Popconfirm, Tabs, type FormInstance } from "antd";
import { Box, Check, ChevronDown, Download, FileText, FolderOpen, FolderPlus, Image as ImageIcon, Link2, MoreHorizontal, MoveRight, Music2, Pencil, Plus, RefreshCw, Search, Sparkles, Trash2, Upload, UserRound, Video, VolumeX } from "lucide-react";

import { WorkspaceState } from "@/components/layout/workspace-state";
import { PaginationBar } from "@/components/layout/workspace-page";
import { AssetMediaPreview } from "@/components/asset-media-preview";
import { CachedResourceImage } from "@/components/cached-resource-image";
import { AssetLibraryCard, AssetLibraryCardMedia } from "@/components/assets/asset-library-card";
import { AssetLibraryPickerModal, type AssetLibraryPickerItem } from "@/components/assets/asset-library-picker-modal";
import { useExternalAssetSources } from "@/hooks/use-external-asset-sources";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { CanvasFolderPreview } from "@/components/canvas/canvas-folder-preview";
import { CANVAS_FOLDER_THEME_OPTIONS, resolveCanvasFolderTheme } from "@/lib/canvas/canvas-folder-theme";
import { resolveProjectCanvasStyle } from "@/components/canvas/canvas-style-picker-modal";
import { CHARACTER_VOICE_FORMAT_LABEL, CHARACTER_VOICE_UPLOAD_ACCEPT, characterVoiceFormatName, characterVoiceTitleFromFileName, isSupportedCharacterVoiceFile } from "@/lib/character-voice-formats";
import { ASSET_CATEGORIES, defaultAssetCategoryForKind, normalizeAssetCategory } from "@/lib/asset-category";
import { resourceFileUrl, resourceIdFromStorageKey, resourceStorageKey } from "@/services/api/resources";
import { downloadBrowserMedia } from "@/services/browser-download";
import { uploadMediaFile } from "@/services/file-storage";
import {
    bindProjectCharacterVoice,
    confirmProjectAssetCandidate,
    createProjectAssetFolder,
    createProjectAssetVersion,
    createProjectCharacter,
    deleteProjectAssetFolder,
    getProjectCharacter,
    linkProjectAsset,
    listProjectAssetCandidates,
    listProjectAssetFolders,
    listProjectAssetsPage,
    moveProjectAsset,
    replaceProjectCharacterRepresentations,
    unbindProjectCharacterVoice,
    unlinkProjectAsset,
    updateProjectAssetCategory,
    updateProjectAssetFolder,
    updateProjectCharacter,
    type ProjectAsset,
    type ProjectAssetFolder,
} from "@/services/api/projects";
import { saveRemoteUserDataNow } from "@/services/user-data-sync";
import { useAssetStore, type Asset, type AssetCategory, type AssetStatus, type EntityAsset, type ImageAsset } from "@/stores/use-asset-store";
import { useConfigStore, useEffectiveConfig } from "@/stores/use-config-store";
import type { InterfaceMessageKey, InterfaceTranslate } from "@/lib/interface-locale";
import { useInterfaceTranslation } from "@/stores/use-interface-locale-store";
import { CanvasNodeType, type CanvasFolderStyle, type CanvasFolderTheme, type CanvasNodeData } from "@/types/canvas";

import { ProjectCharacterCard } from "./project-character-card";
import { projectCharacterCover } from "./project-character-cover";
import { linkSelectedProjectAssets } from "./project-asset-linking";
import { generateCharacterTurnaround } from "./project-character-media";
import { categoryLabels, categoryLabel, mediaLabel, StatusPill, formatTime, textValue, type ProjectDetailViewProps } from "./shared";

const categories = ["all", ...ASSET_CATEGORIES];
const ALL_FOLDERS = "__all_folders__";
const characterFields = [
    ["role", "projectUi.characterFieldRole"], ["aliases", "projectUi.characterFieldAliases"], ["appearance", "projectUi.characterFieldAppearance"], ["physique", "projectUi.characterFieldPhysique"],
    ["clothing", "projectUi.characterFieldClothing"], ["personality", "projectUi.characterFieldPersonality"], ["props", "projectUi.characterFieldProps"],
    ["consistencyPrompt", "projectUi.characterFieldConsistency"], ["multiViewPrompt", "projectUi.characterFieldTurnaround"],
    ["voiceLanguage", "projectUi.characterFieldVoiceLanguage"], ["voiceAge", "projectUi.characterFieldVoiceAge"], ["voiceTimbre", "projectUi.characterFieldVoiceTimbre"],
] as const;

type CharacterForm = { name: string } & Record<(typeof characterFields)[number][0], string>;

export default function ProjectAssetsView({ detail, refreshProject }: ProjectDetailViewProps) {
    const { message, modal } = App.useApp();
    const { locale, t } = useInterfaceTranslation();
    const tRef = useRef(t);
    tRef.current = t;
    const pickerCategoryLabels = { all: t("projectUi.allAssets" as InterfaceMessageKey), ...Object.fromEntries(Object.entries(categoryLabels).map(([value, key]) => [value, t(key)])) };
    const personalAssets = useAssetStore((state) => state.assets);
    const addAsset = useAssetStore((state) => state.addAsset);
    const updatePersonalAsset = useAssetStore((state) => state.updateAsset);
    const effectiveConfig = useEffectiveConfig();
    const isAiConfigReady = useConfigStore((state) => state.isAiConfigReady);
    const [searchParams, setSearchParams] = useSearchParams();
    const requestedCategory = searchParams.get("category") || "all";
    const category = categories.includes(requestedCategory) ? requestedCategory : "all";
    const setCategory = (value: string) => {
        const next = new URLSearchParams(searchParams);
        if (value === "all") next.delete("category");
        else next.set("category", value);
        setSearchParams(next, { replace: true });
    };
    const [folderId, setFolderId] = useState(category === "all" ? "" : ALL_FOLDERS);
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(40);
    const [candidatePage, setCandidatePage] = useState(1);
    const [keyword, setKeyword] = useState("");
    const debouncedKeyword = useDebouncedValue(keyword.trim(), 250);
    const candidatePageSize = 24;
    const [folderEditor, setFolderEditor] = useState<{ folder?: ProjectAssetFolder; parentId: string } | null>(null);
    const [folderName, setFolderName] = useState("");
    const [addOpen, setAddOpen] = useState(false);
    const [editorAsset, setEditorAsset] = useState<ProjectAsset | "new" | null>(null);
    const [imageAsset, setImageAsset] = useState<ProjectAsset | null>(null);
    const externalAssetSources = useExternalAssetSources(addOpen || Boolean(imageAsset));
    const [voiceAsset, setVoiceAsset] = useState<ProjectAsset | null>(null);
    const [previewAsset, setPreviewAsset] = useState<ProjectAsset | null>(null);
    const [voiceSample, setVoiceSample] = useState<{ resourceId: string; name: string; url: string } | null>(null);
    const [voicePickerOpen, setVoicePickerOpen] = useState(false);
    const [voiceInstructions, setVoiceInstructions] = useState("");
    const [form] = Form.useForm<CharacterForm>();
    const queryClient = useQueryClient();

    const assetsQuery = useQuery({
        queryKey: ["project", detail.project.id, "assets", page, pageSize, category, folderId, debouncedKeyword],
        queryFn: () => listProjectAssetsPage(detail.project.id, {
            page,
            pageSize,
            category: category === "all" ? undefined : category,
            folderId: folderId === ALL_FOLDERS ? undefined : folderId,
            query: debouncedKeyword || undefined,
        }),
        placeholderData: keepPreviousData,
    });
    const foldersQuery = useQuery({ queryKey: ["project", detail.project.id, "asset-folders"], queryFn: () => listProjectAssetFolders(detail.project.id) });
    // 左侧分类计数不能依赖跟随当前 tab 的候选查询，否则"角色"的数字会随所在 tab 的待确认数漂移；
    // 这里独立取"全部待确认"和"角色待确认"两个总数，计数与当前所处分类解耦。
    const pendingCountQuery = useQuery({
        queryKey: ["project", detail.project.id, "asset-candidates", "pending-count"],
        queryFn: () => listProjectAssetCandidates(detail.project.id, { page: 1, pageSize: 1, status: "pending_confirmation" }),
    });
    const characterPendingCountQuery = useQuery({
        queryKey: ["project", detail.project.id, "asset-candidates", "character-pending-count"],
        queryFn: () => listProjectAssetCandidates(detail.project.id, { page: 1, pageSize: 1, category: "character", status: "pending_confirmation" }),
    });
    // 章节提取会产出角色、场景和道具三类候选；待确认列表必须跟随当前分类，否则非角色候选永远无法确认。
    const candidateCategory = category === "all" ? undefined : category;
    const candidateLabel = category === "all" ? t("projectUi.asset" as InterfaceMessageKey) : categoryLabel(category, t);
    const showPendingCandidates = folderId === ALL_FOLDERS;
    const candidatesQuery = useQuery({
        queryKey: ["project", detail.project.id, "asset-candidates", candidatePage, candidatePageSize, candidateCategory || "all", "pending_confirmation", debouncedKeyword],
        queryFn: () => listProjectAssetCandidates(detail.project.id, { page: candidatePage, pageSize: candidatePageSize, category: candidateCategory, status: "pending_confirmation", query: debouncedKeyword || undefined }),
    });
    const assets = assetsQuery.data?.assets || [];
    const assetFolders = foldersQuery.data?.folders || [];
    const pendingCandidates = candidatesQuery.data?.candidates || [];
    const categoryCountMap = assetsQuery.data?.categoryCounts || {};
    const folderCountMap = assetsQuery.data?.folderCounts || {};
    const totalAssetCount = Object.values(categoryCountMap).reduce((total, count) => total + count, 0);
    const characterAssetCount = categoryCountMap.character || 0;
    const mediaAssetCount = Math.max(0, totalAssetCount - characterAssetCount);

    useEffect(() => {
        if (!assetsQuery.data) return;
        const lastPage = Math.max(1, Math.ceil(assetsQuery.data.total / pageSize));
        if (page > lastPage) setPage(lastPage);
    }, [assetsQuery.data, page, pageSize]);
    useEffect(() => {
        if (!candidatesQuery.data) return;
        const lastPage = Math.max(1, Math.ceil(candidatesQuery.data.total / candidatePageSize));
        if (candidatePage > lastPage) setCandidatePage(lastPage);
    }, [candidatePage, candidatesQuery.data]);
    useEffect(() => {
        setPage(1);
        setCandidatePage(1);
    }, [debouncedKeyword, category]);

    const selectFolder = (nextFolderId: string) => {
        setFolderId(nextFolderId);
        setCategory("all");
        setPage(1);
    };
    const selectCategory = (nextCategory: string) => {
        setCategory(nextCategory);
        setFolderId(ALL_FOLDERS);
        setPage(1);
        // 待确认列表跟随分类后，不同分类的候选数量不同，切分类必须回到第 1 页。
        setCandidatePage(1);
    };

    const projectAssetIds = new Set(assets.map((asset) => asset.id));
    const availableAssets = personalAssets.filter((asset) => !projectAssetIds.has(asset.id));
    const imageAssets = personalAssets.filter((asset): asset is ImageAsset => asset.kind === "image");
    const availablePickerItems = useMemo<AssetLibraryPickerItem[]>(() => [
        ...availableAssets.map((asset) => ({
            id: asset.id,
            title: asset.title,
            category: normalizeAssetCategory(asset.category, defaultAssetCategoryForKind(asset.kind)),
            kindLabel: mediaLabel(asset.kind, t),
            asset,
            description: asset.note,
            searchText: (asset.tags || []).join(" "),
        })),
        ...externalAssetSources.items,
    ], [availableAssets, externalAssetSources.items, t]);
    const imagePickerItems = useMemo<AssetLibraryPickerItem[]>(() => [
        ...imageAssets.map((asset) => ({
            id: asset.id,
            title: asset.title,
            category: normalizeAssetCategory(asset.category, defaultAssetCategoryForKind(asset.kind)),
            kindLabel: t("projectUi.mediaImage" as InterfaceMessageKey),
            asset,
            searchText: (asset.tags || []).join(" "),
        })),
        ...externalAssetSources.items.filter((item) => item.external?.item.kind === "image"),
    ], [externalAssetSources.items, imageAssets, t]);
    const characterAssets = assets.filter((asset) => asset.category === "character" && asset.character);
    const currentFolder = assetFolders.find((folder) => folder.id === folderId);
    const childFolders = folderId === ALL_FOLDERS ? [] : assetFolders.filter((folder) => (folder.parentId || "") === folderId);
    const visibleAssets = assets;
    const folderPath = useMemo(() => projectAssetFolderPath(assetFolders, folderId), [assetFolders, folderId]);
    const folderMoveItems = useMemo(() => [
        { key: "", label: t("projectUi.assetLibraryRoot" as InterfaceMessageKey) },
        ...assetFolders.map((folder) => ({ key: folder.id, label: projectAssetFolderLabel(assetFolders, folder) })),
    ], [assetFolders, t]);
    const categoryCounts = categories.map((value) => ({
        value,
        count: value === "all"
            ? totalAssetCount + (pendingCountQuery.data?.total || 0)
            : (categoryCountMap[value] || 0) + (value === "character" ? characterPendingCountQuery.data?.total || 0 : 0),
    }));
    const audioPickerItems = useMemo<AssetLibraryPickerItem[]>(() => {
        const localItems = personalAssets.flatMap((asset) => {
            if (asset.kind !== "audio") return [];
            const resourceId = resourceIdFromStorageKey(asset.data.storageKey);
            if (!resourceId) return [];
            return [{ id: asset.id, title: asset.title, category: "audio", kindLabel: t("projectUi.audioKindNamed" as InterfaceMessageKey, { name: characterVoiceFormatName(asset.data.mimeType) }), asset, description: asset.note || t("projectUi.audioFromAssetLibrary" as InterfaceMessageKey), searchText: (asset.tags || []).join(" ") }];
        });
        const projectItems = assets.flatMap((asset) => {
            if (asset.mediaType !== "audio") return [];
            const resourceId = resourceIdFromStorageKey(asset.storageKey);
            if (!resourceId || localItems.some((item) => item.id === asset.id)) return [];
            return [{ id: asset.id, title: asset.title, category: "audio", kindLabel: t("projectUi.audioAsset" as InterfaceMessageKey), description: asset.previewText || t("projectUi.projectAudioAsset" as InterfaceMessageKey), searchText: asset.title, disabledReason: undefined, folderId: asset.folderId, imageUrl: undefined }];
        });
        return [...localItems, ...projectItems];
    }, [assets, personalAssets, t]);
    const audioResourceByItemId = useMemo(() => new Map([
        ...personalAssets.flatMap((asset) => asset.kind === "audio" ? [[asset.id, resourceIdFromStorageKey(asset.data.storageKey)] as const] : []),
        ...assets.flatMap((asset) => asset.mediaType === "audio" ? [[asset.id, resourceIdFromStorageKey(asset.storageKey)] as const] : []),
    ].filter((entry): entry is readonly [string, string] => Boolean(entry[1]))), [assets, personalAssets]);
    const generatingAssets = useMutationState({
        filters: { mutationKey: ["project-character-turnaround", detail.project.id], status: "pending" },
        select: (mutation) => mutation.state.variables as ProjectAsset | undefined,
    });
    const generatingAssetIds = new Set(generatingAssets.map((asset) => asset?.id).filter((id): id is string => Boolean(id)));

    const done = (key: string, values?: Record<string, string | number>) => { refreshProject(); message.success(tRef.current(key as InterfaceMessageKey, values)); };
    const failed = (key: string) => (error: unknown) => message.error(error instanceof Error ? error.message : tRef.current(key as InterfaceMessageKey));
    const addMutation = useMutation({
        mutationFn: async ({ ids, nextFolderId }: { ids: string[]; nextFolderId?: string }) => {
            const result = await linkSelectedProjectAssets(ids, async (id) => {
                const pickerItem = availablePickerItems.find((item) => item.id === id);
                if (pickerItem?.external) {
                    const imported = await externalAssetSources.importExternalAsset(pickerItem.external);
                    const assetId = addAsset(imported);
                    return linkProjectAsset(detail.project.id, {
                        assetId,
                        category: normalizeAssetCategory(imported.category, defaultAssetCategoryForKind(imported.kind)),
                        folderId: nextFolderId,
                    });
                }
                const selected = pickerItem?.asset || useAssetStore.getState().assets.find((asset) => asset.id === id);
                if (!selected) throw new Error(tRef.current("projectUi.assetNotFoundSelectAgain" as InterfaceMessageKey));
                return linkProjectAsset(detail.project.id, {
                    assetId: selected.id,
                    category: normalizeAssetCategory(selected.category, defaultAssetCategoryForKind(selected.kind)),
                    folderId: nextFolderId,
                });
            });
            return {
                assets: result.linked.map((item) => item.asset),
                failedCount: result.failedCount,
            };
        },
        onSuccess: ({ assets, failedCount }) => {
            assets.forEach((asset) => updatePersonalAsset(asset.id, { category: asset.category as AssetCategory, status: asset.status as AssetStatus, primaryVersionId: asset.primaryVersionId }));
            setAddOpen(false);
            refreshProject();
            if (failedCount) message.warning(tRef.current("projectUi.assetsLinkedWithFailures" as InterfaceMessageKey, { linked: assets.length, failed: failedCount }));
            else message.success(tRef.current("projectUi.assetsLinked" as InterfaceMessageKey, { count: assets.length }));
        },
        onError: failed("projectUi.assetLinkFailed"),
    });
    const versionMutation = useMutation({ mutationFn: (id: string) => createProjectAssetVersion(detail.project.id, id, {}), onSuccess: () => done("projectUi.assetVersionCreated"), onError: failed("projectUi.assetVersionCreateFailed") });
    const unlinkMutation = useMutation({ mutationFn: (id: string) => unlinkProjectAsset(detail.project.id, id), onSuccess: () => done("projectUi.assetRemovedFromProject"), onError: failed("projectUi.assetRemovalFailed") });
    const categoryMutation = useMutation({ mutationFn: ({ id, next }: { id: string; next: AssetCategory }) => updateProjectAssetCategory(detail.project.id, id, next), onSuccess: ({ asset }) => { updatePersonalAsset(asset.id, { category: asset.category }); done("projectUi.assetCategoryUpdated"); }, onError: failed("projectUi.assetCategoryUpdateFailed") });
    const moveMutation = useMutation({ mutationFn: ({ id, nextFolderId }: { id: string; nextFolderId: string }) => moveProjectAsset(detail.project.id, id, nextFolderId), onSuccess: () => done("projectUi.assetMoved"), onError: failed("projectUi.assetMoveFailed") });
    const createFolderMutation = useMutation({
        mutationFn: ({ name, parentId }: { name: string; parentId: string }) => createProjectAssetFolder(detail.project.id, { name, parentId: parentId || undefined }),
        onSuccess: ({ folder }) => { setFolderEditor(null); setFolderName(""); setFolderId(folder.parentId || ""); done("projectUi.folderCreated"); },
        onError: failed("projectUi.folderCreateFailed"),
    });
    const renameFolderMutation = useMutation({
        mutationFn: ({ id, name }: { id: string; name: string }) => updateProjectAssetFolder(detail.project.id, id, { name }),
        onSuccess: () => { setFolderEditor(null); setFolderName(""); done("projectUi.folderRenamed"); },
        onError: failed("projectUi.folderRenameFailed"),
    });
    const styleFolderMutation = useMutation({
        mutationFn: ({ id, style }: { id: string; style: CanvasFolderStyle }) => updateProjectAssetFolder(detail.project.id, id, { style }),
        onSuccess: () => done("projectUi.folderStyleUpdated"),
        onError: failed("projectUi.folderStyleUpdateFailed"),
    });
    const themeFolderMutation = useMutation({
        mutationFn: ({ id, theme }: { id: string; theme: CanvasFolderTheme }) => updateProjectAssetFolder(detail.project.id, id, { theme }),
        onSuccess: () => done("projectUi.folderThemeUpdated"),
        onError: failed("projectUi.folderThemeUpdateFailed"),
    });
    const moveFolderMutation = useMutation({
        mutationFn: ({ id, parentId }: { id: string; parentId: string }) => updateProjectAssetFolder(detail.project.id, id, { parentId }),
        onSuccess: () => done("projectUi.folderMoved"),
        onError: failed("projectUi.folderMoveFailed"),
    });
    const deleteFolderMutation = useMutation({
        mutationFn: (id: string) => deleteProjectAssetFolder(detail.project.id, id),
        onSuccess: (_, deletedId) => { if (folderId === deletedId) setFolderId(""); done("projectUi.folderDeleted"); },
        onError: failed("projectUi.folderDeleteFailed"),
    });
    const confirmMutation = useMutation({
        mutationFn: ({ candidateId, targetAssetId }: { candidateId: string; targetAssetId?: string }) => confirmProjectAssetCandidate(detail.project.id, candidateId, targetAssetId),
        onSuccess: ({ asset }, variables) => {
            if (asset.category === "character") syncPersonalCharacterProjection(asset);
            const label = asset.category === "character" ? tRef.current("projectUi.mediaCharacterCard" as InterfaceMessageKey) : categoryLabel(asset.category, tRef.current);
            // 确认会改变候选、资产列表和左侧计数三处数据，必须一并失效缓存，否则计数与列表滞后。
            void Promise.all([
                queryClient.invalidateQueries({ queryKey: ["project", detail.project.id, "asset-candidates"] }),
                queryClient.invalidateQueries({ queryKey: ["project", detail.project.id, "assets"] }),
            ]);
            done(variables.targetAssetId ? "projectUi.candidateMergedIntoAssetVersion" : "projectUi.candidateAssetCreated", { category: label });
        },
        onError: failed("projectUi.assetCandidateConfirmFailed"),
    });
    const confirmingCandidateId = confirmMutation.isPending ? confirmMutation.variables?.candidateId || "" : "";
    const saveCharacter = useMutation({
        mutationFn: async (values: CharacterForm) => {
            const definition = characterDefinition(values);
            return editorAsset === "new" ? createProjectCharacter(detail.project.id, { name: values.name, definition }) : updateProjectCharacter(detail.project.id, editorAsset!.id, { name: values.name, definition });
        },
        onSuccess: (result) => { syncPersonalCharacterProjection(result.asset); setEditorAsset(null); done(editorAsset === "new" ? "projectUi.characterCardCreated" : "projectUi.characterSettingsSavedNewVersion"); },
        onError: failed("projectUi.characterSaveFailed"),
    });
    const generateMutation = useMutation({
        mutationKey: ["project-character-turnaround", detail.project.id],
        mutationFn: async (asset: ProjectAsset) => {
            if (!asset.character) throw new Error(tRef.current("projectUi.characterVersionIncomplete" as InterfaceMessageKey));
            const model = effectiveConfig.imageModel || effectiveConfig.model;
            const config = { ...effectiveConfig, model };
            if (!isAiConfigReady(config, model)) throw new Error(tRef.current("projectUi.configureImageModelFirst" as InterfaceMessageKey));
            const projectStyle = resolveProjectCanvasStyle(detail.project.stylePresetId, detail.project.styleProfileJson);
            await generateCharacterTurnaround({ projectId: detail.project.id, assetId: asset.id, versionId: asset.character.versionId, name: asset.title, definition: asset.character.definition, projectStyle, config });
            return getProjectCharacter(detail.project.id, asset.id);
        },
        onSuccess: (result) => { syncPersonalCharacterProjection(result.asset); done("projectUi.turnaroundGeneratedAndBound"); },
        onError: failed("projectUi.turnaroundGenerationFailed"),
    });
    const bindImagesMutation = useMutation({
        mutationFn: async (selectedAssetId: string) => {
            if (!imageAsset) throw new Error(tRef.current("projectUi.selectCharacterFirst" as InterfaceMessageKey));
            await saveRemoteUserDataNow();
            const latest = useAssetStore.getState().assets;
            const pickerItem = imagePickerItems.find((item) => item.id === selectedAssetId);
            const selected = latest.find((asset) => asset.id === selectedAssetId) || (pickerItem?.external ? await externalAssetSources.importExternalAsset(pickerItem.external) : undefined);
            if (selected?.kind !== "image") throw new Error(tRef.current("projectUi.selectCharacterTurnaroundImage" as InterfaceMessageKey));
            const resourceId = resourceIdFromStorageKey((selected as ImageAsset).data.storageKey);
            if (!resourceId) throw new Error(tRef.current("projectUi.imageNotSyncedToResourceLibrary" as InterfaceMessageKey));
            return replaceProjectCharacterRepresentations(detail.project.id, imageAsset.id, [{ role: "turnaround_sheet", resourceId, metadata: { sourceAssetId: selected.id } }, { role: "primary", resourceId, metadata: { source: "turnaround_sheet", sourceAssetId: selected.id } }]);
        },
        onSuccess: (result) => { syncPersonalCharacterProjection(result.asset); setImageAsset(null); done("projectUi.turnaroundBoundToNewVersion"); },
        onError: failed("projectUi.turnaroundBindingFailed"),
    });
    const bindVoiceMutation = useMutation({ mutationFn: () => voiceAsset && voiceSample ? bindProjectCharacterVoice(detail.project.id, voiceAsset.id, { sampleResourceId: voiceSample.resourceId, voiceName: voiceSample.name, instructions: voiceInstructions }) : Promise.reject(new Error(tRef.current("projectUi.selectVoiceAsset" as InterfaceMessageKey))), onSuccess: (result) => { syncPersonalCharacterProjection(result.asset); setVoiceAsset(null); setVoiceSample(null); done("projectUi.voiceBoundToNewVersion"); }, onError: failed("projectUi.voiceBindingFailed") });
    const unbindVoiceMutation = useMutation({ mutationFn: () => voiceAsset ? unbindProjectCharacterVoice(detail.project.id, voiceAsset.id) : Promise.reject(new Error(tRef.current("projectUi.selectCharacterFirst" as InterfaceMessageKey))), onSuccess: (result) => { syncPersonalCharacterProjection(result.asset); setVoiceAsset(null); done("projectUi.voiceUnboundAndVersioned"); }, onError: failed("projectUi.voiceUnbindingFailed") });

    const openCharacterEditor = (asset: ProjectAsset | "new") => {
        setEditorAsset(asset);
        const definition = asset === "new" ? {} : asset.character?.definition || {};
        form.setFieldsValue({ name: asset === "new" ? "" : asset.title, ...Object.fromEntries(characterFields.map(([key]) => [key, fieldValue(definition[key])])) } as CharacterForm);
    };
    const openImages = (asset: ProjectAsset) => setImageAsset(asset);
    const openVoice = (asset: ProjectAsset) => { const sampleResourceId = asset.character?.voice?.profile.sampleResourceId || ""; setVoiceAsset(asset); setVoiceSample(sampleResourceId ? { resourceId: sampleResourceId, name: asset.character?.voice?.profile.name || "当前声音", url: resourceFileUrl(sampleResourceId) } : null); setVoiceInstructions(asset.character?.voice?.instructions || ""); };
    const openFolderEditor = (folder?: ProjectAssetFolder, parentId = folderId === ALL_FOLDERS ? "" : folderId) => {
        setFolderEditor({ folder, parentId: folder?.parentId || parentId });
        setFolderName(folder?.name || "");
    };
    const saveFolder = () => {
        const name = folderName.trim();
        if (!name) {
            message.warning(t("projectUi.enterFolderName" as InterfaceMessageKey));
            return;
        }
        if (folderEditor?.folder) renameFolderMutation.mutate({ id: folderEditor.folder.id, name });
        else if (folderEditor) createFolderMutation.mutate({ name, parentId: folderEditor.parentId });
    };
    const downloadPreviewAsset = async (asset: ProjectAsset) => {
        try {
            const personal = personalAssets.find((item) => item.id === asset.id);
            if (personal && (personal.kind === "image" || personal.kind === "video" || personal.kind === "audio" || personal.kind === "model")) {
                const url = personal.kind === "image" ? personal.data.dataUrl : personal.data.url;
                const extension = personal.kind === "model" ? personal.data.fileName.split(".").pop() || "glb" : personal.data.mimeType.split("/")[1] || "bin";
                await downloadBrowserMedia({ storageKey: personal.data.storageKey, url, fileName: `${asset.title || "asset"}.${extension}` });
                return;
            }
            const cover = projectCharacterCover(asset.character?.representations);
            if (cover) {
                await downloadBrowserMedia({ storageKey: resourceStorageKey(cover.resourceId), fileName: `${asset.title || "character"}.png` });
                return;
            }
            const remoteUrl = projectAssetRemoteUrl(asset);
            if (!remoteUrl) {
                message.warning(t("projectUi.assetHasNoDownloadableMedia" as InterfaceMessageKey));
                return;
            }
            await downloadBrowserMedia({ storageKey: asset.storageKey, url: remoteUrl, fileName: `${asset.title || "asset"}.${projectAssetFileExtension(asset.mediaType)}` });
        } catch (error) {
            message.error(error instanceof Error ? error.message : tRef.current("projectUi.downloadFailed" as InterfaceMessageKey));
        }
    };
    return (
        <div>
            <header className="flex min-h-[72px] flex-col gap-4 pb-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 items-center gap-3">
                    <div className="min-w-0">
                        <div className="flex min-w-0 flex-wrap items-center gap-2.5">
                            <h2 className="text-[var(--fs-heading-lg)] font-semibold leading-6">{t("projectUi.tabAssets" as InterfaceMessageKey)}</h2>
                            <span className="rounded bg-foreground/[.055] px-1.5 py-1 text-[var(--fs-tiny)] font-medium tabular-nums text-foreground/45">{t("projectUi.confirmedItemsCount" as InterfaceMessageKey, { count: totalAssetCount })}</span>
                        </div>
                        <div className="mt-1.5 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-[var(--fs-label)] text-foreground/48">
                            <span className="inline-flex items-center gap-1.5"><UserRound className="size-3.5" />{t("projectUi.characterCount" as InterfaceMessageKey, { count: characterAssetCount })}</span>
                            <span className="inline-flex items-center gap-1.5"><Box className="size-3.5" />{t("projectUi.mediaCount" as InterfaceMessageKey, { count: mediaAssetCount })}</span>
                            {(candidatesQuery.data?.total || 0) ? <span className="inline-flex items-center gap-1.5 text-foreground/55"><Sparkles className="size-3.5" />{t("projectUi.pendingCandidatesCount" as InterfaceMessageKey, { count: candidatesQuery.data?.total || 0 })}</span> : null}
                        </div>
                    </div>
                </div>
                <div className="flex shrink-0 items-center gap-1.5 sm:pl-4">
                    <Button type="text" className="!h-9 !px-3" icon={<FolderPlus className="size-3.5" />} onClick={() => openFolderEditor()}>{t("projectUi.createFolder" as InterfaceMessageKey)}</Button>
                    <Button type="text" className="!h-9 !px-3" icon={<Link2 className="size-3.5" />} onClick={() => setAddOpen(true)}>{t("projectUi.referenceAssets" as InterfaceMessageKey)}</Button>
                    <Button type="primary" className="!h-9 !px-3.5" icon={<Plus className="size-3.5" />} onClick={() => openCharacterEditor("new")}>{t("projectUi.createCharacter" as InterfaceMessageKey)}</Button>
                </div>
            </header>
            <div className="project-assets-layout mt-3 grid gap-3">
                <nav className="space-y-0.5 pr-2" aria-label={t("projectUi.assetNavigation" as InterfaceMessageKey)}>
                    <div className="mb-1 flex h-8 items-center justify-between px-2 text-[var(--fs-tiny)] font-medium text-foreground/42"><span>{t("projectUi.assetFolders" as InterfaceMessageKey)}</span><button type="button" className="rounded p-1 hover:bg-surface-hover" aria-label={t("projectUi.createRootFolder" as InterfaceMessageKey)} onClick={() => openFolderEditor(undefined, "")}><FolderPlus className="size-3.5" /></button></div>
                    <button type="button" onClick={() => selectFolder("")} className={`flex h-11 w-full items-center gap-2 rounded-md px-2 text-left text-xs ${folderId === "" ? "bg-surface-active font-medium" : "text-foreground/55 hover:bg-surface-hover"}`}><FolderOpen className="size-4 shrink-0" /><span className="min-w-0 flex-1 truncate">{t("projectUi.assetLibrary" as InterfaceMessageKey)}</span><span className="text-[var(--fs-tiny)] tabular-nums text-foreground/42">{folderCountMap[""] || 0}</span></button>
                    <ProjectAssetFolderTree folders={assetFolders} folderCounts={folderCountMap} selectedId={folderId} onSelect={selectFolder} />
                    <div className="my-2 h-px bg-foreground/[.08]" />
                    <div className="mb-1 h-8 px-2 text-[var(--fs-tiny)] font-medium leading-8 text-foreground/42">{t("projectUi.categoryFilter" as InterfaceMessageKey)}</div>
                    {categoryCounts.map((item) => <button key={item.value} type="button" onClick={() => selectCategory(item.value)} className={`flex h-11 w-full items-center justify-between rounded-md px-2 text-left text-xs ${folderId === ALL_FOLDERS && category === item.value ? "bg-surface-active font-medium" : "text-foreground/55 hover:bg-surface-hover"}`}><span>{item.value === "all" ? t("projectUi.allAssets" as InterfaceMessageKey) : t(categoryLabels[normalizeAssetCategory(item.value)])}</span><span className="min-w-5 rounded bg-foreground/[.05] px-1 text-center text-[var(--fs-tiny)] tabular-nums">{item.count}</span></button>)}
                </nav>
                <div className="min-w-0">
                    <div className="mb-3 flex min-h-9 flex-wrap items-center justify-between gap-2">
                        <div className="flex min-w-0 items-center gap-1 text-xs text-foreground/48">
                            <button type="button" className="truncate rounded px-1.5 py-1 hover:bg-surface-hover" onClick={() => selectFolder("")}>{t("projectUi.assetLibrary" as InterfaceMessageKey)}</button>
                            {folderId === ALL_FOLDERS ? <><span>/</span><span className="font-medium text-foreground">{t("projectUi.allAssets" as InterfaceMessageKey)}</span></> : folderPath.map((folder) => <span key={folder.id} className="contents"><span>/</span><button type="button" className="truncate rounded px-1.5 py-1 font-medium text-foreground hover:bg-surface-hover" onClick={() => selectFolder(folder.id)}>{folder.name}</button></span>)}
                        </div>
                        <div className="flex items-center gap-2">
                            <Input allowClear value={keyword} onChange={(event) => setKeyword(event.target.value)} prefix={<Search className="size-3.5 text-foreground/35" />} placeholder={t("projectUi.searchAssetsPlaceholder" as InterfaceMessageKey)} aria-label={t("projectUi.searchProjectAssets" as InterfaceMessageKey)} className="w-52" />
                            {folderId !== ALL_FOLDERS ? <Button type="text" size="small" icon={<FolderPlus className="size-3.5" />} onClick={() => openFolderEditor(undefined, folderId)}>{t("projectUi.createSubfolder" as InterfaceMessageKey)}</Button> : null}
                        </div>
                    </div>
                    {childFolders.length ? <div className="project-asset-folder-grid mb-5">{childFolders.map((folder) => <ProjectAssetFolderCard key={folder.id} folder={folder} folders={assetFolders} assets={assets} folderCounts={folderCountMap} personalAssets={personalAssets} t={t} onOpen={() => selectFolder(folder.id)} onRename={() => openFolderEditor(folder)} onMove={(parentId) => moveFolderMutation.mutate({ id: folder.id, parentId })} onStyle={(style) => styleFolderMutation.mutate({ id: folder.id, style })} onTheme={(theme) => themeFolderMutation.mutate({ id: folder.id, theme })} onDelete={() => modal.confirm({ title: t("projectUi.deleteFolderNamed" as InterfaceMessageKey, { name: folder.name }), content: t("projectUi.deleteEmptyFolderOnly" as InterfaceMessageKey), okText: t("projectUi.delete" as InterfaceMessageKey), okButtonProps: { danger: true }, cancelText: t("projectUi.cancel" as InterfaceMessageKey), onOk: () => deleteFolderMutation.mutateAsync(folder.id) })} deleting={(deleteFolderMutation.isPending && deleteFolderMutation.variables === folder.id) || (moveFolderMutation.isPending && moveFolderMutation.variables?.id === folder.id) || (styleFolderMutation.isPending && styleFolderMutation.variables?.id === folder.id) || (themeFolderMutation.isPending && themeFolderMutation.variables?.id === folder.id)} />)}</div> : null}
                    {showPendingCandidates && pendingCandidates.length ? (
                        <section className="mb-4" aria-label={t("projectUi.pendingItemsNamed" as InterfaceMessageKey, { label: candidateLabel })}>
                            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                                <div className="flex items-center gap-1.5 text-xs font-medium"><Sparkles className="size-3.5 text-foreground/50" />{t("projectUi.candidatesFromStoryAnalysis" as InterfaceMessageKey, { label: candidateLabel })}</div>
                                <span className="text-[var(--fs-tiny)] tabular-nums text-foreground/42">{t("projectUi.pendingCandidatesRemaining" as InterfaceMessageKey, { count: candidatesQuery.data?.total || 0 })}</span>
                            </div>
                            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                                {pendingCandidates.map((candidate) => {
                                    const confirming = confirmingCandidateId === candidate.id;
                                    const isCharacter = candidate.category === "character";
                                    return (
                                        <article key={candidate.id} className="flex min-h-28 items-center gap-3 rounded-lg bg-surface-active p-3">
                                            <span className="grid size-12 shrink-0 place-items-center rounded-md bg-foreground/[.045] text-foreground/25">{isCharacter ? <UserRound className="size-5" /> : <Box className="size-5" />}</span>
                                            <div className="min-w-0 flex-1">
                                                <div className="truncate text-xs font-semibold">{candidate.name}</div>
                                                <div className="mt-1 text-[var(--fs-tiny)] text-foreground/42">{t("projectUi.candidateCategoryFromAnalysis" as InterfaceMessageKey, { category: categoryLabel(candidate.category, t) })}</div>
                                                <div className="mt-2 flex min-w-0 flex-wrap items-center gap-1">
                                                    <Button type="text" size="small" icon={<Check className="size-3.5" />} loading={confirming} disabled={Boolean(confirmingCandidateId) && !confirming} onClick={() => confirmMutation.mutate({ candidateId: candidate.id })}>{isCharacter ? t("projectUi.confirmNewCharacter" as InterfaceMessageKey) : t("projectUi.confirmNewAsset" as InterfaceMessageKey)}</Button>
                                                    {isCharacter && characterAssets.length ? <Dropdown trigger={["click"]} menu={{ items: characterAssets.map((asset) => ({ key: asset.id, label: asset.title })), onClick: ({ key }) => confirmMutation.mutate({ candidateId: candidate.id, targetAssetId: key }) }}><Button type="text" size="small" disabled={Boolean(confirmingCandidateId)}>{t("projectUi.mergeIntoCharacter" as InterfaceMessageKey)}<ChevronDown className="size-3" /></Button></Dropdown> : null}
                                                </div>
                                            </div>
                                        </article>
                                    );
                                })}
                            </div>
                            <PaginationBar current={candidatePage} pageSize={candidatePageSize} total={candidatesQuery.data?.total || 0} itemLabel={t("projectUi.itemUnit" as InterfaceMessageKey)} pageSizeOptions={[candidatePageSize]} onChange={(nextPage) => setCandidatePage(nextPage)} />
                        </section>
                    ) : null}
                    <div className="mb-2 flex items-center justify-between text-xs text-foreground/45"><span>{currentFolder?.name || (folderId === ALL_FOLDERS ? (category === "all" ? t("projectUi.allAssets" as InterfaceMessageKey) : categoryLabel(category, t)) : t("projectUi.rootFolderContents" as InterfaceMessageKey))}</span><span>{t("projectUi.confirmedItemsCount" as InterfaceMessageKey, { count: assetsQuery.data?.total || 0 })}</span></div>
                    {assetsQuery.isLoading ? <WorkspaceState icon="assets" compact title={t("projectUi.loadingAssets" as InterfaceMessageKey)} description={t("projectUi.loadingAssetsDetail" as InterfaceMessageKey)} /> : visibleAssets.length ? <><div className="project-assets-grid assets-library-grid">{visibleAssets.map((asset) => asset.category === "character" ? <ProjectCharacterCard key={asset.id} asset={asset} folderItems={folderMoveItems} t={t} generating={generatingAssetIds.has(asset.id)} removing={(moveMutation.isPending && moveMutation.variables?.id === asset.id) || (unlinkMutation.isPending && unlinkMutation.variables === asset.id)} onOpen={() => setPreviewAsset(asset)} onEdit={() => openCharacterEditor(asset)} onGenerate={() => generateMutation.mutate(asset)} onBindImages={() => openImages(asset)} onBindVoice={() => openVoice(asset)} onMove={(nextFolderId) => moveMutation.mutate({ id: asset.id, nextFolderId })} onRemove={() => unlinkMutation.mutate(asset.id)} /> : <MediaAssetCard key={asset.id} asset={asset} personalAsset={personalAssets.find((item) => item.id === asset.id)} folderItems={folderMoveItems} t={t} locale={locale} onOpen={() => setPreviewAsset(asset)} onMove={(nextFolderId) => moveMutation.mutate({ id: asset.id, nextFolderId })} onCategoryChange={(next) => categoryMutation.mutate({ id: asset.id, next })} onVersion={() => versionMutation.mutate(asset.id)} onRemove={() => unlinkMutation.mutate(asset.id)} loading={(moveMutation.isPending && moveMutation.variables?.id === asset.id) || (categoryMutation.isPending && categoryMutation.variables?.id === asset.id) || (versionMutation.isPending && versionMutation.variables === asset.id) || (unlinkMutation.isPending && unlinkMutation.variables === asset.id)} />)}</div><PaginationBar current={page} pageSize={pageSize} total={assetsQuery.data?.total || 0} itemLabel={t("projectUi.itemUnit" as InterfaceMessageKey)} pageSizeOptions={[20, 40, 80]} onChange={(nextPage, nextPageSize) => { setPage(nextPageSize !== pageSize ? 1 : nextPage); setPageSize(nextPageSize); }} /></> : childFolders.length || (showPendingCandidates && pendingCandidates.length) ? null : <WorkspaceState icon="assets" compact title={debouncedKeyword ? t("projectUi.noMatchingAssets" as InterfaceMessageKey) : t("projectUi.folderEmpty" as InterfaceMessageKey)} description={debouncedKeyword ? t("projectUi.adjustAssetSearch" as InterfaceMessageKey) : t("projectUi.folderEmptyDescription" as InterfaceMessageKey)} />}
                </div>
            </div>

            <AssetLibraryPickerModal
                open={addOpen}
                remoteLibrary
                mediaKinds={["image", "video", "audio", "text"]}
                items={availablePickerItems}
                categoryLabels={{ ...pickerCategoryLabels, ...externalAssetSources.categoryLabels }}
                folders={externalAssetSources.folders}
                footerNote={externalAssetSources.error || undefined}
                multiple
                title={t("projectUi.assetLibrary" as InterfaceMessageKey)}
                confirmLabel={(count) => t("projectUi.addAssetsToProject" as InterfaceMessageKey, { count })}
                emptyTitle={t("projectUi.noReferenceableAssets" as InterfaceMessageKey)}
                emptyDescription={t("projectUi.noReferenceableAssetsDescription" as InterfaceMessageKey)}
                onClose={() => setAddOpen(false)}
                onConfirm={async (ids) => {
                    await addMutation.mutateAsync({ ids, nextFolderId: folderId === ALL_FOLDERS ? undefined : folderId });
                }}
            />
            <ProjectAssetPreviewModal asset={previewAsset} personalAsset={previewAsset ? personalAssets.find((item) => item.id === previewAsset.id) : undefined} t={t} locale={locale} onClose={() => setPreviewAsset(null)} onDownload={() => previewAsset && downloadPreviewAsset(previewAsset)} onReplaceImage={() => { if (!previewAsset || previewAsset.category !== "character") return; setPreviewAsset(null); openImages(previewAsset); }} />
            <CharacterEditorModal open={Boolean(editorAsset)} editing={editorAsset !== "new"} form={form} loading={saveCharacter.isPending} t={t} onClose={() => setEditorAsset(null)} onSave={() => form.validateFields().then((values) => saveCharacter.mutate(values))} />
            <Modal className="workspace-modal workspace-modal-compact" title={t(folderEditor?.folder ? "projectUi.renameFolder" as InterfaceMessageKey : "projectUi.createFolder" as InterfaceMessageKey)} open={Boolean(folderEditor)} okText={folderEditor?.folder ? t("projectUi.save" as InterfaceMessageKey) : t("projectUi.create" as InterfaceMessageKey)} cancelText={t("projectUi.cancel" as InterfaceMessageKey)} okButtonProps={{ loading: createFolderMutation.isPending || renameFolderMutation.isPending }} onCancel={() => { setFolderEditor(null); setFolderName(""); }} onOk={saveFolder}>
                <div className="grid gap-2"><span className="text-[var(--fs-label)] text-foreground/48">{t("projectUi.folderLocation" as InterfaceMessageKey, { location: folderEditor ? projectAssetFolderParentLabel(assetFolders, folderEditor.parentId, t) : "" })}</span><Input autoFocus maxLength={60} value={folderName} placeholder={t("projectUi.enterFolderName" as InterfaceMessageKey)} onChange={(event) => setFolderName(event.target.value)} onPressEnter={saveFolder} /></div>
            </Modal>
            <AssetLibraryPickerModal
                open={Boolean(imageAsset)}
                remoteLibrary
                remoteKind="image"
                items={imagePickerItems}
                categoryLabels={{ ...pickerCategoryLabels, ...externalAssetSources.categoryLabels }}
                folders={externalAssetSources.folders}
                footerNote={externalAssetSources.error || undefined}
                multiple={false}
                eyebrow={t("projectUi.bindImages" as InterfaceMessageKey)}
                title={imageAsset?.title || t("projectUi.characterTurnaround" as InterfaceMessageKey)}
                confirmLabel={() => t("projectUi.bindAndCreateVersion" as InterfaceMessageKey)}
                emptyTitle={t("projectUi.noBindableImages" as InterfaceMessageKey)}
                emptyDescription={t("projectUi.noBindableImagesDescription" as InterfaceMessageKey)}
                onClose={() => setImageAsset(null)}
                onConfirm={async (ids) => {
                    if (!ids[0]) throw new Error(tRef.current("projectUi.selectTurnaroundImage" as InterfaceMessageKey));
                    await bindImagesMutation.mutateAsync(ids[0]);
                }}
            />
            <AssetLibraryPickerModal
                open={voicePickerOpen}
                remoteLibrary
                remoteKind="audio"
                items={audioPickerItems}
                categoryLabels={{ all: t("projectUi.allAudio" as InterfaceMessageKey), audio: t("projectUi.voiceAsset" as InterfaceMessageKey) }}
                initialCategory="audio"
                multiple={false}
                eyebrow={t("projectUi.voiceAsset" as InterfaceMessageKey)}
                title={t("projectUi.chooseFromAssetLibrary" as InterfaceMessageKey)}
                confirmLabel={() => t("projectUi.useThisVoice" as InterfaceMessageKey)}
                emptyTitle={t("projectUi.noUsableAudio" as InterfaceMessageKey)}
                emptyDescription={t("projectUi.noUsableAudioDescription" as InterfaceMessageKey)}
                upload={{ accept: CHARACTER_VOICE_UPLOAD_ACCEPT, description: t("projectUi.voiceUploadDescription" as InterfaceMessageKey, { formats: CHARACTER_VOICE_FORMAT_LABEL }), onUpload: async (files) => {
                    const ids: string[] = [];
                    for (const file of Array.from(files)) {
                        if (!isSupportedCharacterVoiceFile(file)) throw new Error(tRef.current("projectUi.voiceFileSupportedFormats" as InterfaceMessageKey, { formats: CHARACTER_VOICE_FORMAT_LABEL }));
                        const uploaded = await uploadMediaFile(file, "character-voice");
                        const resourceId = resourceIdFromStorageKey(uploaded.storageKey);
                        if (!resourceId) throw new Error(tRef.current("projectUi.voiceUploadNotSynced" as InterfaceMessageKey));
                        ids.push(addAsset({ kind: "audio", title: characterVoiceTitleFromFileName(file.name), coverUrl: "", tags: ["角色声音"], status: "confirmed", source: "角色卡", data: { url: uploaded.url, storageKey: uploaded.storageKey, durationMs: uploaded.durationMs, bytes: uploaded.bytes, mimeType: uploaded.mimeType || file.type || "application/octet-stream" } }));
                    }
                    return ids;
                } }}
                onClose={() => setVoicePickerOpen(false)}
                onConfirm={(ids) => {
                    const id = ids[0];
                    const resourceId = id ? audioResourceByItemId.get(id) : "";
                    if (!resourceId) throw new Error(t("projectUi.voiceAssetNotSynced" as InterfaceMessageKey));
                    const item = audioPickerItems.find((entry) => entry.id === id);
                    setVoiceSample({ resourceId, name: item?.title || t("projectUi.characterVoice" as InterfaceMessageKey), url: resourceFileUrl(resourceId) });
                    setVoicePickerOpen(false);
                }}
            />
            <Modal className="workspace-modal workspace-modal-compact" title={t("projectUi.bindVoiceAssetNamed" as InterfaceMessageKey, { name: voiceAsset?.title || "" })} open={Boolean(voiceAsset)} okText={t("projectUi.bindAndCreateVersion" as InterfaceMessageKey)} cancelText={t("projectUi.cancel" as InterfaceMessageKey)} okButtonProps={{ loading: bindVoiceMutation.isPending, disabled: !voiceSample }} onCancel={() => { setVoiceAsset(null); setVoiceSample(null); }} onOk={() => bindVoiceMutation.mutate()}>
                <div className="grid gap-3">
                    <div className="rounded-md border border-border/70 bg-foreground/[.025] p-3">
                        <div className="flex items-center justify-between gap-3"><div className="min-w-0"><div className="text-[var(--fs-label)] text-foreground/48">{t("projectUi.currentVoiceAsset" as InterfaceMessageKey)}</div><div className="mt-1 truncate text-sm font-medium">{voiceSample?.name || t("projectUi.noVoiceSelected" as InterfaceMessageKey)}</div></div><Button icon={<FolderOpen className="size-3.5" />} onClick={() => setVoicePickerOpen(true)}>{t("projectUi.chooseOrUploadAudio" as InterfaceMessageKey)}</Button></div>
                        {voiceSample ? <audio className="mt-3 w-full" src={voiceSample.url} controls preload="metadata" /> : <div className="mt-2 text-[var(--fs-tiny)] text-foreground/42">{t("projectUi.chooseOrUploadVoiceSample" as InterfaceMessageKey, { formats: CHARACTER_VOICE_FORMAT_LABEL })}</div>}
                    </div>
                    <Input.TextArea rows={3} value={voiceInstructions} placeholder={t("completeUi.003")} onChange={(event) => setVoiceInstructions(event.target.value)} />
                    {voiceAsset?.character && voiceAsset.character.voiceStatus !== "missing" ? <div className="flex items-center justify-between pt-1"><span className="text-[var(--fs-label)] text-foreground/45">{t("projectUi.currentVoiceBinding" as InterfaceMessageKey, { name: voiceAsset.character.voice?.profile.name || t("projectUi.voiceAssetUnavailable" as InterfaceMessageKey) })}</span><Popconfirm title={t("projectUi.unbindVoiceConfirmTitle" as InterfaceMessageKey)} description={t("projectUi.unbindVoiceDescription" as InterfaceMessageKey)} okText={t("projectUi.unbind" as InterfaceMessageKey)} cancelText={t("projectUi.cancel" as InterfaceMessageKey)} onConfirm={() => unbindVoiceMutation.mutate()}><Button type="text" danger size="small" loading={unbindVoiceMutation.isPending} icon={<VolumeX className="size-3.5" />}>{t("projectUi.unbindVoice" as InterfaceMessageKey)}</Button></Popconfirm></div> : null}
                </div>
            </Modal>
        </div>
    );
}

function ProjectAssetFolderTree({ folders, folderCounts, selectedId, onSelect }: { folders: ProjectAssetFolder[]; folderCounts: Record<string, number>; selectedId: string; onSelect: (folderId: string) => void }) {
    const renderLevel = (parentId: string, depth: number, visited: ReadonlySet<string>): ReactNode => depth >= 8 ? null : folders
        .filter((folder) => (folder.parentId || "") === parentId)
        .map((folder) => {
            if (visited.has(folder.id)) return null;
            const count = folderCounts[folder.id] || 0;
            const nextVisited = new Set(visited).add(folder.id);
            return <div key={folder.id}><button type="button" onClick={() => onSelect(folder.id)} className={`flex h-9 w-full items-center gap-1.5 rounded-md pr-2 text-left text-[var(--fs-label)] ${selectedId === folder.id ? "bg-surface-active font-medium" : "text-foreground/52 hover:bg-surface-hover"}`} style={{ paddingLeft: `calc(var(--space-2) + ${depth} * var(--space-3))` }}><FolderOpen className="size-3.5 shrink-0" /><span className="min-w-0 flex-1 truncate">{folder.name}</span><span className="text-[var(--fs-micro)] tabular-nums text-foreground/36">{count}</span></button>{renderLevel(folder.id, depth + 1, nextVisited)}</div>;
        });
    return <div>{renderLevel("", 0, new Set())}</div>;
}

function ProjectAssetFolderCard({ folder, folders, assets, folderCounts, personalAssets, t, onOpen, onRename, onMove, onStyle, onTheme, onDelete, deleting }: { folder: ProjectAssetFolder; folders: ProjectAssetFolder[]; assets: ProjectAsset[]; folderCounts: Record<string, number>; personalAssets: Asset[]; t: (key: InterfaceMessageKey, values?: Record<string, string | number>) => string; onOpen: () => void; onRename: () => void; onMove: (parentId: string) => void; onStyle: (style: CanvasFolderStyle) => void; onTheme: (theme: CanvasFolderTheme) => void; onDelete: () => void; deleting: boolean }) {
    const directAssets = assets.filter((asset) => (asset.folderId || "") === folder.id);
    const totalCount = projectAssetFolderDescendantAssetCount(folders, folderCounts, folder.id);
    const directCount = folderCounts[folder.id] || 0;
    const childFolderCount = folders.filter((item) => item.parentId === folder.id).length;
    const moveItems = projectAssetFolderMoveItems(folders, folder, t);
    const data: CanvasNodeData = {
        id: folder.id,
        type: CanvasNodeType.Frame,
        title: folder.name,
        position: { x: 0, y: 0 },
        width: 360,
        height: 280,
        metadata: {
            frame: { collapsed: true, expandedWidth: 760, expandedHeight: 520 },
            folder: { style: projectAssetFolderStyle(folder.style), theme: resolveCanvasFolderTheme(folder.theme), createdAt: folder.createdAt },
        },
    };
    const childNodes = directAssets.slice(0, 3).map((asset, index) => projectAssetCanvasPreviewNode(asset, personalAssets.find((item) => item.id === asset.id), index));
    const styleLabels: Record<CanvasFolderStyle, string> = {
        glass: t("projectUi.folderStyleAuroraGlass" as InterfaceMessageKey),
        stacked: t("projectUi.folderStyleDisplay" as InterfaceMessageKey),
        midnight: t("projectUi.folderStyleMidnightCover" as InterfaceMessageKey),
        paper: t("projectUi.folderStylePaperCollection" as InterfaceMessageKey),
        cinema: t("projectUi.folderStyleCinemaFilm" as InterfaceMessageKey),
        compact: t("projectUi.folderStyleCompactIndex" as InterfaceMessageKey),
    };
    const themeLabels: Record<CanvasFolderTheme, string> = {
        aurora: t("projectUi.folderThemeAurora" as InterfaceMessageKey),
        obsidian: t("projectUi.folderThemeObsidian" as InterfaceMessageKey),
        ember: t("projectUi.folderThemeEmber" as InterfaceMessageKey),
        pearl: t("projectUi.folderThemePearl" as InterfaceMessageKey),
    };
    return <article className="project-asset-folder-card" aria-label={t("projectUi.folderItemCount" as InterfaceMessageKey, { name: folder.name, count: totalCount })}>
        <button type="button" className="project-asset-folder-open" aria-label={t("projectUi.openNamedFolder" as InterfaceMessageKey, { name: folder.name })} onClick={onOpen} />
        <div className="project-asset-folder-visual"><CanvasFolderPreview data={data} childNodes={childNodes} active={false} isDropTarget={false} readOnly onToggleCollapsed={onOpen} onTitleChange={() => undefined} onStyleChange={() => undefined} onThemeChange={() => undefined} /></div>
        <div className="project-asset-folder-card-footer"><span>{t("projectUi.folderContentsSummary" as InterfaceMessageKey, { count: directCount, childFolders: childFolderCount })}</span><Dropdown trigger={["click"]} menu={{ selectedKeys: [`style:${folder.style}`, `theme:${resolveCanvasFolderTheme(folder.theme)}`], items: [{ key: "rename", label: t("projectUi.rename" as InterfaceMessageKey), icon: <Pencil className="size-3.5" /> }, { key: "move", label: t("projectUi.moveTo" as InterfaceMessageKey), icon: <MoveRight className="size-3.5" />, children: moveItems }, { key: "style", label: t("projectUi.switchStyle" as InterfaceMessageKey), children: Object.entries(styleLabels).map(([key, label]) => ({ key: `style:${key}`, label })) }, { key: "theme", label: t("projectUi.switchTheme" as InterfaceMessageKey), children: CANVAS_FOLDER_THEME_OPTIONS.map((item) => ({ key: `theme:${item.key}`, label: themeLabels[item.key] })) }, { key: "delete", label: t("projectUi.deleteEmptyFolder" as InterfaceMessageKey), icon: <Trash2 className="size-3.5" />, danger: true }], onClick: ({ key, domEvent }) => { domEvent.stopPropagation(); if (key === "rename") onRename(); else if (key.startsWith("move:")) onMove(key === "move:root" ? "" : key.slice(5)); else if (key.startsWith("style:")) onStyle(key.slice(6) as CanvasFolderStyle); else if (key.startsWith("theme:")) onTheme(key.slice(6) as CanvasFolderTheme); else if (key === "delete") onDelete(); } }}><button type="button" className="project-asset-folder-menu" disabled={deleting} aria-label={t("projectUi.folderActions" as InterfaceMessageKey, { name: folder.name })} onClick={(event) => event.stopPropagation()}><MoreHorizontal className="size-4" /></button></Dropdown></div>
    </article>;
}

function projectAssetCanvasPreviewNode(asset: ProjectAsset, personalAsset: Asset | undefined, index: number): CanvasNodeData {
    const type = asset.mediaType === "image" || asset.category === "character" ? CanvasNodeType.Image : asset.mediaType === "video" ? CanvasNodeType.Video : asset.mediaType === "audio" ? CanvasNodeType.Audio : CanvasNodeType.Text;
    const characterCover = projectCharacterCover(asset.character?.representations);
    const content = characterCover
        ? resourceFileUrl(characterCover.resourceId)
        : personalAsset?.kind === "image"
            ? personalAsset.data.dataUrl || personalAsset.coverUrl
            : personalAsset?.kind === "video" || personalAsset?.kind === "audio"
                ? personalAsset.data.url
                    : personalAsset?.kind === "text"
                        ? personalAsset.data.content
                    : projectAssetRemoteUrl(asset) || asset.previewText || "";
    return { id: asset.id, type, title: asset.title, position: { x: index * 24, y: index * 18 }, width: 240, height: 160, metadata: { content, assetId: asset.id } };
}

function projectAssetFolderStyle(style?: string): CanvasFolderStyle {
    return style === "glass" || style === "stacked" || style === "midnight" || style === "paper" || style === "cinema" || style === "compact" ? style : "glass";
}

function projectAssetRemoteUrl(asset: ProjectAsset) {
    const resourceId = resourceIdFromStorageKey(asset.storageKey);
    return resourceId ? resourceFileUrl(resourceId) : "";
}

function projectAssetFileExtension(mediaType: string) {
    if (mediaType === "image") return "png";
    if (mediaType === "video") return "mp4";
    if (mediaType === "audio") return "mp3";
    if (mediaType === "model") return "glb";
    return "txt";
}

function projectAssetFolderPath(folders: ProjectAssetFolder[], folderId: string) {
    if (!folderId || folderId === ALL_FOLDERS) return [];
    const byId = new Map(folders.map((folder) => [folder.id, folder]));
    const result: ProjectAssetFolder[] = [];
    const seen = new Set<string>();
    let current = byId.get(folderId);
    while (current && !seen.has(current.id)) {
        seen.add(current.id);
        result.unshift(current);
        current = current.parentId ? byId.get(current.parentId) : undefined;
    }
    return result;
}

function projectAssetFolderLabel(folders: ProjectAssetFolder[], folder: ProjectAssetFolder) {
    return projectAssetFolderPath(folders, folder.id).map((item) => item.name).join(" / ");
}

function projectAssetFolderParentLabel(folders: ProjectAssetFolder[], parentId: string, t: (key: InterfaceMessageKey, values?: Record<string, string | number>) => string) {
    const path = parentId ? projectAssetFolderPath(folders, parentId).map((item) => item.name) : [];
    return [t("projectUi.assetLibrary" as InterfaceMessageKey), ...path].join(" / ");
}

function projectAssetFolderMoveItems(folders: ProjectAssetFolder[], movingFolder: ProjectAssetFolder, t: (key: InterfaceMessageKey, values?: Record<string, string | number>) => string) {
    const blocked = new Set([movingFolder.id]);
    let changed = true;
    while (changed) {
        changed = false;
        for (const folder of folders) {
            if (!folder.parentId || blocked.has(folder.id) || !blocked.has(folder.parentId)) continue;
            blocked.add(folder.id);
            changed = true;
        }
    }
    return [
        { key: "move:root", label: t("projectUi.assetLibraryRoot" as InterfaceMessageKey), disabled: !movingFolder.parentId },
        ...folders.filter((folder) => !blocked.has(folder.id)).map((folder) => ({ key: `move:${folder.id}`, label: projectAssetFolderLabel(folders, folder), disabled: movingFolder.parentId === folder.id })),
    ];
}

function projectAssetFolderDescendantAssetCount(folders: ProjectAssetFolder[], folderCounts: Record<string, number>, folderId: string) {
    const descendantIds = new Set([folderId]);
    let added = true;
    while (added) {
        added = false;
        for (const folder of folders) {
            if (!folder.parentId || descendantIds.has(folder.id) || !descendantIds.has(folder.parentId)) continue;
            descendantIds.add(folder.id);
            added = true;
        }
    }
    return Array.from(descendantIds).reduce((total, id) => total + (folderCounts[id] || 0), 0);
}

function CharacterEditorModal({ open, editing, form, loading, t, onClose, onSave }: { open: boolean; editing: boolean; form: FormInstance<CharacterForm>; loading: boolean; t: InterfaceTranslate; onClose: () => void; onSave: () => void }) {
    const field = (key: CharacterFormKey) => characterFields.find(([name]) => name === key)!;
    const textArea = (key: CharacterFormKey, rows = 3) => <Form.Item name={key} label={t(field(key)[1] as InterfaceMessageKey)}><Input.TextArea rows={rows} placeholder={key === "appearance" ? t("projectUi.appearanceStableTraitsPlaceholder" as InterfaceMessageKey) : undefined} /></Form.Item>;
    const input = (key: CharacterFormKey) => <Form.Item name={key} label={t(field(key)[1] as InterfaceMessageKey)}><Input /></Form.Item>;
    return <Modal className="workspace-modal workspace-modal-wide library-modal" title={null} open={open} forceRender okText={t(editing ? "projectUi.saveCharacterSettings" as InterfaceMessageKey : "projectUi.createCharacterCard" as InterfaceMessageKey)} cancelText={t("projectUi.cancel" as InterfaceMessageKey)} okButtonProps={{ loading }} onCancel={onClose} onOk={onSave} styles={{ body: { paddingTop: 0 } }}>
        <div className="mb-1 pb-4"><div className="text-[var(--fs-label)] font-medium text-foreground/52">{t("projectUi.characterSettings" as InterfaceMessageKey)}</div><h2 className="mt-1 text-xl font-semibold">{t(editing ? "projectUi.editCharacterSettings" as InterfaceMessageKey : "projectUi.newCharacterCard" as InterfaceMessageKey)}</h2></div>
        <Form form={form} layout="vertical" requiredMark={false} className="pt-2"><Form.Item name="name" label={t("projectUi.characterName" as InterfaceMessageKey)} rules={[{ required: true, message: t("projectUi.characterNameRequired" as InterfaceMessageKey) }]}><Input size="large" placeholder={t("projectUi.characterNamePlaceholder" as InterfaceMessageKey)} /></Form.Item><Tabs items={[{ key: "identity", label: t("projectUi.identityAndAppearance" as InterfaceMessageKey), forceRender: true, children: <div className="grid gap-x-5 sm:grid-cols-2">{input("role")}{input("aliases")}{textArea("appearance", 4)}{input("physique")}{input("clothing")}{input("props")}{textArea("consistencyPrompt", 4)}{textArea("multiViewPrompt", 3)}</div> }, { key: "performance", label: t("projectUi.performanceAndVoice" as InterfaceMessageKey), forceRender: true, children: <div className="grid gap-x-5 sm:grid-cols-2">{textArea("personality", 4)}{input("voiceLanguage")}{input("voiceAge")}{input("voiceTimbre")}</div> }]} /></Form>
    </Modal>;
}

type CharacterFormKey = (typeof characterFields)[number][0];

function MediaAssetCard({ asset, personalAsset, folderItems, t, locale, onOpen, onMove, onCategoryChange, onVersion, onRemove, loading }: { asset: ProjectAsset; personalAsset?: Asset; folderItems: Array<{ key: string; label: string }>; t: InterfaceTranslate; locale: string; onOpen: () => void; onMove: (folderId: string) => void; onCategoryChange: (category: AssetCategory) => void; onVersion: () => void; onRemove: () => void; loading: boolean }) {
    const categoryItems = Object.entries(categoryLabels).filter(([value]) => value !== "character").map(([value, key]) => ({ key: value, label: t(key) }));
    return <AssetLibraryCard className="project-asset-library-card"><AssetLibraryCardMedia className="relative aspect-[4/3] overflow-hidden bg-foreground/[.05]"><button type="button" className="project-asset-media-button" onClick={onOpen} aria-label={t("projectUi.viewNamedAsset" as InterfaceMessageKey, { name: asset.title })}><ProjectAssetMedia asset={asset} personalAsset={personalAsset} /><div className="absolute inset-x-2 top-2 flex items-center justify-between"><StatusPill status={asset.status} /><span className="rounded bg-black/50 px-1.5 py-0.5 text-[var(--fs-micro)] text-white">{mediaLabel(asset.mediaType, t)}</span></div></button></AssetLibraryCardMedia><div className="p-2.5"><button type="button" className="project-asset-title-button" onClick={onOpen}><span className="min-w-0 truncate text-xs font-medium">{asset.title}</span><span className="shrink-0 text-[var(--fs-micro)] text-foreground/38">{formatTime(asset.updatedAt, locale)}</span></button><div className="mt-1 flex items-center gap-1.5 text-[var(--fs-tiny)] text-foreground/42"><Dropdown trigger={["click"]} menu={{ selectedKeys: [asset.category], items: categoryItems, onClick: ({ key }) => onCategoryChange(normalizeAssetCategory(key)) }}><button type="button" disabled={loading} className="inline-flex h-6 items-center gap-1 rounded px-1.5 text-[var(--fs-tiny)] text-foreground/50 hover:bg-surface-hover"><span>{categoryLabel(asset.category, t)}</span><ChevronDown className="size-3" /></button></Dropdown><span>·</span><span>v{Math.max(1, asset.versionCount)}</span><Link2 className="ml-auto size-3.5 shrink-0 text-foreground/42" /></div><div className="mt-2 flex items-center justify-between gap-2 pt-1"><span className="text-[var(--fs-micro)] text-foreground/38">{mediaLabel(asset.mediaType, t)}</span><div className="flex items-center"><Dropdown trigger={["click"]} menu={{ selectedKeys: [asset.folderId || ""], items: folderItems, onClick: ({ key }) => onMove(key) }}><Button type="text" size="small" icon={<MoveRight className="size-3.5" />} loading={loading} aria-label={t("projectUi.moveNamedAsset" as InterfaceMessageKey, { name: asset.title })} /></Dropdown><Button type="text" size="small" icon={<RefreshCw className="size-3.5" />} loading={loading} onClick={onVersion} aria-label={t("projectUi.createVersionForNamedAsset" as InterfaceMessageKey, { name: asset.title })} /><Popconfirm title={t("projectUi.removeProjectAssetTitle" as InterfaceMessageKey)} okText={t("projectUi.removeFromProject" as InterfaceMessageKey)} cancelText={t("projectUi.cancel" as InterfaceMessageKey)} onConfirm={onRemove}><Button type="text" danger size="small" icon={<Trash2 className="size-3.5" />} loading={loading} aria-label={t("projectUi.removeNamedAsset" as InterfaceMessageKey, { name: asset.title })} /></Popconfirm></div></div></div></AssetLibraryCard>;
}

function ProjectAssetMedia({ asset, personalAsset }: { asset: ProjectAsset; personalAsset?: Asset }) {
    if (personalAsset) return <AssetMediaPreview asset={personalAsset} alt={asset.title} className="h-full w-full bg-black object-cover" fallback={<div className="grid h-full place-items-center text-foreground/25"><MediaIcon kind={asset.mediaType} /></div>} />;
    const remoteUrl = projectAssetRemoteUrl(asset);
    if (asset.mediaType === "image" && remoteUrl) return <img src={remoteUrl} alt={asset.title} className="h-full w-full bg-black object-cover" />;
    if (asset.mediaType === "video" && remoteUrl) return <video src={remoteUrl} muted preload="metadata" className="h-full w-full bg-black object-cover" />;
    if (asset.mediaType === "text" && asset.previewText) return <p className="line-clamp-6 h-full overflow-hidden p-4 text-left text-xs leading-5 text-foreground/62">{asset.previewText}</p>;
    return <div className="grid h-full place-items-center text-foreground/25"><MediaIcon kind={asset.mediaType} /></div>;
}

function ProjectAssetPreviewModal({ asset, personalAsset, t, locale, onClose, onDownload, onReplaceImage }: { asset: ProjectAsset | null; personalAsset?: Asset; t: InterfaceTranslate; locale: string; onClose: () => void; onDownload: () => void; onReplaceImage: () => void }) {
    const characterCover = projectCharacterCover(asset?.character?.representations);
    const remoteUrl = asset ? projectAssetRemoteUrl(asset) : "";
    const canDownload = Boolean(personalAsset && ["image", "video", "audio", "model"].includes(personalAsset.kind)) || Boolean(characterCover) || Boolean(remoteUrl);
    const previewKind = personalAsset?.kind || asset?.mediaType;
    const previewClass = asset?.category === "character" ? "is-character" : previewKind === "video" ? "is-video" : previewKind === "audio" ? "is-audio" : previewKind === "text" ? "is-text" : "is-image";
    return (
        <Modal className="workspace-modal workspace-modal-wide library-modal project-asset-preview-modal" title={asset?.category === "character" ? t("projectUi.characterCardPreview" as InterfaceMessageKey) : t("projectUi.assetPreview" as InterfaceMessageKey)} open={Boolean(asset)} onCancel={onClose} footer={<div className="flex justify-end gap-2"><Button onClick={onClose}>{t("projectUi.close" as InterfaceMessageKey)}</Button>{asset?.category === "character" ? <Button onClick={onReplaceImage}>{t("projectUi.replaceImage" as InterfaceMessageKey)}</Button> : null}{canDownload ? <Button type="primary" icon={<Download className="size-3.5" />} onClick={onDownload}>{t("projectUi.download" as InterfaceMessageKey)}</Button> : null}</div>}>
            {asset ? <div className="project-asset-preview-layout">
                <div className={`project-asset-preview-stage ${previewClass}`}>
                    {asset.category === "character" ? characterCover ? <CachedResourceImage storageKey={`resource:${characterCover.resourceId}`} src={resourceFileUrl(characterCover.resourceId)} alt={asset.title} className="project-asset-preview-media" fallback={<div className="grid min-h-48 place-items-center text-foreground/35"><UserRound className="size-12" /></div>} /> : <div className="grid min-h-48 place-items-center text-foreground/35"><UserRound className="size-12" /></div> : personalAsset?.kind === "video" ? <video src={personalAsset.data.url} controls className="project-asset-preview-media" /> : personalAsset?.kind === "audio" ? <audio src={personalAsset.data.url} controls className="project-asset-preview-audio" /> : personalAsset?.kind === "image" ? <AssetMediaPreview asset={personalAsset} alt={asset.title} className="project-asset-preview-media" /> : personalAsset?.kind === "text" ? <p className="project-asset-preview-text">{personalAsset.data.content}</p> : asset.mediaType === "video" && remoteUrl ? <video src={remoteUrl} controls className="project-asset-preview-media" /> : asset.mediaType === "audio" && remoteUrl ? <audio src={remoteUrl} controls className="project-asset-preview-audio" /> : asset.mediaType === "image" && remoteUrl ? <img src={remoteUrl} alt={asset.title} className="project-asset-preview-media" /> : asset.mediaType === "text" && asset.previewText ? <p className="project-asset-preview-text">{asset.previewText}</p> : <div className="grid min-h-48 place-items-center text-foreground/35"><MediaIcon kind={asset.mediaType} /></div>}
                </div>
                <aside className="project-asset-preview-details">
                    <div className="project-asset-preview-eyebrow">{asset.category === "character" ? t("projectUi.characterCard" as InterfaceMessageKey) : mediaLabel(asset.mediaType, t)}</div>
                    <h3 className="project-asset-preview-title">{asset.title}</h3>
                    <p className="project-asset-preview-meta">{t("projectUi.updatedAt" as InterfaceMessageKey, { time: formatTime(asset.updatedAt, locale) })}</p>
                    {asset.character ? <div className="project-asset-preview-sections"><section><span>{t("projectUi.storyRole" as InterfaceMessageKey)}</span><p>{textValue(asset.character.definition.role) || t("projectUi.notProvided" as InterfaceMessageKey)}</p></section><section><span>{t("projectUi.appearanceSettings" as InterfaceMessageKey)}</span><p>{textValue(asset.character.definition.appearance) || textValue(asset.character.definition.consistencyPrompt) || t("projectUi.notProvided" as InterfaceMessageKey)}</p></section><div className="project-asset-preview-status">{t("projectUi.characterVisualStatus" as InterfaceMessageKey, { status: asset.character.visualStatus === "ready" ? t("projectUi.bound" as InterfaceMessageKey) : t("projectUi.incomplete" as InterfaceMessageKey) })} · {t("projectUi.characterVoiceStatus" as InterfaceMessageKey, { status: asset.character.voiceStatus === "ready" ? t("projectUi.bound" as InterfaceMessageKey) : t("projectUi.unbound" as InterfaceMessageKey) })}</div></div> : <div className="project-asset-preview-facts"><span>{t("projectUi.versionNumber" as InterfaceMessageKey)} <strong>v{Math.max(1, asset.versionCount)}</strong></span><span>{t("projectUi.referenceCount" as InterfaceMessageKey, { count: asset.usages.length })}</span></div>}
                </aside>
            </div> : null}
        </Modal>
    );
}

function characterDefinition(values: CharacterForm) {
    const definition: Record<string, unknown> = Object.fromEntries(characterFields.map(([key]) => [key, values[key]?.trim() || (key === "aliases" ? [] : "")]));
    definition.aliases = values.aliases?.split(/[，,]/).map((item) => item.trim()).filter(Boolean) || [];
    return definition;
}

function fieldValue(value: unknown) { return Array.isArray(value) ? value.join("，") : typeof value === "string" ? value : ""; }
function syncPersonalCharacterProjection(asset: ProjectAsset) {
    if (!asset.character) return;
    const current = useAssetStore.getState().assets;
    const existing = current.find((item) => item.id === asset.id);
    const cover = asset.character.representations.find((item) => item.role === "turnaround_sheet") || asset.character.representations.find((item) => item.role === "primary") || asset.character.representations.find((item) => item.role === "front");
    const projected: EntityAsset = {
        id: asset.id,
        kind: "entity",
        title: asset.title,
        coverUrl: cover ? resourceFileUrl(cover.resourceId) : existing?.coverUrl || "",
        tags: existing?.tags || [],
        category: "character",
        status: asset.status as AssetStatus,
        primaryVersionId: asset.primaryVersionId,
        source: existing?.source || "project-character",
        createdAt: existing?.createdAt || asset.updatedAt,
        updatedAt: asset.updatedAt,
        data: { definition: asset.character.definition },
    };
    useAssetStore.getState().replaceAssets([projected, ...current.filter((item) => item.id !== asset.id)]);
}
function MediaIcon({ kind }: { kind: string }) { if (kind === "image") return <ImageIcon className="size-10" />; if (kind === "video") return <Video className="size-10" />; if (kind === "audio") return <Music2 className="size-10" />; if (kind === "model") return <Box className="size-10" />; return <FileText className="size-10" />; }
