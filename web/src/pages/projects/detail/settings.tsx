import { useInterfaceTranslation } from "@/stores/use-interface-locale-store";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { App, Button, Input, Modal } from "antd";
import { Select } from "@/components/ui/base/select";
import { Archive, Check, Eye, FolderOpen, Image as ImageIcon, Palette, Pencil, Save, ShieldAlert, Trash2 } from "lucide-react";

import { AssetLibraryPickerModal, type AssetLibraryPickerItem } from "@/components/assets/asset-library-picker-modal";
import { CanvasStyleDetailModal, CanvasStylePickerModal, resolveProjectCanvasStyle, type CanvasStylePreset } from "@/components/canvas/canvas-style-picker-modal";
import { ModelPicker } from "@/components/model-picker";
import { createStyleProfileSnapshot, parseStyleProfile, resolveStyleExecutionPlan, serializeStyleProfile } from "@/lib/canvas/style-profile";
import { resourceFileUrl, resourceIdFromStorageKey } from "@/services/api/resources";
import { listProjectAssetsPage, updateProject } from "@/services/api/projects";
import { uploadImage } from "@/services/image-storage";
import { useAssetStore } from "@/stores/use-asset-store";
import { modelDisplayName, resolveModelRequestConfig, useEffectiveConfig } from "@/stores/use-config-store";

import type { ProjectDetailViewProps } from "./shared";

export default function ProjectSettingsView({ detail, refreshProject }: ProjectDetailViewProps) {
    const { t } = useInterfaceTranslation();
    const { message } = App.useApp();
    const effectiveConfig = useEffectiveConfig();
    const { project } = detail;
    const personalAssets = useAssetStore((state) => state.assets);
    const addAsset = useAssetStore((state) => state.addAsset);
    const [name, setName] = useState(project.name);
    const [description, setDescription] = useState(project.description || "");
    const [aspectRatio, setAspectRatio] = useState(project.aspectRatio);
    const [sourceType, setSourceType] = useState(project.sourceType);
    const [stylePresetId, setStylePresetId] = useState(project.stylePresetId || "");
    const [styleProfileJson, setStyleProfileJson] = useState(project.styleProfileJson || "");
    const [defaultImageModel, setDefaultImageModel] = useState(project.defaultImageModel || "");
    const [defaultVideoModel, setDefaultVideoModel] = useState(project.defaultVideoModel || "");
    const [styleDetail, setStyleDetail] = useState<CanvasStylePreset | null>(null);
    const [stylePickerOpen, setStylePickerOpen] = useState(false);
    const [styleEditorRequested, setStyleEditorRequested] = useState(false);
    const [archiveOpen, setArchiveOpen] = useState(false);
    const [coverPickerOpen, setCoverPickerOpen] = useState(false);
    const [coverPage, setCoverPage] = useState(1);
    const [coverPageSize, setCoverPageSize] = useState(40);
    const coverAssetsQuery = useQuery({
        queryKey: ["project", project.id, "assets", "cover-picker", coverPage, coverPageSize],
        queryFn: () => listProjectAssetsPage(project.id, { page: coverPage, pageSize: coverPageSize, mediaType: "image" }),
        enabled: coverPickerOpen,
    });
    const projectCoverAssets = coverAssetsQuery.data?.assets || [];
    useEffect(() => { setName(project.name); setDescription(project.description || ""); setAspectRatio(project.aspectRatio); setSourceType(project.sourceType); setStylePresetId(project.stylePresetId || ""); setStyleProfileJson(project.styleProfileJson || ""); setDefaultImageModel(project.defaultImageModel || ""); setDefaultVideoModel(project.defaultVideoModel || ""); }, [project]);
    const dirty = useMemo(() => name.trim() !== project.name || description !== (project.description || "") || aspectRatio !== project.aspectRatio || sourceType !== project.sourceType || stylePresetId !== (project.stylePresetId || "") || styleProfileJson !== (project.styleProfileJson || "") || defaultImageModel !== (project.defaultImageModel || "") || defaultVideoModel !== (project.defaultVideoModel || ""), [aspectRatio, defaultImageModel, defaultVideoModel, description, name, project, sourceType, stylePresetId, styleProfileJson]);
    const selectedStyle = useMemo(() => resolveProjectCanvasStyle(stylePresetId, styleProfileJson), [stylePresetId, styleProfileJson]);
    const styleProfile = useMemo(() => parseStyleProfile(styleProfileJson) || selectedStyle?.profile || (selectedStyle ? createStyleProfileSnapshot(selectedStyle) : null), [selectedStyle, styleProfileJson]);
    const enabledStyleAssets = styleProfile?.assets.filter((asset) => asset.enabled !== false) || [];
    const styleExecutionPlans = useMemo(() => {
        if (!styleProfile) return null;
        const imageConfig = resolveModelRequestConfig(effectiveConfig, effectiveConfig.imageModel || effectiveConfig.model);
        const videoConfig = resolveModelRequestConfig(effectiveConfig, effectiveConfig.videoModel || effectiveConfig.model);
        return {
            image: resolveStyleExecutionPlan(styleProfile, { mode: "image", model: imageConfig.model, interfaceType: imageConfig.interfaceType || imageConfig.apiFormat }),
            video: resolveStyleExecutionPlan(styleProfile, { mode: "video", model: videoConfig.model, interfaceType: videoConfig.interfaceType || videoConfig.apiFormat }),
        };
    }, [effectiveConfig, styleProfile]);
    const coverPickerItems = useMemo<AssetLibraryPickerItem[]>(() => {
        const result: AssetLibraryPickerItem[] = [];
        const seenResourceIds = new Set<string>();
        for (const asset of personalAssets) {
            if (asset.kind !== "image") continue;
            const resourceId = resourceIdFromStorageKey(asset.data.storageKey);
            if (!resourceId || seenResourceIds.has(resourceId)) continue;
            seenResourceIds.add(resourceId);
            result.push({ id: asset.id, title: asset.title, category: "image", kindLabel: "图片", asset, description: asset.note || "个人素材库", searchText: (asset.tags || []).join(" ") });
        }
        for (const asset of projectCoverAssets) {
            if (asset.mediaType !== "image") continue;
            const resourceId = resourceIdFromStorageKey(asset.storageKey);
            if (!resourceId || seenResourceIds.has(resourceId)) continue;
            seenResourceIds.add(resourceId);
            result.push({ id: `project:${asset.id}`, title: asset.title, category: "image", kindLabel: "项目图片", imageUrl: resourceFileUrl(resourceId), description: t("completeUi.008"), searchText: asset.title });
        }
        if (project.coverResourceId && !seenResourceIds.has(project.coverResourceId)) {
            result.unshift({ id: `current:${project.coverResourceId}`, title: t("completeUi.009"), category: "image", kindLabel: "当前主图", imageUrl: resourceFileUrl(project.coverResourceId) });
        }
        return result;
    }, [personalAssets, project.coverResourceId, projectCoverAssets]);
    const coverResourceByItemId = useMemo(() => new Map(coverPickerItems.flatMap((item) => {
        if (item.id.startsWith("current:")) return [[item.id, item.id.slice("current:".length)] as const];
        if (item.id.startsWith("project:")) {
            const asset = projectCoverAssets.find((entry) => `project:${entry.id}` === item.id);
            const resourceId = resourceIdFromStorageKey(asset?.storageKey);
            return resourceId ? [[item.id, resourceId] as const] : [];
        }
        const asset = personalAssets.find((entry) => entry.id === item.id);
        const resourceId = asset?.kind === "image" ? resourceIdFromStorageKey(asset.data.storageKey) : "";
        return resourceId ? [[item.id, resourceId] as const] : [];
    })), [coverPickerItems, personalAssets, projectCoverAssets]);
    const coverResourceByItemIdRef = useRef(new Map<string, string>());
    useEffect(() => {
        for (const [itemId, resourceId] of coverResourceByItemId) coverResourceByItemIdRef.current.set(itemId, resourceId);
    }, [coverResourceByItemId]);
    const currentCoverItemId = coverPickerItems.find((item) => coverResourceByItemId.get(item.id) === project.coverResourceId)?.id;
    const saveMutation = useMutation({ mutationFn: () => updateProject(project.id, { name: name.trim(), description, aspectRatio, sourceType, stylePresetId, styleProfileJson, defaultImageModel, defaultVideoModel }), onSuccess: () => { refreshProject(); message.success(t("completeUi.010")); }, onError: (error) => message.error(error instanceof Error ? error.message : "项目设置保存失败") });
    const archiveMutation = useMutation({ mutationFn: () => updateProject(project.id, { status: project.status === "archived" ? "active" : "archived" }), onSuccess: () => { setArchiveOpen(false); refreshProject(); message.success(project.status === "archived" ? "项目已恢复" : "项目已归档"); }, onError: (error) => message.error(error instanceof Error ? error.message : "项目状态更新失败") });
    const coverMutation = useMutation({ mutationFn: (coverResourceId: string) => updateProject(project.id, { coverResourceId }), onSuccess: (_, coverResourceId) => { setCoverPickerOpen(false); refreshProject(); message.success(coverResourceId ? "项目主图已更新" : "项目主图已移除"); }, onError: (error) => message.error(error instanceof Error ? error.message : "项目主图更新失败") });

    return (
        <div>
            <header className="flex items-end justify-between gap-3 pb-3"><div><h2 className="text-lg font-semibold">{t("projectUi.tabSettings")}</h2><p className="mt-1 text-xs text-foreground/48">{t("completeUi.011")}</p></div><Button type={dirty ? "primary" : "default"} icon={dirty ? <Save className="size-3.5" /> : <Check className="size-3.5" />} disabled={!dirty || !name.trim()} loading={saveMutation.isPending} onClick={() => saveMutation.mutate()}>{dirty ? t("completeUi.012") : t("settingsMemorySaved")}</Button></header>

            <section className="py-5">
                <h3 className="mb-3 text-sm font-semibold">{t("completeUi.013")}</h3>
                <div className="grid gap-x-4 gap-y-3 md:grid-cols-2 xl:grid-cols-4">
                    <Field label={t("projectUi.projectName")} className="xl:col-span-2"><Input value={name} onChange={(event) => setName(event.target.value)} /></Field>
                    <Field label={t("projectUi.defaultAspectRatio")}><Select className="w-full" value={aspectRatio} options={[{ label: t("completeUi.014"), value: "9:16" }, { label: t("completeUi.015"), value: "16:9" }, { label: t("completeUi.016"), value: "1:1" }]} onChange={setAspectRatio} /></Field>
                    <Field label={t("projectUi.contentSource")}><Select className="w-full" value={sourceType} options={[{ label: t("projectUi.sourceBlank"), value: "blank" }, { label: t("projectUi.importNovel"), value: "novel" }, { label: t("projectUi.sourceText"), value: "text" }]} onChange={setSourceType} /></Field>
                    <Field label={t("completeUi.017")} className="md:col-span-2 xl:col-span-4"><Input value={description} onChange={(event) => setDescription(event.target.value)} placeholder={t("completeUi.018")} /></Field>
                </div>
            </section>

            <section className="border-t border-border/70 py-5">
                <div className="mb-3"><h3 className="text-sm font-semibold">{t("completeUi.019")}</h3><p className="mt-0.5 text-[var(--fs-label)] text-foreground/45">{t("completeUi.020")}</p></div>
                <div className="grid gap-4 md:grid-cols-2">
                    <Field label={t("settingsUi.defaultImageModel")}>
                        <div className="flex items-center gap-2">
                            <ModelPicker config={effectiveConfig} value={defaultImageModel} capability="image" onChange={setDefaultImageModel} fullWidth placeholder={t("completeUi.021", { value0: modelDisplayName(effectiveConfig, effectiveConfig.imageModel) || t("modelUi.notConfigured") })} showSelectedPrice />
                            {defaultImageModel ? <Button type="text" size="small" onClick={() => setDefaultImageModel("")}>{t("completeUi.022")}</Button> : null}
                        </div>
                    </Field>
                    <Field label={t("settingsUi.defaultVideoModel")}>
                        <div className="flex items-center gap-2">
                            <ModelPicker config={effectiveConfig} value={defaultVideoModel} capability="video" onChange={setDefaultVideoModel} fullWidth placeholder={t("completeUi.021", { value0: modelDisplayName(effectiveConfig, effectiveConfig.videoModel) || t("modelUi.notConfigured") })} showSelectedPrice />
                            {defaultVideoModel ? <Button type="text" size="small" onClick={() => setDefaultVideoModel("")}>{t("completeUi.022")}</Button> : null}
                        </div>
                    </Field>
                </div>
            </section>

            <section className="border-t border-border/70 py-5">
                <div className="mb-3 flex items-center justify-between gap-3"><div><h3 className="text-sm font-semibold">{t("completeUi.023")}</h3><p className="mt-0.5 text-[var(--fs-label)] text-foreground/45">{t("completeUi.024")}</p></div><span className="text-[var(--fs-label)] text-foreground/40">{t("completeUi.025")}</span></div>
                <div className="flex flex-col gap-3 rounded-lg border border-border/70 bg-surface-active p-3 sm:flex-row sm:items-center">
                    {project.coverResourceId ? <img src={resourceFileUrl(project.coverResourceId)} alt={t("completeUi.026", { value0: project.name })} className="aspect-video w-full shrink-0 rounded-md bg-foreground/5 object-cover sm:w-52" /> : <span className="grid aspect-video w-full shrink-0 place-items-center rounded-md bg-foreground/5 text-foreground/30 sm:w-52"><ImageIcon className="size-6" /></span>}
                    <div className="min-w-0 flex-1"><div className="text-sm font-medium">{project.coverResourceId ? t("completeUi.027") : t("completeUi.028")}</div><p className="mt-1 text-xs leading-5 text-foreground/48">{t("completeUi.029")}</p></div>
                    <div className="flex shrink-0 gap-2"><Button icon={<FolderOpen className="size-3.5" />} onClick={() => { setCoverPage(1); setCoverPickerOpen(true); }}>{project.coverResourceId ? t("completeUi.030") : t("completeUi.031")}</Button>{project.coverResourceId ? <Button danger type="text" icon={<Trash2 className="size-3.5" />} loading={coverMutation.isPending} onClick={() => coverMutation.mutate("")}>{t("assetsUi.remove")}</Button> : null}</div>
                </div>
            </section>

            <section className="border-t border-border/70 py-5">
                <div className="mb-3 flex items-center justify-between gap-3"><div><h3 className="text-sm font-semibold">{t("entryProjectStyle")}</h3><p className="mt-0.5 text-[var(--fs-label)] text-foreground/45">{t("completeUi.032")}</p></div>{styleProfile ? <span className="text-[var(--fs-label)] text-foreground/52">{styleProfile.source === "user" ? t("completeUi.033") : styleProfile.source === "external" ? t("completeUi.034") : t("completeUi.035")}</span> : <span className="text-[var(--fs-label)] text-foreground/40">{t("previewUnset")}</span>}</div>
                <div className="flex flex-col gap-3 rounded-lg bg-surface-active p-3 lg:flex-row lg:items-center">
                    {selectedStyle ? <img src={selectedStyle.imageUrl} width="160" height="90" alt={t("canvasCompleteUi.styleExample", { value0: selectedStyle.title })} className="aspect-video w-40 shrink-0 rounded-md object-cover" /> : <span className="grid aspect-video w-40 shrink-0 place-items-center rounded-md bg-foreground/5 text-foreground/35"><Palette className="size-5" /></span>}
                    <div className="min-w-0 flex-1">
                        <div className="text-sm font-semibold">{styleProfile?.title || selectedStyle?.title || t("completeUi.037")}</div>
                        <p className="mt-1 line-clamp-2 text-xs leading-5 text-foreground/48">{styleProfile?.description || selectedStyle?.description || t("completeUi.038")}</p>
                        {styleProfile ? <div className="mt-2 flex flex-wrap gap-1">{styleProfile.tags.map((tag) => <span key={tag} className="rounded bg-foreground/10 px-1.5 py-0.5 text-[var(--fs-tiny)] text-foreground/55">{tag}</span>)}</div> : null}
                    </div>
                    <div className="flex shrink-0 flex-wrap gap-2"><Button icon={<Eye className="size-3.5" />} disabled={!selectedStyle} onClick={() => setStyleDetail(selectedStyle || null)}>{t("canvasCompleteUi.viewGuide")}</Button><Button icon={<Pencil className="size-3.5" />} disabled={!styleProfile} onClick={() => { setStyleEditorRequested(true); setStylePickerOpen(true); }}>{t("completeUi.039")}</Button><Button icon={<Palette className="size-3.5" />} onClick={() => { setStyleEditorRequested(false); setStylePickerOpen(true); }}>{selectedStyle ? t("projectUi.changeStyle") : t("entryChooseStyle")}</Button></div>
                </div>
                {styleProfile ? <div className="mt-2 grid grid-cols-2 gap-2 text-xs sm:grid-cols-5"><StyleMetric label={t("styleToolsUi.executionPolicy")} value={styleProfile.executionPolicy === "strict-assets" ? t("completeUi.040") : t("styleToolsUi.compatibleFallback")} /><StyleMetric label={t("completeUi.041")} value={t("exportSourceCount", { count: styleProfile.assets.length })} /><StyleMetric label={t("agentSkillLibraryUiEnabled")} value={t("exportSourceCount", { count: enabledStyleAssets.length })} /><StyleMetric label={t("completeUi.043")} value={styleExecutionStatusLabel(styleExecutionPlans?.image.status)} /><StyleMetric label={t("completeUi.044")} value={styleExecutionStatusLabel(styleExecutionPlans?.video.status)} /></div> : null}
                {styleExecutionPlans && (styleExecutionPlans.image.warnings.length || styleExecutionPlans.video.warnings.length) ? <div className="mt-2 grid gap-1 rounded-md bg-amber-500/5 px-3 py-2 text-[var(--fs-label)] leading-5 text-amber-600 dark:text-amber-400">{styleExecutionPlans.image.warnings.length ? <p>{t("completeUi.045")}{styleExecutionPlans.image.warnings.join("；")}</p> : null}{styleExecutionPlans.video.warnings.length ? <p>{t("completeUi.046")}{styleExecutionPlans.video.warnings.join("；")}</p> : null}</div> : null}
            </section>

            <section className="py-4">
                <div className="flex flex-col gap-3 rounded-lg bg-red-500/5 px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex min-w-0 items-center gap-2.5"><span className="grid size-7 shrink-0 place-items-center rounded bg-red-500/10 text-red-500"><Archive className="size-3.5" /></span><div className="min-w-0"><h3 className="text-sm font-medium">{project.status === "archived" ? t("completeUi.047") : t("completeUi.048")}</h3><p className="mt-0.5 text-[var(--fs-label)] text-foreground/48">{project.status === "archived" ? t("completeUi.049") : t("completeUi.050")}</p></div></div>
                    <Button size="small" danger={project.status !== "archived"} icon={project.status === "archived" ? <Check className="size-3.5" /> : <ShieldAlert className="size-3.5" />} onClick={() => setArchiveOpen(true)}>{project.status === "archived" ? t("completeUi.047") : t("completeUi.048")}</Button>
                </div>
            </section>

            <Modal className="workspace-modal workspace-modal-compact" title={project.status === "archived" ? t("completeUi.047") : t("completeUi.048")} open={archiveOpen} okText={project.status === "archived" ? t("completeUi.051") : t("completeUi.052")} cancelText={t("timelineCancel")} okButtonProps={{ danger: project.status !== "archived", loading: archiveMutation.isPending }} onCancel={() => setArchiveOpen(false)} onOk={() => archiveMutation.mutate()} styles={{ body: { paddingTop: 12 } }}><p className="m-0 text-sm leading-6 text-foreground/65">{project.status === "archived" ? t("completeUi.053") : t("completeUi.054")}</p></Modal>
            <AssetLibraryPickerModal
                open={coverPickerOpen}
                items={coverPickerItems}
                mediaKinds={["image"]}
                categoryLabels={{ all: t("completeUi.055"), image: t("contextImage") }}
                initialCategory="image"
                initialSelectedIds={currentCoverItemId ? [currentCoverItemId] : []}
                multiple={false}
                eyebrow="项目设置"
                title={t("completeUi.056")}
                confirmLabel={() => t("completeUi.057")}
                emptyTitle="素材库还没有图片"
                emptyDescription="可以从底部上传一张新图片，上传后会自动选中。"
                loading={coverAssetsQuery.isLoading}
                pagination={{ current: coverPage, pageSize: coverPageSize, total: coverAssetsQuery.data?.total || 0, onChange: (nextPage, nextPageSize) => { setCoverPage(nextPageSize !== coverPageSize ? 1 : nextPage); setCoverPageSize(nextPageSize); } }}
                upload={{ accept: "image/png,image/jpeg,image/webp,image/avif", description: t("completeUi.058"), onUpload: async (files) => {
                    const file = Array.from(files)[0];
                    if (!file?.type.startsWith("image/")) throw new Error(t("assetsUi.selectImageFile"));
                    const uploaded = await uploadImage(file);
                    const resourceId = resourceIdFromStorageKey(uploaded.storageKey);
                    if (!resourceId) throw new Error(t("completeUi.059"));
                    const id = addAsset({ kind: "image", title: file.name.replace(/\.[^.]+$/, "") || t("completeUi.023"), coverUrl: uploaded.url, tags: ["项目主图"], status: "confirmed", source: "项目设置", data: { dataUrl: uploaded.url, storageKey: uploaded.storageKey, width: uploaded.width, height: uploaded.height, bytes: uploaded.bytes, mimeType: uploaded.mimeType } });
                    return [id];
                } }}
                onClose={() => setCoverPickerOpen(false)}
                onConfirm={async (ids) => {
                    const id = ids[0];
                    let resourceId = coverResourceByItemIdRef.current.get(id);
                    if (!resourceId) {
                        const asset = useAssetStore.getState().assets.find((entry) => entry.id === id);
                        resourceId = asset?.kind === "image" ? resourceIdFromStorageKey(asset.data.storageKey) : "";
                    }
                    if (!resourceId) throw new Error("所选图片尚未同步到服务端资源库");
                    await coverMutation.mutateAsync(resourceId);
                }}
            />
            <CanvasStylePickerModal open={stylePickerOpen} value={stylePresetId} currentProfile={styleProfile} startInEditor={styleEditorRequested} onClose={() => { setStylePickerOpen(false); setStyleEditorRequested(false); }} onSelect={(preset) => { applyStyle(preset); setStylePickerOpen(false); setStyleEditorRequested(false); }} />
            <CanvasStyleDetailModal open={Boolean(styleDetail)} preset={styleDetail} selected={styleDetail?.id === stylePresetId} onClose={() => setStyleDetail(null)} onSelect={(preset) => { applyStyle(preset); setStyleDetail(null); }} />
        </div>
    );

    function applyStyle(preset: CanvasStylePreset) {
        setStylePresetId(preset.id);
        setStyleProfileJson(serializeStyleProfile(preset.profile || createStyleProfileSnapshot(preset)));
    }
}

function StyleMetric({ label, value }: { label: string; value: string }) {
    return <div className="min-w-0 rounded-md bg-surface-active px-3 py-2"><span className="block text-[var(--fs-tiny)] text-foreground/40">{label}</span><span className="mt-0.5 block truncate font-medium text-foreground/65">{value}</span></div>;
}

function styleExecutionStatusLabel(status?: "ready" | "degraded" | "blocked") {
    return status === "blocked" ? "不可执行" : status === "degraded" ? "降级执行" : "完整执行";
}

function Field({ label, className = "", children }: { label: string; className?: string; children: ReactNode }) {
    return <label className={`grid gap-1.5 text-xs ${className}`}><span className="font-medium text-foreground/62">{label}</span>{children}</label>;
}
