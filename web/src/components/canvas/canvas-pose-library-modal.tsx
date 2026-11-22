import { App, Button, Input } from "antd";
import { keepPreviousData, useInfiniteQuery } from "@tanstack/react-query";
import { Check, ImageOff, Maximize2, PersonStanding, Search, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";

import { type InsertAssetPayload } from "@/components/canvas/asset-picker-modal";
import { WorkspaceErrorState, WorkspaceNoResultsState, WorkspaceState } from "@/components/layout/workspace-state";
import { SegmentedControl } from "@/components/ui/base/segmented-control";
import { AppModal } from "@/components/ui/product/app-modal";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { copyPoseLibraryItems, listPoseLibrary, poseLibraryFileUrl, POSE_LIBRARY_MAX_USE, type PoseLibraryFacet, type PoseLibraryItem, type PoseLibraryPose } from "@/services/api/pose-library";
import { resourceFileUrl, resourceStorageKey } from "@/services/api/resources";
import { useUserStore } from "@/stores/use-user-store";

import "./canvas-pose-library-modal.css";

const PAGE_SIZE = 24;
const ALL = "";
const SKELETON_CARDS = 12;
const ANGLE_KEYS: Record<string, string> = { 正面: "front", 斜侧: "threeQuarter", 侧面: "side", 背面: "backAngle", 俯视: "top", 仰视: "low" };

function angleLabel(angle: string, t: TFunction) {
    return Object.hasOwn(ANGLE_KEYS, angle) ? t(`poseLibrary.${ANGLE_KEYS[angle]}`) : angle;
}

type Picked = { item: PoseLibraryItem; pose: PoseLibraryPose };

/**
 * 姿势库：浏览站点导入的姿势参考图，多选后复制成当前用户的资源并插入画布。
 * 图片来自本站数据目录，弹窗不访问任何第三方站点，也不展示素材来源。
 */
export function CanvasPoseLibraryModal({ open, onClose, onInsert }: { open: boolean; onClose: () => void; onInsert: (payloads: InsertAssetPayload[]) => Promise<unknown> }) {
    const { t } = useTranslation();
    const { message } = App.useApp();
    const isAdmin = useUserStore((state) => state.user?.role === "admin");
    const userId = useUserStore((state) => state.user?.id);
    const [keyword, setKeyword] = useState("");
    const [system, setSystem] = useState(ALL);
    const [category, setCategory] = useState(ALL);
    const [angle, setAngle] = useState(ALL);
    const [picked, setPicked] = useState<Map<string, Picked>>(() => new Map());
    const [shownAngles, setShownAngles] = useState<Record<string, string>>({});
    const [preview, setPreview] = useState<Picked | null>(null);
    const [inserting, setInserting] = useState(false);
    const insertingRef = useRef(false);
    const debouncedKeyword = useDebouncedValue(keyword.trim(), 250);
    const bodyRef = useRef<HTMLDivElement>(null);
    const sentinelRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (open) return;
        setPicked(new Map());
        setPreview(null);
    }, [open]);

    useEffect(() => {
        setPicked(new Map());
        setPreview(null);
    }, [userId]);

    const query = useInfiniteQuery({
        queryKey: ["pose-library", userId, debouncedKeyword, system, category, angle],
        initialPageParam: 1,
        queryFn: ({ pageParam, signal }) => listPoseLibrary({ keyword: debouncedKeyword || undefined, system: system || undefined, category: category || undefined, angle: angle || undefined, page: pageParam, pageSize: PAGE_SIZE }, signal),
        getNextPageParam: (last) => (last.page * last.pageSize < last.total ? last.page + 1 : undefined),
        // 切换筛选时保留上一屏内容与侧栏计数，避免整块闪成空白。
        placeholderData: keepPreviousData,
        enabled: open,
    });
    const firstPage = query.data?.pages[0];
    const poses = useMemo(() => query.data?.pages.flatMap((page) => page.poses) || [], [query.data]);
    const facets = firstPage?.facets;
    const systemTotal = facets?.systems.reduce((sum, item) => sum + item.count, 0) || 0;
    const filtered = Boolean(debouncedKeyword || system || category || angle);
    const libraryEmpty = Boolean(firstPage) && !query.isPlaceholderData && systemTotal === 0;

    useEffect(() => {
        bodyRef.current?.scrollTo({ top: 0 });
    }, [debouncedKeyword, system, category, angle]);

    useEffect(() => {
        const sentinel = sentinelRef.current;
        if (!sentinel || !query.hasNextPage) return;
        const observer = new IntersectionObserver(
            (entries) => {
                if (entries.some((entry) => entry.isIntersecting) && !query.isFetchingNextPage) void query.fetchNextPage();
            },
            { root: bodyRef.current, rootMargin: "480px" },
        );
        observer.observe(sentinel);
        return () => observer.disconnect();
    }, [query.hasNextPage, query.isFetchingNextPage, query.fetchNextPage, poses.length]);

    const resetFilters = () => {
        setKeyword("");
        setSystem(ALL);
        setCategory(ALL);
        setAngle(ALL);
    };

    const shownItem = (pose: PoseLibraryPose) => {
        const preferred = shownAngles[pose.key] || angle;
        return pose.items.find((item) => item.angle === preferred) || pose.items[0];
    };

    const showAngle = (pose: PoseLibraryPose, item: PoseLibraryItem) => setShownAngles((current) => ({ ...current, [pose.key]: item.angle }));

    const toggle = (pose: PoseLibraryPose, item: PoseLibraryItem) => {
        setPicked((current) => {
            const next = new Map(current);
            if (next.has(item.id)) next.delete(item.id);
            else if (next.size >= POSE_LIBRARY_MAX_USE) {
                message.warning(t("poseLibrary.maxSelection", { count: POSE_LIBRARY_MAX_USE }));
                return current;
            } else next.set(item.id, { item, pose });
            return next;
        });
    };

    const insert = async () => {
        const selection = Array.from(picked.values());
        if (!selection.length || !userId || insertingRef.current) return;
        insertingRef.current = true;
        setInserting(true);
        try {
            // 先由后端把原图复制成当前用户的资源，画布节点和生成任务只引用自己的资源。
            const copies = await copyPoseLibraryItems(selection.map(({ item }) => item.id));
            // An account change must not attach the previous account's copied resources.
            if (useUserStore.getState().user?.id !== userId) {
                message.error(t("poseLibrary.accountChanged"));
                return;
            }
            const payloads: InsertAssetPayload[] = copies.map((copy) => ({
                kind: "image",
                dataUrl: resourceFileUrl(copy.resource.id),
                storageKey: resourceStorageKey(copy.resource.id),
                width: copy.resource.width,
                height: copy.resource.height,
                bytes: copy.resource.size,
                mimeType: copy.resource.mimeType,
                title: t("poseLibrary.referenceName", { name: copy.name, angle: angleLabel(copy.angle, t) }),
            }));
            try {
                await onInsert(payloads);
                setPicked(new Map());
                onClose();
            } catch {
                // onInsert reports insertion failures; keep the selection available for retry.
            }
        } catch (error) {
            message.error(error instanceof Error ? error.message : t("poseLibrary.copyFailed"));
        } finally {
            insertingRef.current = false;
            setInserting(false);
        }
    };

    const angleOptions = [{ value: ALL, label: t("poseLibrary.allAngles") }, ...(facets?.angles || []).map((item) => ({ value: item.name, label: angleLabel(item.name, t) }))];
    const scopeLabel = [system || t("poseLibrary.allPoses"), category].filter(Boolean).join(" · ");
    const selection = Array.from(picked.values());

    let content;
    if (query.isError && !poses.length) {
        content = <WorkspaceErrorState compact title={t("poseLibrary.loadFailed")} description={query.error instanceof Error ? query.error.message : undefined} onRetry={() => void query.refetch()} />;
    } else if (query.isPending) {
        content = (
            <div className="pose-grid" aria-busy="true" aria-label={t("poseLibrary.loading")}>
                {Array.from({ length: SKELETON_CARDS }, (_, index) => (
                    <PoseCardSkeleton key={index} />
                ))}
            </div>
        );
    } else if (libraryEmpty) {
        content = (
            <WorkspaceState
                compact
                title={t("poseLibrary.empty")}
                description={t(isAdmin ? "poseLibrary.emptyAdmin" : "poseLibrary.emptyUser")}
                action={
                    isAdmin ? (
                        <Button type="primary" href="/admin/pose-library" target="_blank" rel="noopener">
                            {t("poseLibrary.manage")}
                        </Button>
                    ) : undefined
                }
            />
        );
    } else if (!poses.length) {
        content = <WorkspaceNoResultsState compact query={debouncedKeyword} onClear={filtered ? resetFilters : undefined} />;
    } else {
        content = (
            <>
                <div className="pose-grid" data-refreshing={query.isPlaceholderData || undefined}>
                    {poses.map((pose) => {
                        const item = shownItem(pose);
                        return <PoseCard key={pose.key} pose={pose} item={item} picked={picked} onToggle={toggle} onShowAngle={showAngle} onPreview={(next) => setPreview({ pose, item: next })} />;
                    })}
                    {query.isFetchingNextPage ? Array.from({ length: 6 }, (_, index) => <PoseCardSkeleton key={`more-${index}`} />) : null}
                </div>
                <div ref={sentinelRef} className="pose-grid-end">
                    {!query.hasNextPage && poses.length > PAGE_SIZE ? t("poseLibrary.shownAll", { count: firstPage?.total || 0 }) : null}
                </div>
            </>
        );
    }

    return (
        <>
            <AppModal open={open} title={null} footer={null} centered width="min(1240px, calc(100vw - 32px))" onCancel={() => (inserting ? undefined : onClose())} rootClassName="pose-library-modal" flush>
                <div className="pose-library" data-canvas-no-zoom>
                    <header className="pose-header">
                        <span className="pose-header-icon" aria-hidden>
                            <PersonStanding className="size-[18px]" />
                        </span>
                        <div className="min-w-0">
                            <h2 className="pose-header-title">{t("poseLibrary.title")}</h2>
                        </div>
                        {libraryEmpty ? null : (
                            <Input
                                allowClear
                                className="pose-header-search"
                                prefix={<Search className="size-4 text-[var(--text-tertiary)]" />}
                                value={keyword}
                                placeholder={t("poseLibrary.searchPlaceholder")}
                                aria-label={t("poseLibrary.search")}
                                onChange={(event) => setKeyword(event.target.value)}
                            />
                        )}
                    </header>

                    <div className="pose-layout" data-empty={libraryEmpty || undefined}>
                        {libraryEmpty ? null : (
                            <nav className="pose-side" aria-label={t("poseLibrary.filters")}>
                                <PoseSideGroup
                                    label={t("poseLibrary.system")}
                                    allLabel={t("poseLibrary.allPoses")}
                                    allCount={systemTotal}
                                    facets={facets?.systems}
                                    value={system}
                                    onChange={(next) => {
                                        setSystem(next);
                                        setCategory(ALL);
                                    }}
                                />
                                <PoseSideGroup label={t("poseLibrary.category")} allLabel={t("poseLibrary.allCategories")} facets={facets?.categories} value={category} onChange={setCategory} />
                            </nav>
                        )}

                        <section className="pose-main">
                            {libraryEmpty ? null : (
                                <div className="pose-toolbar">
                                    <div className="pose-toolbar-scope">
                                        <span className="truncate">{scopeLabel}</span>
                                        {firstPage ? <span className="pose-toolbar-count">{t("poseLibrary.count", { count: firstPage.total })}</span> : null}
                                        {filtered ? (
                                            <button type="button" className="pose-toolbar-reset" onClick={resetFilters}>
                                                {t("poseLibrary.clearFilters")}
                                            </button>
                                        ) : null}
                                    </div>
                                    {facets?.angles.length ? <SegmentedControl size="sm" ariaLabel={t("poseLibrary.angle")} value={angle} options={angleOptions} onChange={setAngle} className="pose-toolbar-angles" /> : null}
                                </div>
                            )}
                            <div ref={bodyRef} className="pose-body" data-canvas-wheel-scroll>
                                {content}
                            </div>
                        </section>
                    </div>

                    <footer className="pose-dock">
                        <div className="pose-dock-tray" aria-label={t("poseLibrary.selected")}>
                            {selection.length ? (
                                selection.map(({ item, pose }) => (
                                    <button key={item.id} type="button" className="pose-dock-item" title={t("poseLibrary.remove", { name: pose.name, angle: angleLabel(item.angle, t) })} aria-label={t("poseLibrary.remove", { name: pose.name, angle: angleLabel(item.angle, t) })} onClick={() => toggle(pose, item)}>
                                        <PoseImage src={poseLibraryFileUrl(item)} alt="" />
                                        <span className="pose-dock-remove">
                                            <X className="size-3" strokeWidth={2.5} />
                                        </span>
                                    </button>
                                ))
                            ) : (
                                <span className="pose-dock-hint">{t("poseLibrary.choose")}</span>
                            )}
                        </div>
                        <span className="pose-dock-count">
                            {t("poseLibrary.selectionCount", { count: selection.length, max: POSE_LIBRARY_MAX_USE })}
                        </span>
                        {selection.length ? (
                            <Button type="text" disabled={inserting} onClick={() => setPicked(new Map())}>
                                {t("poseLibrary.clear")}
                            </Button>
                        ) : null}
                        <Button type="primary" loading={inserting} disabled={!selection.length} onClick={() => void insert()}>
                            {t("poseLibrary.insert")}
                        </Button>
                    </footer>
                </div>
            </AppModal>

            <AppModal open={Boolean(preview)} title={null} footer={null} centered width="min(960px, calc(100vw - 32px))" onCancel={() => setPreview(null)} rootClassName="pose-library-modal" flush>
                {preview ? (
                    <div className="pose-preview" data-canvas-no-zoom>
                        <div className="pose-preview-stage">
                            <PoseImage key={preview.item.id} src={poseLibraryFileUrl(preview.item, "image")} alt={`${preview.pose.name} (${angleLabel(preview.item.angle, t)})`} placeholder={poseLibraryFileUrl(preview.item)} />
                        </div>
                        <aside className="pose-preview-panel">
                            <div>
                                {preview.pose.code ? <span className="pose-preview-code">{preview.pose.code}</span> : null}
                                <h3 className="pose-preview-title">{preview.pose.name}</h3>
                                <p className="pose-preview-meta">
                                    {preview.pose.category} · {preview.pose.system}
                                </p>
                            </div>
                            {preview.pose.items.length > 1 ? (
                                <div>
                                    <div className="pose-preview-label">{t("poseLibrary.angle")}</div>
                                    <div className="pose-preview-angles">
                                        {preview.pose.items.map((option) => (
                                            <button
                                                key={option.id}
                                                type="button"
                                                className="pose-preview-angle"
                                                aria-pressed={option.id === preview.item.id}
                                                data-picked={picked.has(option.id) || undefined}
                                                onClick={() => setPreview({ pose: preview.pose, item: option })}
                                            >
                                                <PoseImage src={poseLibraryFileUrl(option)} alt="" />
                                                <span>{angleLabel(option.angle, t)}</span>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            ) : null}
                            <div className="pose-preview-actions">
                                <Button block type={picked.has(preview.item.id) ? "default" : "primary"} icon={picked.has(preview.item.id) ? undefined : <Check className="size-4" />} onClick={() => toggle(preview.pose, preview.item)}>
                                    {picked.has(preview.item.id) ? t("poseLibrary.deselect") : t("poseLibrary.chooseAngle", { angle: angleLabel(preview.item.angle, t) })}
                                </Button>
                                <Button block type="text" onClick={() => setPreview(null)}>
                                    {t("poseLibrary.back")}
                                </Button>
                            </div>
                        </aside>
                    </div>
                ) : null}
            </AppModal>
        </>
    );
}

function PoseSideGroup({ label, allLabel, allCount, facets, value, onChange }: { label: string; allLabel: string; allCount?: number; facets?: PoseLibraryFacet[]; value: string; onChange: (value: string) => void }) {
    if (!facets?.length) return null;
    return (
        <div className="pose-side-group" role="group" aria-label={label}>
            <div className="pose-side-label">{label}</div>
            <button type="button" className="pose-side-item" aria-pressed={value === ALL} onClick={() => onChange(ALL)}>
                <span className="truncate">{allLabel}</span>
                {allCount !== undefined ? <span className="pose-side-count">{allCount}</span> : null}
            </button>
            {facets.map((facet) => (
                <button key={facet.name} type="button" className="pose-side-item" aria-pressed={value === facet.name} title={facet.name} onClick={() => onChange(facet.name)}>
                    <span className="truncate">{facet.name}</span>
                    <span className="pose-side-count">{facet.count}</span>
                </button>
            ))}
        </div>
    );
}

function PoseCard({
    pose,
    item,
    picked,
    onToggle,
    onShowAngle,
    onPreview,
}: {
    pose: PoseLibraryPose;
    item: PoseLibraryItem;
    picked: Map<string, Picked>;
    onToggle: (pose: PoseLibraryPose, item: PoseLibraryItem) => void;
    onShowAngle: (pose: PoseLibraryPose, item: PoseLibraryItem) => void;
    onPreview: (item: PoseLibraryItem) => void;
}) {
    const { t } = useTranslation();
    const selected = picked.has(item.id);
    const pickedAngles = pose.items.filter((option) => picked.has(option.id)).length;
    return (
        <article className="pose-card" data-selected={selected || undefined}>
            <div className="pose-card-media">
                <button type="button" className="pose-card-hit" aria-pressed={selected} aria-label={t(selected ? "poseLibrary.deselectPose" : "poseLibrary.choosePose", { name: pose.name, angle: angleLabel(item.angle, t) })} onClick={() => onToggle(pose, item)}>
                    <PoseImage src={poseLibraryFileUrl(item)} alt={`${pose.name} (${angleLabel(item.angle, t)})`} />
                </button>
                {pose.code ? <span className="pose-card-code">{pose.code}</span> : null}
                <span className="pose-card-check" aria-hidden>
                    <Check className="size-3.5" strokeWidth={3} />
                </span>
                <button type="button" className="pose-card-zoom" aria-label={t("poseLibrary.zoomPose", { name: pose.name })} title={t("poseLibrary.zoom")} onClick={() => onPreview(item)}>
                    <Maximize2 className="size-3.5" />
                </button>
            </div>
            <div className="pose-card-info">
                <div className="pose-card-name" title={pose.name}>
                    {pose.name}
                </div>
                <div className="pose-card-meta">
                    <span className="truncate">{pose.category}</span>
                    <span className="pose-card-angle">
                        {angleLabel(item.angle, t)}
                        {pickedAngles > 1 ? ` · ${t("poseLibrary.pickedAngles", { count: pickedAngles })}` : ""}
                    </span>
                </div>
            </div>
            {pose.items.length > 1 ? (
                <div className="pose-card-angles" role="group" aria-label={t("poseLibrary.anglesFor", { name: pose.name })}>
                    {pose.items.map((option) => (
                        <button
                            key={option.id}
                            type="button"
                            className="pose-card-angle-thumb"
                            aria-pressed={option.id === item.id}
                            aria-label={angleLabel(option.angle, t)}
                            title={angleLabel(option.angle, t)}
                            data-picked={picked.has(option.id) || undefined}
                            onClick={() => onShowAngle(pose, option)}
                        >
                            <PoseImage src={poseLibraryFileUrl(option)} alt="" />
                        </button>
                    ))}
                </div>
            ) : null}
        </article>
    );
}

function PoseCardSkeleton() {
    return (
        <div className="pose-card is-skeleton" aria-hidden>
            <div className="pose-card-media">
                <span className="pose-image" data-state="loading" />
            </div>
            <div className="pose-card-info">
                <span className="pose-skeleton-line" style={{ width: "72%" }} />
                <span className="pose-skeleton-line is-sm" style={{ width: "46%" }} />
            </div>
        </div>
    );
}

/**
 * 带加载态的姿势图：未加载时显示扫光骨架，加载完成后淡入；失败显示占位图标。
 * src 变化时整体重建，避免旧图的加载结果套到新图上。
 */
function PoseImage(props: { src: string; alt: string; placeholder?: string }) {
    return <PoseImageInner key={props.src} {...props} />;
}

function PoseImageInner({ src, alt, placeholder }: { src: string; alt: string; placeholder?: string }) {
    const [state, setState] = useState<"loading" | "loaded" | "error">("loading");
    // 浏览器缓存命中时 load 事件可能早于 React 绑定，挂载时直接检查 complete。
    const imageRef = useCallback((image: HTMLImageElement | null) => {
        if (image?.complete && image.naturalWidth > 0) setState("loaded");
    }, []);
    return (
        <span className="pose-image" data-state={state}>
            {/* 大图加载期间先铺一层已缓存的缩略图，原图加载完成后在其上淡入。 */}
            {placeholder ? <img className="pose-image-placeholder" src={placeholder} alt="" draggable={false} /> : null}
            {state === "error" ? (
                <span className="pose-image-fallback">
                    <ImageOff className="size-5" />
                </span>
            ) : (
                <img ref={imageRef} src={src} alt={alt} loading="lazy" decoding="async" draggable={false} onLoad={() => setState("loaded")} onError={() => setState("error")} />
            )}
        </span>
    );
}
