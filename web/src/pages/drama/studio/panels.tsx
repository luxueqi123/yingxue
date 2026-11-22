import type { InterfaceTranslate } from "@/lib/interface-locale";
import { useInterfaceTranslation } from "@/stores/use-interface-locale-store";
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { App, Button, Checkbox, Input, InputNumber, Select, Switch } from "antd";
import { AlertCircle, ArrowRight, CheckCheck, Clapperboard, Film, Gem, Inbox, Lock, MapPinned, Maximize2, PauseCircle, RefreshCw, RotateCcw, ScrollText, Sparkles, Upload, UserRound, UsersRound, Wand2 } from "lucide-react";

import { CanvasImagePreview } from "@/components/canvas/canvas-image-preview";
import { dramaChoiceKey } from "@/lib/drama/model-choice";
import {
    getDramaCastImpact,
    regenerateDramaCast,
    regenerateDramaCasts,
    setDramaCastImage,
    updateDramaCast,
    updateDramaSettings,
    type DramaCapability,
    type DramaCast,
    type DramaCastKind,
    type DramaInboxItem,
    type DramaMediaMode,
    type DramaReviewMode,
    type DramaSummary,
} from "@/services/api/drama";

import { aspectRatioValue, CAST_KIND_LABEL, formatCredits, MEDIA_MODE_LABEL, mediaBusy, MediaThumb, parseList } from "../drama-shared";
import { AssetSchemePicker } from "../asset-scheme";
import { DramaModelPicker, useDramaModelCatalog } from "../drama-model-picker";
import { PromptSkillField } from "../prompt-skill";
import { StoryboardRules } from "../storyboard-rules";
import { progressFillStyle } from "@/lib/drama/progress-fill";
import { uploadResourceFile } from "@/services/api/resources";

// 制作台的三个整页视图：设定（角色 / 道具 / 场景）、待处理、制作设置。都在主区域内展示，不使用抽屉遮挡。

// ===== 设定 =====

const CAST_KIND_ICON: Record<DramaCastKind, ReactNode> = { character: <UserRound className="size-6 opacity-30" />, prop: <Gem className="size-6 opacity-30" />, scene: <MapPinned className="size-6 opacity-30" /> };
const CAST_KINDS: DramaCastKind[] = ["character", "prop", "scene"];

type CastFilter = "all" | "failed" | "busy" | "locked";

/** 资产参考图统一横版 16:9；角色按参考图方案的画幅（内置方案均为 16:9）。图片完整显示不裁切，占位与成图同尺寸。 */
const ASSET_IMAGE_RATIO = "16:9";

function castRatio(kind: DramaCastKind, ratios: CastRatios) {
    const ratio = (kind === "character" && ratios.character) || ASSET_IMAGE_RATIO;
    const [width, height] = ratio.split(":").map(Number);
    const orientation = width && height ? (width > height ? "is-wide" : width < height ? "is-tall" : "is-square") : "is-tall";
    return { style: { "--drama-cast-ratio": aspectRatioValue(ratio) } as CSSProperties, orientation };
}

export type CastRatios = { character: string };

function CastImageLoading() {
    const { t } = useInterfaceTranslation();
    return <span className="drama-cast-media-state is-loading" role="status" aria-label={t("coverageUi.155")} />;
}
function CastImageFailed() {
    const { t } = useInterfaceTranslation();
    return (
    <span className="drama-cast-media-state">
        <AlertCircle className="size-3.5" />
        {t("coverageUi.156")}
    </span>
    );
}

export function CastPanel({
    projectId,
    cast,
    ratios,
    focusId,
    retrying,
    assetsPending,
    releasing,
    onFocus,
    onRetry,
    onChanged,
    onReleaseAssets,
}: {
    projectId: string;
    cast: DramaCast[];
    ratios: CastRatios;
    focusId: string;
    retrying: boolean;
    assetsPending: boolean;
    releasing: boolean;
    onFocus: (id: string) => void;
    onRetry: () => void;
    onChanged: () => void;
    onReleaseAssets: () => void;
}) {
    const { t } = useInterfaceTranslation();
    const [kind, setKind] = useState<DramaCastKind>("character");
    const [filter, setFilter] = useState<CastFilter>("all");
    const focused = cast.find((item) => item.id === focusId);
    useEffect(() => {
        if (focused) setKind(focused.kind);
    }, [focused]);
    const ofKind = cast.filter((item) => item.kind === kind);
    const failed = cast.filter((item) => item.imageStatus === "failed").length;
    const count = (predicate: (item: DramaCast) => boolean) => ofKind.filter(predicate).length;
    const filters: Array<[CastFilter, string, number]> = [
        ["all", "全部", ofKind.length],
        ["failed", "失败", count((item) => item.imageStatus === "failed")],
        ["busy", "生成中", count((item) => mediaBusy(item.imageStatus))],
        ["locked", "已锁定", count((item) => item.locked)],
    ];
    const list = ofKind.filter((item) => {
        if (filter === "failed") return item.imageStatus === "failed";
        if (filter === "busy") return mediaBusy(item.imageStatus);
        if (filter === "locked") return item.locked;
        return true;
    });
    const active = focused && focused.kind === kind ? focused : list[0];
    const kindRatio = castRatio(kind, ratios);
    return (
        <div className="drama-view drama-cast-layout">
            <section className="drama-view-main">
                <div className="drama-view-head">
                    <div className="drama-tabs" role="tablist" aria-label={t("coverageUi.157")}>
                        {CAST_KINDS.map((value) => (
                            <button key={value} type="button" role="tab" className="drama-tab" aria-selected={kind === value} onClick={() => setKind(value)}>
                                {t(CAST_KIND_LABEL[value])}
                                <span className="drama-tab-count">{cast.filter((item) => item.kind === value).length}</span>
                            </button>
                        ))}
                    </div>
                    <div className="drama-filters" role="group" aria-label={t("layoutExtrasUi.filter")}>
                        {filters.map(([key, label, value]) => (
                            <button key={key} type="button" className={`drama-filter ${key === "failed" && value ? "is-alert" : ""}`} aria-pressed={filter === key} onClick={() => setFilter(key)}>
                                {label}
                                <b>{value}</b>
                            </button>
                        ))}
                    </div>
                    {failed ? (
                        <Button className="!ml-auto" icon={<RotateCcw className="size-4" />} loading={retrying} onClick={onRetry}>
                            {t("coverageUi.158")} {failed} {t("modelUi.itemUnit")}
                        </Button>
                    ) : null}
                </div>
                <div className="drama-view-scroll thin-scrollbar">
                    {assetsPending && cast.some((item) => item.imageStatus === "") ? (
                        <div className="drama-banner is-ready is-flush">
                            <Sparkles className="size-5 shrink-0 text-[var(--workspace-accent)]" />
                            <div className="drama-banner-text">
                                <strong>{t("coverageUi.159")}</strong>
                                <span>{t("coverageUi.160")}</span>
                            </div>
                            <Button type="primary" icon={<Sparkles className="size-4" />} loading={releasing} onClick={onReleaseAssets}>
                                {t("coverageUi.161")}
                            </Button>
                        </div>
                    ) : null}
                    <div className={`drama-cast-grid ${kindRatio.orientation}`}>
                        {list.map((item) => (
                            <button key={item.id} type="button" className="drama-cast-card" aria-current={item.id === active?.id} onClick={() => onFocus(item.id)}>
                                <div className="drama-cast-card-media" style={kindRatio.style}>
                                    {item.imageResourceId ? <MediaThumb resourceId={item.imageResourceId} alt={item.name} loading={<CastImageLoading />} failed={<CastImageFailed />} /> : null}
                                    {!item.imageResourceId || mediaBusy(item.imageStatus) || item.imageStatus === "failed" || item.imageStatus === "" ? (
                                        <div className={`drama-shot-placeholder ${mediaBusy(item.imageStatus) ? "is-busy" : ""}`}>
                                            {item.imageStatus === "failed" ? (
                                                <span className="drama-cast-card-failed">
                                                    <AlertCircle className="size-3.5" />
                                                    {t("creationPageShotStatusGenerationFailed")}
                                                </span>
                                            ) : item.imageResourceId ? (
                                                t("coverageUi.162")
                                            ) : (
                                                CAST_KIND_ICON[item.kind]
                                            )}
                                        </div>
                                    ) : null}
                                    {item.locked ? (
                                        <span className="drama-shot-flags">
                                            <span className="drama-flag is-lock">
                                                <Lock className="size-3" />
                                            </span>
                                        </span>
                                    ) : null}
                                </div>
                                <div className="drama-cast-card-body">
                                    <strong>{item.name}</strong>
                                    <span>{item.role || parseList(item.aliasesJson).join("、") || item.description || "—"}</span>
                                </div>
                            </button>
                        ))}
                    </div>
                    {!list.length ? (
                        <div className="drama-empty">
                            <UserRound className="size-7" />
                            <span>{ofKind.length ? t("coverageUi.163") : t("coverageUi.164", { value0: t(CAST_KIND_LABEL[kind]) })}</span>
                        </div>
                    ) : null}
                </div>
            </section>
            <aside className="drama-view-side thin-scrollbar">
                {active ? (
                    <CastEditor key={active.id} projectId={projectId} cast={active} ratios={ratios} onChanged={onChanged} />
                ) : (
                    <div className="drama-empty is-compact">
                        <span>{t("coverageUi.165")}</span>
                    </div>
                )}
            </aside>
        </div>
    );
}

function CastEditor({ projectId, cast, ratios, onChanged }: { projectId: string; cast: DramaCast; ratios: CastRatios; onChanged: () => void }) {
    const { t } = useInterfaceTranslation();
    const { message } = App.useApp();
    const [previewing, setPreviewing] = useState(false);
    const [name, setName] = useState(cast.name);
    const [aliases, setAliases] = useState(parseList(cast.aliasesJson));
    const [appearance, setAppearance] = useState(cast.appearance);
    const [voiceInstructions, setVoiceInstructions] = useState(cast.voiceInstructions);
    const [restyle, setRestyle] = useState(true);
    const impactQuery = useQuery({ queryKey: ["drama", projectId, "cast-impact", cast.id], queryFn: ({ signal }) => getDramaCastImpact(projectId, cast.id, signal) });
    const dirty = name !== cast.name || appearance !== cast.appearance || voiceInstructions !== cast.voiceInstructions || aliases.join("|") !== parseList(cast.aliasesJson).join("|");
    const fields = { name, aliases, appearance, voiceInstructions };
    const save = useMutation({
        mutationFn: () => updateDramaCast(projectId, cast.id, fields),
        onSuccess: () => {
            message.success(t("coverageUi.166"));
            onChanged();
        },
        onError: (error) => message.error(error instanceof Error ? error.message : t("titleSaveFailed")),
    });
    const lock = useMutation({ mutationFn: (locked: boolean) => updateDramaCast(projectId, cast.id, { locked }), onSuccess: onChanged });
    const regenerate = useMutation({
        mutationFn: async () => {
            if (dirty) await updateDramaCast(projectId, cast.id, fields);
            return regenerateDramaCast(projectId, cast.id, restyle);
        },
        onSuccess: (result) => {
            message.success(result.affectedSegments ? `正在重新生成参考图；${result.affectedSegments} 个剧情段的视频需重新生成` : "正在重新生成参考图");
            onChanged();
        },
        onError: (error) => message.error(error instanceof Error ? error.message : t("tasksUi.actionFailed")),
    });
    // 上传的形象图直接成为参考图并锁定：不会被重新生成覆盖，剧情段视频按这张图生成。
    const fileRef = useRef<HTMLInputElement>(null);
    const upload = useMutation({
        mutationFn: async (file: File) => {
            const resource = await uploadResourceFile(file, "image", { fileName: file.name });
            return setDramaCastImage(projectId, cast.id, resource.id, restyle);
        },
        onSuccess: (result) => {
            message.success(result.affectedSegments ? `已替换并锁定形象；${result.affectedSegments} 个剧情段的视频需重新生成` : "已替换并锁定形象，之后的剧情段视频按这张图生成");
            onChanged();
        },
        onError: (error) => message.error(error instanceof Error ? error.message : t("assetsUi.uploadFailed")),
    });
    const impact = impactQuery.data;
    const isCharacter = cast.kind === "character";
    const kindLabel = t(CAST_KIND_LABEL[cast.kind]);
    return (
        <div className="drama-editor">
            <div className="drama-cast-hero" style={castRatio(cast.kind, ratios).style}>
                {cast.imageResourceId ? <MediaThumb resourceId={cast.imageResourceId} alt={cast.name} loading={<CastImageLoading />} failed={<CastImageFailed />} /> : null}
                {cast.imageResourceId ? (
                    <button type="button" className="drama-cast-hero-zoom" aria-label={t("coverageUi.167", { value0: cast.name })} title={t("coverageUi.168")} onClick={() => setPreviewing(true)}>
                        <span className="drama-cast-hero-zoom-hint" aria-hidden="true">
                            <Maximize2 className="size-3.5" />
                        </span>
                    </button>
                ) : null}
                {!cast.imageResourceId || mediaBusy(cast.imageStatus) || cast.imageStatus === "failed" ? (
                    <div className={`drama-shot-placeholder ${mediaBusy(cast.imageStatus) ? "is-busy" : ""}`}>
                        {cast.imageStatus === "failed" ? (
                            <span className="drama-cast-card-failed">
                                <AlertCircle className="size-4" />
                                {t("coverageUi.169")}
                            </span>
                        ) : mediaBusy(cast.imageStatus) ? (
                            t("coverageUi.170")
                        ) : (
                            t("coverageUi.171")
                        )}
                    </div>
                ) : null}
            </div>
            <div className="drama-editor-row">
                <span className="drama-eyebrow">{kindLabel}{t("coverageUi.025")}</span>
                <label className="drama-switch-label">
                    <Lock className="size-3.5" />
                    {t("coverageUi.172")}
                    <Switch size="small" checked={cast.locked} loading={lock.isPending} onChange={(checked) => lock.mutate(checked)} />
                </label>
            </div>
            <Field label={t("canvasCompleteUi.name")}>
                <Input value={name} maxLength={60} onChange={(event) => setName(event.target.value)} aria-label={t("canvasCompleteUi.name")} />
            </Field>
            {isCharacter ? (
                <Field label={t("coverageUi.173")} hint={t("coverageUi.174")}>
                    <Select mode="tags" className="w-full" value={aliases} onChange={setAliases} tokenSeparators={[",", "，", "、"]} placeholder={t("assetsUi.tagsPlaceholder")} open={false} suffixIcon={null} aria-label={t("coverageUi.173")} />
                </Field>
            ) : null}
            <Field label={APPEARANCE_LABEL[cast.kind]} hint="用于参考图与剧情段视频提示词">
                <Input.TextArea value={appearance} autoSize={{ minRows: 4, maxRows: 10 }} onChange={(event) => setAppearance(event.target.value)} aria-label={APPEARANCE_LABEL[cast.kind]} />
            </Field>
            {isCharacter ? (
                <Field label={t("coverageUi.175")} hint={t("coverageUi.176")}>
                    <Input value={voiceInstructions} placeholder={t("coverageUi.177")} onChange={(event) => setVoiceInstructions(event.target.value)} aria-label={t("coverageUi.175")} />
                </Field>
            ) : null}
            <div className="drama-editor-impact">
                <Checkbox checked={restyle} onChange={(event) => setRestyle(event.target.checked)}>
                    {t("coverageUi.178")}
                </Checkbox>
                {impact ? (
                    <span>
                        {t("dramaUi.episodes", { count: impact.episodes })} · {impact.segments} {t("canvasVideoSegmentUi010")}
                    </span>
                ) : null}
            </div>
            <div className="drama-editor-actions">
                <Button disabled={!dirty} loading={save.isPending} onClick={() => save.mutate()}>
                    {t("coverageUi.179")}
                </Button>
                <Button icon={<Upload className="size-4" />} loading={upload.isPending} onClick={() => fileRef.current?.click()}>
                    {t("coverageUi.180")}
                </Button>
                <input
                    ref={fileRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="hidden"
                    aria-label={t("coverageUi.181", { value0: cast.name })}
                    onChange={(event) => {
                        const file = event.target.files?.[0];
                        event.target.value = "";
                        if (!file) return;
                        if (!file.type.startsWith("image/")) {
                            message.warning(t("coverageUi.182"));
                            return;
                        }
                        if (file.size > 20 * 1024 * 1024) {
                            message.warning(t("coverageUi.183"));
                            return;
                        }
                        upload.mutate(file);
                    }}
                />
                <Button type="primary" className="drama-editor-wide" icon={<RefreshCw className="size-4" />} disabled={cast.locked || mediaBusy(cast.imageStatus)} loading={regenerate.isPending} onClick={() => regenerate.mutate()}>
                    {cast.imageResourceId ? (dirty ? t("coverageUi.184") : t("creationPageRetry")) : dirty ? t("coverageUi.185") : t("coverageUi.186")}
                </Button>
            </div>
            <p className="drama-editor-note">{t("coverageUi.187")}</p>
            {previewing && cast.imageResourceId ? <CanvasImagePreview storageKey={`resource:${cast.imageResourceId}`} alt={t("coverageUi.188", { value0: cast.name, value1: kindLabel })} onClose={() => setPreviewing(false)} /> : null}
        </div>
    );
}

const APPEARANCE_LABEL: Record<DramaCastKind, string> = { character: "外貌描述", prop: "外形描述", scene: "环境描述" };

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
    return (
        <div className="drama-field">
            <div className="drama-field-label">
                <span>{label}</span>
                {hint ? <small>{hint}</small> : null}
            </div>
            {children}
        </div>
    );
}

// ===== 待处理 =====

type InboxGroup = {
    key: string;
    kind: DramaInboxItem["kind"];
    severity: DramaInboxItem["severity"];
    title: string;
    reason: string;
    items: DramaInboxItem[];
};

const KIND_ORDER: DramaInboxItem["kind"][] = ["paused", "media_ready", "review", "episode_error", "cast_failed", "segment_failed"];
const MEDIA_LABEL: Record<NonNullable<DramaInboxItem["media"]>, string> = { prompt: "提示词", video: "视频" };

/** 同类、同原因的问题折叠成一组：12 个角色同样的失败只占一张卡。 */
function groupInbox(items: DramaInboxItem[], t: InterfaceTranslate): InboxGroup[] {
    const groups = new Map<string, InboxGroup>();
    for (const item of items) {
        const reason = item.kind === "review" ? "" : item.detail;
        const key = [item.kind, item.castKind || "", item.media || "", reason].join("|");
        const group = groups.get(key);
        if (group) group.items.push(item);
        else groups.set(key, { key, kind: item.kind, severity: item.severity, title: "", reason, items: [item] });
    }
    for (const group of groups.values()) {
        const count = group.items.length;
        const first = group.items[0];
        if (group.kind === "paused") group.title = t("coverageUi.035");
        else if (group.kind === "media_ready") group.title = first.title;
        else if (group.kind === "review") group.title = count > 1 ? t("dramaUi.episodesReview", { count }) : first.title;
        else if (group.kind === "episode_error") group.title = count > 1 ? t("dramaUi.episodesError", { count }) : first.title;
        else if (group.kind === "cast_failed") group.title = t("dramaUi.castReferenceError", { count, kind: t(CAST_KIND_LABEL[first.castKind || "character"]) });
        else group.title = t("dramaUi.segmentMediaError", { count, kind: t(first.media === "prompt" ? "workflowUi.prompt" : "contextVideo") });
    }
    return [...groups.values()].sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) || b.items.length - a.items.length);
}

const GROUP_ICON: Record<DramaInboxItem["kind"], ReactNode> = {
    paused: <PauseCircle className="size-[18px]" />,
    media_ready: <Sparkles className="size-[18px]" />,
    review: <CheckCheck className="size-[18px]" />,
    episode_error: <ScrollText className="size-[18px]" />,
    cast_failed: <UserRound className="size-[18px]" />,
    segment_failed: <Film className="size-[18px]" />,
};

const MEDIA_ICON: Record<NonNullable<DramaInboxItem["media"]>, ReactNode> = {
    prompt: <ScrollText className="size-3" />,
    video: <Film className="size-3" />,
};

const CHIP_LIMIT = 24;

export function InboxPanel({
    items,
    castById,
    retrying,
    retryingGroup,
    releasing,
    onRetryAll,
    onRetryGroup,
    onOpen,
    onOpenSettings,
    onReleaseAll,
}: {
    items: DramaInboxItem[];
    castById: Map<string, DramaCast>;
    retrying: boolean;
    retryingGroup: string;
    onRetryAll: () => void;
    onRetryGroup: (key: string, items: DramaInboxItem[]) => void;
    onOpen: (item: DramaInboxItem) => void;
    onOpenSettings: () => void;
    releasing: boolean;
    onReleaseAll: () => void;
}) {
    const { t } = useInterfaceTranslation();
    const groups = useMemo(() => groupInbox(items, t), [items, t]);
    const failures = items.filter((item) => item.severity === "error").length;
    const reviews = items.filter((item) => item.kind === "review").length;
    return (
        <div className="drama-view">
            <section className="drama-view-main">
                <div className="drama-view-head">
                    <h2 className="drama-view-title">{t("projectUi.pending")}</h2>
                    {items.length ? (
                        <div className="drama-inbox-summary">
                            {failures ? (
                                <span className="is-err">
                                    <AlertCircle className="size-3.5" />
                                    {failures} {t("coverageUi.189")}
                                </span>
                            ) : null}
                            {reviews ? (
                                <span className="is-info">
                                    <CheckCheck className="size-3.5" />
                                    {reviews} {t("coverageUi.190")}
                                </span>
                            ) : null}
                            <span>{t("dramaUi.categories", { count: groups.length })}</span>
                        </div>
                    ) : null}
                    {failures ? (
                        <Button className="!ml-auto" icon={<RotateCcw className="size-4" />} loading={retrying} onClick={onRetryAll}>
                            {t("coverageUi.193")}
                        </Button>
                    ) : null}
                </div>
                <div className="drama-view-scroll thin-scrollbar">
                    {groups.length ? (
                        <div className="drama-inbox">
                            {groups.map((group) => {
                                const retryable = group.kind === "cast_failed" || group.kind === "segment_failed";
                                return (
                                    <article key={group.key} className={`drama-inbox-card is-${group.severity}`}>
                                        <header className="drama-inbox-card-head">
                                            <span className={`drama-inbox-icon is-${group.severity}`}>{GROUP_ICON[group.kind]}</span>
                                            <div className="min-w-0 flex-1">
                                                <h3>{group.title}</h3>
                                                {group.kind === "review" ? (
                                                    <p>{t("coverageUi.194")}</p>
                                                ) : group.kind === "cast_failed" ? (
                                                    <p>{t("coverageUi.195")}</p>
                                                ) : group.kind === "media_ready" ? (
                                                    <p>{group.items[0].detail}</p>
                                                ) : null}
                                            </div>
                                            <div className="drama-inbox-card-actions">
                                                {group.kind === "paused" ? (
                                                    <Button size="small" onClick={onOpenSettings}>
                                                        {t("projectUi.goToSettings")}
                                                    </Button>
                                                ) : null}
                                                {group.kind === "media_ready" ? (
                                                    <Button size="small" type="primary" icon={<Sparkles className="size-3.5" />} loading={releasing} onClick={onReleaseAll}>
                                                        {t("coverageUi.196")}
                                                    </Button>
                                                ) : null}
                                                {retryable ? (
                                                    <Button size="small" icon={<RotateCcw className="size-3.5" />} loading={retryingGroup === group.key} onClick={() => onRetryGroup(group.key, group.items)}>
                                                        {t("authRetry")}{group.items.length > 1 ? t("coverageUi.197", { value0: group.items.length }) : ""}
                                                    </Button>
                                                ) : null}
                                                {group.items.length === 1 && group.kind !== "paused" && group.kind !== "media_ready" ? (
                                                    <Button size="small" type={group.kind === "review" ? "primary" : "default"} onClick={() => onOpen(group.items[0])}>
                                                        {group.kind === "review" ? t("coverageUi.198") : t("storageUi.viewOrder")}
                                                        <ArrowRight className="size-3.5" />
                                                    </Button>
                                                ) : null}
                                            </div>
                                        </header>
                                        {group.reason && group.kind !== "media_ready" ? (
                                            <div className="drama-inbox-reason" title={group.reason}>
                                                <span>{t("coverageUi.199")}</span>
                                                <code>{group.reason}</code>
                                            </div>
                                        ) : null}
                                        {group.items.length > 1 || group.kind === "cast_failed" ? (
                                            <div className="drama-inbox-chips">
                                                {group.items.slice(0, CHIP_LIMIT).map((item) => (
                                                    <InboxChip key={item.id} item={item} cast={item.castId ? castById.get(item.castId) : undefined} onOpen={onOpen} />
                                                ))}
                                                {group.items.length > CHIP_LIMIT ? <span className="drama-inbox-more">{t("coverageUi.200")} {group.items.length - CHIP_LIMIT} {t("projectUi.itemUnit")}</span> : null}
                                            </div>
                                        ) : null}
                                    </article>
                                );
                            })}
                        </div>
                    ) : (
                        <div className="drama-empty is-tall">
                            <Inbox className="size-8" />
                            <strong>{t("coverageUi.201")}</strong>
                            <span>{t("coverageUi.202")}</span>
                        </div>
                    )}
                </div>
            </section>
        </div>
    );
}

function InboxChip({ item, cast, onOpen }: { item: DramaInboxItem; cast?: DramaCast; onOpen: (item: DramaInboxItem) => void }) {
    const { t } = useInterfaceTranslation();
    let content: ReactNode;
    if (item.kind === "cast_failed") {
        content = (
            <>
                <span className="drama-avatar">{cast?.imageResourceId ? <MediaThumb resourceId={cast.imageResourceId} alt="" /> : item.title.slice(0, 1)}</span>
                {item.title}
            </>
        );
    } else if (item.kind === "segment_failed") {
        content = (
            <>
                {item.media ? MEDIA_ICON[item.media] : null}{t("uiCompletion.episodeSegment", { episode: item.episodeNumber ?? "–", segment: item.segmentIndex + 1 })}
            </>
        );
    } else if (item.kind === "review") {
        content = (
            <>
                <Clapperboard className="size-3" />
                {item.title}
            </>
        );
    } else {
        content = item.title;
    }
    return (
        <button type="button" className={`drama-inbox-chip ${item.kind === "cast_failed" ? "has-avatar" : ""}`} title={item.detail} onClick={() => onOpen(item)}>
            {content}
        </button>
    );
}

// ===== 制作设置 =====

const CAPABILITY_META: Record<DramaCapability, { label: string; hint: string }> = {
    text: { label: "改编与分镜", hint: "改编剧本、拆分剧情段与镜头" },
    image: { label: "参考图", hint: "角色、道具与场景参考图" },
    video: { label: "剧情段视频", hint: "每段一个带对白与音效的视频，可按段换模型" },
};
const REVIEW_LABEL: Record<DramaReviewMode, { title: string; detail: string }> = {
    sample: { title: "先看样片", detail: "第 1 集成片确认后继续其余集" },
    every: { title: "每集确认", detail: "每集生成视频前停下来审阅段视频提示词" },
    auto: { title: "全自动", detail: "不打断，直接跑到成片" },
};
const CONCURRENCY = [2, 4, 6, 8, 12, 16];

export function SettingsPanel({ projectId, summary, cast, onChanged }: { projectId: string; summary: DramaSummary; cast: DramaCast[]; onChanged: () => void }) {
    const { t } = useInterfaceTranslation();
    const { message, modal } = App.useApp();
    const current = summary.production.settings;
    const [settings, setSettings] = useState(current);
    const [budget, setBudget] = useState(summary.production.budgetMicrocredits / 1_000_000);
    useEffect(() => {
        setSettings(summary.production.settings);
        setBudget(summary.production.budgetMicrocredits / 1_000_000);
    }, [summary.production.settings, summary.production.budgetMicrocredits]);
    const dirty = useMemo(() => JSON.stringify(settings) !== JSON.stringify(current) || Math.round(budget * 1_000_000) !== summary.production.budgetMicrocredits, [budget, current, settings, summary.production.budgetMicrocredits]);
    const save = useMutation({
        mutationFn: () => updateDramaSettings(projectId, { settings, budgetMicrocredits: Math.max(0, Math.round((budget || 0) * 1_000_000)) }),
        onSuccess: () => {
            message.success(t("coverageUi.206"));
            onChanged();
        },
        onError: (error) => message.error(error instanceof Error ? error.message : t("titleSaveFailed")),
    });
    const [restyleSegments, setRestyleSegments] = useState(true);
    const regenerateAll = useMutation({
        mutationFn: (kind: DramaCastKind) => regenerateDramaCasts(projectId, kind, restyleSegments),
        onSuccess: (result, kind) => {
            message.success(t("coverageUi.207", { value0: result.queued, value1: t(CAST_KIND_LABEL[kind]), value2: result.skipped ? `，${result.skipped} 个已锁定或正在生成` : "", value3: result.affectedSegments ? `，${result.affectedSegments} 个剧情段需重新生成` : "" }));
            onChanged();
        },
        onError: (error) => message.error(error instanceof Error ? error.message : t("tasksUi.actionFailed")),
    });
    const catalogQuery = useDramaModelCatalog();
    const videoOption = catalogQuery.data?.options.video?.find((option) => dramaChoiceKey(option.choice) === dramaChoiceKey(settings.models.video));
    const sampleCharacter = cast.find((item) => item.kind === "character" && item.appearance);
    const sampleScene = cast.find((item) => item.kind === "scene" && item.appearance);
    const countOf = (kind: DramaCastKind) => cast.filter((item) => item.kind === kind).length;
    const spent = summary.production.spentMicrocredits;
    const budgetMicro = Math.round((budget || 0) * 1_000_000);
    const usage = budgetMicro > 0 ? Math.min(1, spent / budgetMicro) : 0;
    return (
        <div className="drama-view">
            <section className="drama-view-main">
                <div className="drama-view-head">
                    <h2 className="drama-view-title">{t("coverageUi.208")}</h2>
                    <span className="drama-view-sub">{dirty ? t("coverageUi.209") : t("coverageUi.210")}</span>
                    <div className="ml-auto flex gap-2">
                        <Button
                            disabled={!dirty}
                            onClick={() => {
                                setSettings(current);
                                setBudget(summary.production.budgetMicrocredits / 1_000_000);
                            }}
                        >
                            {t("canvasCompleteUi.restore")}
                        </Button>
                        <Button type="primary" disabled={!dirty} loading={save.isPending} onClick={() => save.mutate()}>
                            {t("completeUi.012")}
                        </Button>
                    </div>
                </div>
                <div className="drama-view-scroll thin-scrollbar">
                    <div className="drama-cfg">
                        <div className="drama-cfg-main">
                            <section className="drama-cfg-card">
                                <SettingsTitle title={t("drama.create.storyboardRulesTitle")} detail="对之后改编的集生效；已改编的集可在剧本页“重新改编”" icon={<Clapperboard className="size-4" />} />
                                <StoryboardRules
                                    value={settings.storyboard}
                                    onChange={(storyboard) => setSettings({ ...settings, storyboard })}
                                    episodeSeconds={settings.episodeSeconds}
                                    onEpisodeSecondsChange={(episodeSeconds) => setSettings({ ...settings, episodeSeconds })}
                                    maxVideoSeconds={videoOption?.maxVideoSeconds}
                                    videoModelLabel={settings.models.video?.label}
                                    bare
                                />
                            </section>
                            <section className="drama-cfg-card">
                                <SettingsTitle title={t("drama.create.promptSkillTitle")} detail="撰写剧情段视频提示词时遵循的写作方法；对之后撰写的段生效" icon={<ScrollText className="size-4" />} />
                                <PromptSkillField value={settings.promptSkill} onChange={(promptSkill) => setSettings({ ...settings, promptSkill })} />
                            </section>
                            <section className="drama-cfg-card">
                                <SettingsTitle title={t("assetScheme.schemeGroupLabel")} detail="参考图随剧情段视频请求一起发送，是人物与道具保持一致的锚点；修改只影响之后生成的参考图" icon={<UsersRound className="size-4" />} />
                                <AssetSchemePicker
                                    value={settings.assets}
                                    onChange={(assets) => setSettings({ ...settings, assets })}
                                    sample={{ style: settings.stylePrompt, characterName: sampleCharacter?.name, characterAppearance: sampleCharacter?.appearance, sceneName: sampleScene?.name, sceneAppearance: sampleScene?.appearance }}
                                />
                                <div className="drama-settings-regen">
                                    <div>
                                        <strong>{t("coverageUi.211")}</strong>
                                        <span>
                                            {CAST_KINDS.map((kind) => t("canvasPrevisDyn002", { count: countOf(kind), label: t(CAST_KIND_LABEL[kind]) })).join(" · ")}{t("coverageUi.212")}{dirty ? t("coverageUi.213") : ""}
                                        </span>
                                    </div>
                                    <Checkbox checked={restyleSegments} onChange={(event) => setRestyleSegments(event.target.checked)}>
                                        {t("coverageUi.214")}
                                    </Checkbox>
                                    {CAST_KINDS.map((kind) => (
                                        <Button
                                            key={kind}
                                            disabled={dirty || !countOf(kind)}
                                            loading={regenerateAll.isPending && regenerateAll.variables === kind}
                                            onClick={() =>
                                                modal.confirm({
                                                    title: t("coverageUi.215", { value0: countOf(kind), value1: t(CAST_KIND_LABEL[kind]) }),
                                                    content: `每张参考图都会重新生成并计费${restyleSegments ? "，引用它们且已生成的剧情段视频需要重新生成" : ""}。旧版本保留在版本记录中。`,
                                                    okText: "开始重做",
                                                    cancelText: t("timelineCancel"),
                                                    centered: true,
                                                    onOk: () => regenerateAll.mutateAsync(kind),
                                                })
                                            }
                                        >
                                            {t("canvasToolbarRedo")}{t(CAST_KIND_LABEL[kind])}
                                        </Button>
                                    ))}
                                </div>
                            </section>
                            <section className="drama-cfg-card">
                                <SettingsTitle title={t("drama.create.modelSectionTitle")} detail="只列出平台可无人值守执行的模型" icon={<Wand2 className="size-4" />} />
                                <div className="drama-cfg-models">
                                    {(Object.keys(CAPABILITY_META) as DramaCapability[]).map((capability) => (
                                        <div key={capability} className="drama-cfg-model">
                                            <div className="drama-cfg-model-label">
                                                <strong>{CAPABILITY_META[capability].label}</strong>
                                                <small>{CAPABILITY_META[capability].hint}</small>
                                            </div>
                                            <DramaModelPicker
                                                capability={capability}
                                                value={settings.models[capability]}
                                                placeholder={t("composerSelectModel", { mode: CAPABILITY_META[capability].label })}
                                                onChange={(choice) => setSettings({ ...settings, models: { ...settings.models, [capability]: choice } })}
                                            />
                                        </div>
                                    ))}
                                </div>
                            </section>
                        </div>
                        <aside className="drama-cfg-side">
                            <section className="drama-cfg-card">
                                <SettingsTitle title={t("createUiWork")} detail="开工时确定" />
                                <dl className="drama-cfg-kv">
                                    <div>
                                        <dt>{t("createUiAspect")}</dt>
                                        <dd>{current.aspectRatio}</dd>
                                    </div>
                                    <div>
                                        <dt>{t("drama.stylePicker.title")}</dt>
                                        <dd title={current.styleName}>{current.styleName || "—"}</dd>
                                    </div>
                                    <div>
                                        <dt>{t("drama.create.dialogueLanguageLabel")}</dt>
                                        <dd>{current.language}</dd>
                                    </div>
                                </dl>
                            </section>
                            <section className="drama-cfg-card">
                                <SettingsTitle title={t("drama.create.reviewModeLabel")} detail="只在关键点打断你" />
                                <CompactRadios
                                    label={t("drama.create.reviewModeLabel")}
                                    value={settings.reviewMode}
                                    options={(Object.keys(REVIEW_LABEL) as DramaReviewMode[]).map((mode) => ({ value: mode, ...REVIEW_LABEL[mode] }))}
                                    onChange={(reviewMode) => setSettings({ ...settings, reviewMode })}
                                />
                            </section>
                            <section className="drama-cfg-card">
                                <SettingsTitle title={t("drama.create.productionPaceLabel")} detail={settings.mediaMode === "manual" ? t("coverageUi.216", { value0: summary.episodes.filter((episode) => episode.awaitingMedia).length }) : undefined} />
                                <CompactRadios
                                    label={t("drama.create.productionPaceLabel")}
                                    value={settings.mediaMode}
                                    options={(Object.keys(MEDIA_MODE_LABEL) as DramaMediaMode[]).map((mode) => ({ value: mode, ...MEDIA_MODE_LABEL[mode] }))}
                                    onChange={(mediaMode) => setSettings({ ...settings, mediaMode })}
                                />
                                {settings.mediaMode !== current.mediaMode && settings.mediaMode === "manual" ? <p className="drama-cfg-note">{t("coverageUi.217")}</p> : null}
                            </section>
                            <section className="drama-cfg-card">
                                <SettingsTitle title={t("coverageUi.218")} detail="受账号并发上限约束" />
                                <div className="drama-tabs drama-cfg-seg" role="radiogroup" aria-label={t("coverageUi.218")}>
                                    {CONCURRENCY.map((value) => (
                                        <button key={value} type="button" role="radio" className="drama-tab" aria-checked={settings.concurrency === value} onClick={() => setSettings({ ...settings, concurrency: value })}>
                                            {value}
                                        </button>
                                    ))}
                                </div>
                            </section>
                            <section className="drama-cfg-card">
                                <SettingsTitle title={t("coverageUi.219")} detail="自动取参考图时的上限，人物优先；0 为按视频模型上限" />
                                <InputNumber className="!w-full" min={0} max={20} precision={0} value={settings.referenceLimit || 0} onChange={(value) => setSettings({ ...settings, referenceLimit: value || 0 })} suffix="张" aria-label={t("coverageUi.219")} />
                                <p className="drama-cfg-note">{t("coverageUi.220")}</p>
                            </section>
                            <section className="drama-cfg-card">
                                <SettingsTitle title={t("drama.create.budgetLimit")} detail="0 表示不限，达到后自动暂停" />
                                <InputNumber className="!w-full" min={0} precision={0} value={budget} onChange={(value) => setBudget(value || 0)} suffix="积分" aria-label={t("drama.create.budgetLimit")} />
                                <div className="drama-budget-meter">
                                    <div className="drama-budget-track">
                                        <span className={usage >= 0.9 ? "is-warn" : ""} style={progressFillStyle(budgetMicro ? Math.max(usage * 100, spent ? 2 : 0) : 0)} />
                                    </div>
                                    <span>
                                        {t("coverageUi.221")} <b>{formatCredits(spent)}</b>
                                        {budgetMicro ? ` / ${formatCredits(budgetMicro)}` : t("coverageUi.222")}
                                    </span>
                                </div>
                            </section>
                        </aside>
                    </div>
                </div>
            </section>
        </div>
    );
}

/** 侧栏里的紧凑单选列表：一行标题，说明作为次要文字，选中态只改边框和底色。 */
function CompactRadios<V extends string>({ label, value, options, onChange }: { label: string; value: V; options: Array<{ value: V; title: string; detail: string }>; onChange: (value: V) => void }) {
    return (
        <div className="drama-cfg-radios" role="radiogroup" aria-label={label}>
            {options.map((option) => (
                <button key={option.value} type="button" role="radio" aria-checked={value === option.value} className="drama-cfg-radio" onClick={() => onChange(option.value)}>
                    <span className="drama-radio" aria-hidden />
                    <span className="min-w-0">
                        <strong>{option.title}</strong>
                        <small>{option.detail}</small>
                    </span>
                </button>
            ))}
        </div>
    );
}

function SettingsTitle({ title, detail, icon }: { title: string; detail?: string; icon?: ReactNode }) {
    return (
        <div className="drama-settings-title">
            <h3>
                {icon}
                {title}
            </h3>
            {detail ? <span>{detail}</span> : null}
        </div>
    );
}
