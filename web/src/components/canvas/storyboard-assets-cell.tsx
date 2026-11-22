import { useInterfaceTranslation } from "@/stores/use-interface-locale-store";
import { Modal } from "antd";
import { Tooltip } from "@/components/ui/base/tooltip";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { Image as ImageIcon, Music2, Play, Plus, UserRound } from "lucide-react";

import { CanvasVideoPreviewImage } from "@/components/canvas/canvas-video-preview-image";
import { isStoryboardPreviewAsset } from "@/lib/canvas/canvas-storyboard-materializer";
import { resolveMediaUrl } from "@/services/file-storage";
import { CanvasNodeType, type CanvasNodeData, type StoryboardAssetBinding, type StoryboardRow } from "@/types/canvas";
import "./storyboard-assets-cell.css";

export const STORYBOARD_ASSET_ROLE_KEYS: Record<StoryboardAssetBinding["role"], string> = {
    character: "storyboardAssets.roleCharacter",
    environment: "storyboardAssets.roleEnvironment",
    wardrobe: "storyboardAssets.roleWardrobe",
    prop: "storyboardAssets.roleProp",
    weapon: "storyboardAssets.roleWeapon",
    style: "storyboardAssets.roleStyle",
    motion: "storyboardAssets.roleMotion",
    audio: "storyboardAssets.roleAudio",
};

export function StoryboardAssetsCell({ bindings, nodes, limit = 4, onEdit, disabled = false, generationReferences }: { bindings: StoryboardAssetBinding[]; nodes: CanvasNodeData[]; limit?: number; onEdit?: () => void; disabled?: boolean; generationReferences?: StoryboardRow["generationReferenceNodeIds"] }) {
    const { t } = useInterfaceTranslation();
    const { t: assetT } = useTranslation();
    const [previewNode, setPreviewNode] = useState<CanvasNodeData | null>(null);
    const nodeById = useMemo(() => new Map(nodes.map((node) => [node.id, node])), [nodes]);
    const usage = new Map<string, string>();
    for (const id of generationReferences?.image || []) usage.set(id, t("canvasUi.generateImageShort"));
    for (const id of generationReferences?.video || []) usage.set(id, usage.has(id) ? assetT("storyboardAssets.imageVideo") : t("contextVideo"));
    const allBindings = [...bindings, ...[...usage.keys()].filter((id) => !bindings.some((binding) => binding.nodeId === id)).map((nodeId) => ({ nodeId, role: "style" as const, priority: 0 }))];
    const assets = allBindings
        .map((binding) => ({ binding, node: nodeById.get(binding.nodeId), label: bindings.some((item) => item.nodeId === binding.nodeId) ? assetT(STORYBOARD_ASSET_ROLE_KEYS[binding.role]) : usage.get(binding.nodeId)! }))
        .filter((item) => !item.node || isStoryboardPreviewAsset(item.node));
    const visible = assets.slice(0, limit);
    const hiddenCount = Math.max(0, assets.length - visible.length);

    if (!assets.length && !onEdit) return <span className="text-[var(--fs-caption)] text-foreground/35">{t("projectUi.stageCanvasUnlinked")}</span>;
    return (
        <>
            <div className="storyboard-assets-cell flex min-w-0 max-w-full items-center gap-2" aria-label={t("canvasCompleteUi.linkedAssetCount", { value0: assets.length })}>
                {visible.map(({ binding, node, label }) => (
                    <Tooltip key={binding.nodeId} title={`${node?.title || assetT("storyboardAssets.missing")} · ${label}`}>
                        <button
                            type="button"
                            data-icon-only
                            disabled={!node}
                            className="storyboard-assets-cell-preview relative grid size-8 shrink-0 place-items-center overflow-hidden rounded-md border border-foreground/10 bg-foreground/[0.035] text-foreground/45 outline-none transition enabled:hover:border-foreground/30 enabled:hover:text-foreground/70 focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] disabled:cursor-not-allowed"
                            aria-label={assetT("storyboardAssets.preview", { name: node?.title || assetT("storyboardAssets.missing") })}
                            onMouseDown={(event) => event.stopPropagation()}
                            onPointerDown={(event) => event.stopPropagation()}
                            onClick={(event) => {
                                event.stopPropagation();
                                if (node) setPreviewNode(node);
                            }}
                        >
                            {node ? <AssetThumbnail node={node} /> : <ImageIcon className="size-4" />}
                            <span className="absolute bottom-0.5 right-0.5 rounded bg-black/65 px-1 text-[8px] leading-3 text-white">{label.includes("/") ? assetT("storyboardAssets.multiple") : label.slice(0, 2)}</span>
                        </button>
                    </Tooltip>
                ))}
                {hiddenCount ? <span className="shrink-0 text-[var(--fs-caption)] font-medium text-foreground/45">+{hiddenCount}</span> : null}
                {onEdit ? (
                    <button
                        type="button"
                        aria-label={assetT(assets.length ? "storyboardAssets.manage" : "storyboardAssets.choose")}
                        disabled={disabled}
                        data-icon-only={assets.length ? true : undefined}
                        className={`inline-flex h-8 shrink-0 items-center justify-center gap-1 rounded-md border border-dashed border-foreground/20 text-xs text-foreground/60 outline-none transition hover:border-foreground/40 hover:text-foreground focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] disabled:opacity-40 ${assets.length ? "w-8 p-0" : "px-2"}`}
                        onMouseDown={(event) => event.stopPropagation()}
                        onPointerDown={(event) => event.stopPropagation()}
                        onClick={(event) => {
                            event.stopPropagation();
                            onEdit();
                        }}
                    >
                        <Plus className="size-3.5" />
                        {assets.length ? null : assetT("storyboardAssets.select")}
                    </button>
                ) : null}
            </div>
            <AssetPreviewModal node={previewNode} onClose={() => setPreviewNode(null)} />
        </>
    );
}

export function AssetThumbnail({ node }: { node: CanvasNodeData }) {
    return (
        <span className="storyboard-asset-thumbnail">
            <AssetThumbnailContent node={node} />
        </span>
    );
}

function AssetThumbnailContent({ node }: { node: CanvasNodeData }) {
    const source = useNodeMediaSource(node.type === CanvasNodeType.Video ? null : node);
    if (node.type === CanvasNodeType.Audio) return <Music2 className="size-4" />;
    if (node.metadata?.workflowKind === "character" && !source) return <UserRound className="size-4" />;
    if (node.type === CanvasNodeType.Video) {
        return (
            <>
                <CanvasVideoPreviewImage node={node} alt="" loading="lazy" decoding="async" draggable={false} className="size-full object-cover" fallback={<Play className="size-4" />} />
                <span className="absolute inset-0 grid place-items-center bg-black/15">
                    <Play className="size-3.5 fill-white text-white" />
                </span>
            </>
        );
    }
    return source ? <img src={source} alt="" loading="lazy" decoding="async" draggable={false} className="size-full object-cover" /> : <ImageIcon className="size-4" />;
}

function AssetPreviewModal({ node, onClose }: { node: CanvasNodeData | null; onClose: () => void }) {
    const { t } = useInterfaceTranslation();
    const source = useNodeMediaSource(node);
    return (
        <Modal title={node?.title || t("projectUi.assetPreview")} open={Boolean(node)} onCancel={onClose} footer={null} width={880} centered destroyOnHidden>
            {node ? (
                <div className="grid min-h-56 place-items-center overflow-hidden rounded-lg bg-black/[0.035] p-3 dark:bg-white/[0.035]" data-canvas-no-zoom>
                    {node.type === CanvasNodeType.Video && source ? (
                        <video src={source} controls autoPlay playsInline className="max-h-[68vh] max-w-full rounded-md" />
                    ) : node.type === CanvasNodeType.Audio && source ? (
                        <audio src={source} controls autoPlay className="w-full max-w-xl" />
                    ) : source ? (
                        <img src={source} alt={node.title || t("projectUi.assetPreview")} className="max-h-[68vh] max-w-full object-contain" />
                    ) : (
                        <span className="text-sm text-foreground/45">{t("canvasCompleteUi.assetNoPreview")}</span>
                    )}
                </div>
            ) : null}
        </Modal>
    );
}

function useNodeMediaSource(node: CanvasNodeData | null) {
    const fallback = node
        ? node.metadata?.workflowKind === "character"
            ? node.metadata.characterCoverUrl || ""
            : node.type === CanvasNodeType.Drawing
              ? node.metadata?.drawingPreviewUrl || node.metadata?.content || ""
              : node.metadata?.content || ""
        : "";
    const storageKey = node?.metadata?.storageKey;
    const [source, setSource] = useState(fallback);
    useEffect(() => {
        let cancelled = false;
        setSource(fallback);
        if (storageKey)
            void resolveMediaUrl(storageKey, fallback)
                .then((url) => {
                    if (!cancelled) setSource(url || fallback);
                })
                .catch(() => {
                    if (!cancelled) setSource(fallback);
                });
        return () => {
            cancelled = true;
        };
    }, [fallback, storageKey]);
    return source;
}
