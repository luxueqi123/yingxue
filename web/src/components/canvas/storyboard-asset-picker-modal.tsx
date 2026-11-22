import { Button, Input, Modal } from "antd";
import { Check, Library, Search, X } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { CanvasProjectAssetModal } from "@/components/canvas/canvas-project-asset-modal";
import type { InsertAssetPayload } from "@/components/canvas/asset-picker-modal";
import { AssetThumbnail, STORYBOARD_ASSET_ROLE_KEYS } from "@/components/canvas/storyboard-assets-cell";
import { Select } from "@/components/ui/base/select";
import { bindingForConnectedNode, isStoryboardPreviewAsset } from "@/lib/canvas/canvas-storyboard-materializer";
import { normalizeStoryboardAssetBindings } from "@/lib/canvas/canvas-storyboard-assets";
import type { ProjectDetail } from "@/services/api/projects";
import type { CanvasNodeData, StoryboardAssetBinding } from "@/types/canvas";

export function StoryboardAssetPickerModal({
    nodes,
    bindings,
    shotNumber,
    detail,
    onClose,
    onSave,
    onImport,
}: {
    nodes: CanvasNodeData[];
    bindings: StoryboardAssetBinding[];
    shotNumber: number;
    detail?: ProjectDetail;
    onClose: () => void;
    onSave: (bindings: StoryboardAssetBinding[]) => void;
    onImport: (payloads: InsertAssetPayload[]) => Promise<CanvasNodeData[]>;
}) {
    const { t } = useTranslation();
    const [draft, setDraft] = useState(() => normalizeStoryboardAssetBindings(bindings));
    const [query, setQuery] = useState("");
    const [role, setRole] = useState("all");
    const [libraryOpen, setLibraryOpen] = useState(false);
    const [error, setError] = useState("");
    const nodeById = useMemo(() => new Map(nodes.map((node) => [node.id, node])), [nodes]);
    const selectedIds = new Set(draft.map((binding) => binding.nodeId));
    const candidates = nodes.filter((node) => {
        if (!isStoryboardPreviewAsset(node)) return false;
        if (selectedIds.has(node.id)) return true;
        if (["shot", "action_board", "final"].includes(node.metadata?.workflowKind || "")) return false;
        return Boolean(node.metadata?.content || node.metadata?.storageKey || node.metadata?.drawingPreviewUrl || (node.metadata?.characterAssetId && node.metadata?.characterVersionId));
    });
    const keyword = query.trim().toLowerCase();
    const filtered = candidates.filter((node) => (role === "all" || bindingForConnectedNode(node)?.role === role) && (!keyword || [node.title, node.metadata?.prompt, ...(node.metadata?.assetTags || [])].join(" ").toLowerCase().includes(keyword)));
    const toggle = (node: CanvasNodeData) =>
        setDraft((current) => {
            if (current.some((binding) => binding.nodeId === node.id)) return current.filter((binding) => binding.nodeId !== node.id);
            const binding = bindingForConnectedNode(node);
            return binding ? [...current, binding] : current;
        });
    return (
        <>
            <Modal open title={t("storyboardAssets.title", { number: shotNumber })} width={760} centered onCancel={onClose} footer={null}>
                <div data-canvas-no-zoom data-canvas-wheel-scroll onPointerDown={(event) => event.stopPropagation()} onWheel={(event) => event.stopPropagation()}>
                    <div className="mb-4 flex flex-wrap gap-2">
                        <Input className="min-w-40 flex-1" prefix={<Search className="size-4 text-foreground/40" />} allowClear placeholder={t("storyboardAssets.search")} value={query} onChange={(event) => setQuery(event.target.value)} />
                        <Select className="w-40" aria-label={t("storyboardAssets.filter")} value={role} onChange={setRole} options={[{ value: "all", label: t("storyboardAssets.allTypes") }, ...Object.entries(STORYBOARD_ASSET_ROLE_KEYS).map(([value, key]) => ({ value, label: t(key) }))]} />
                        <Button icon={<Library className="size-4" />} onClick={() => setLibraryOpen(true)}>
                            {t("storyboardAssets.importAssets")}
                        </Button>
                    </div>
                    <div className="grid max-h-[38vh] min-h-40 auto-rows-max grid-cols-2 content-start gap-2 overflow-y-auto p-1 sm:grid-cols-3" aria-label={t("storyboardAssets.available")}>
                        {filtered.map((node) => (
                            <button
                                key={node.id}
                                type="button"
                                aria-pressed={selectedIds.has(node.id)}
                                aria-label={t("storyboardAssets.selectItem", { name: node.title })}
                                onClick={() => toggle(node)}
                                className={`relative flex items-center gap-2 rounded-lg border p-2 text-left outline-none transition focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] ${selectedIds.has(node.id) ? "border-foreground/50 bg-foreground/[0.08]" : "border-foreground/10 hover:bg-foreground/[0.04]"}`}
                            >
                                <span className="relative grid size-12 shrink-0 place-items-center overflow-hidden rounded-md bg-foreground/[0.04]">
                                    <AssetThumbnail node={node} />
                                </span>
                                <span className="min-w-0 flex-1">
                                    <span className="block truncate text-sm" title={node.title}>
                                        {node.title}
                                    </span>
                                    <span className="text-xs text-foreground/45">{t(STORYBOARD_ASSET_ROLE_KEYS[bindingForConnectedNode(node)!.role])}</span>
                                </span>
                                {selectedIds.has(node.id) ? <Check className="size-4 shrink-0" /> : null}
                            </button>
                        ))}
                        {!filtered.length ? (
                            <div className="col-span-full grid place-items-center px-4 py-8 text-center text-sm text-foreground/45">{t(keyword || role !== "all" ? "storyboardAssets.noMatches" : "storyboardAssets.noAssets")}</div>
                        ) : null}
                    </div>
                    <div className="mt-4 border-t border-foreground/10 pt-3">
                        <div className="mb-2 flex items-center justify-between text-xs text-foreground/55">
                            <span>{t("storyboardAssets.selectedCount", { count: draft.length })}</span>
                            <Button type="text" size="small" disabled={!draft.length} onClick={() => setDraft([])}>
                                {t("storyboardAssets.clear")}
                            </Button>
                        </div>
                        <div className="flex max-h-28 flex-wrap gap-2 overflow-y-auto" aria-label={t("storyboardAssets.selected")}>
                            {draft.map((binding) => (
                                <span key={binding.nodeId} className="inline-flex max-w-full items-center gap-1 rounded-md bg-foreground/[0.06] px-2 py-1 text-xs">
                                    <span className="max-w-40 truncate">{nodeById.get(binding.nodeId)?.title || t("storyboardAssets.missing")}</span>
                                    <Select
                                        size="small"
                                        className="w-20"
                                        aria-label={t("storyboardAssets.roleFor", { name: nodeById.get(binding.nodeId)?.title || t("storyboardAssets.missing") })}
                                        value={binding.role}
                                        options={Object.entries(STORYBOARD_ASSET_ROLE_KEYS).map(([value, key]) => ({ value, label: t(key) }))}
                                        onChange={(value) => setDraft((current) => current.map((item) => (item.nodeId === binding.nodeId ? { ...item, role: value as StoryboardAssetBinding["role"] } : item)))}
                                    />
                                    <button
                                        type="button"
                                        aria-label={t("storyboardAssets.remove", { name: nodeById.get(binding.nodeId)?.title || t("storyboardAssets.missing") })}
                                        className="rounded p-1 outline-none hover:bg-foreground/10 focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]"
                                        onClick={() => setDraft((current) => current.filter((item) => item.nodeId !== binding.nodeId))}
                                    >
                                        <X className="size-3" />
                                    </button>
                                </span>
                            ))}
                        </div>
                    </div>
                    {error ? (
                        <p role="alert" className="mt-2 text-sm text-[var(--color-danger)]">
                            {error}
                        </p>
                    ) : null}
                    <div className="mt-4 flex justify-end gap-2">
                        <Button onClick={onClose}>{t("storyboardAssets.cancel")}</Button>
                        <Button
                            type="primary"
                            onClick={() => {
                                try {
                                    onSave(draft);
                                } catch (cause) {
                                    setError(cause instanceof Error ? cause.message : t("storyboardAssets.saveFailed"));
                                }
                            }}
                        >
                            {t("storyboardAssets.save")}
                        </Button>
                    </div>
                </div>
            </Modal>
            {libraryOpen ? (
                <CanvasProjectAssetModal
                    open
                    detail={detail}
                    onClose={() => setLibraryOpen(false)}
                    onInsert={async (payloads) => {
                        if (payloads.some((payload) => payload.kind === "text")) throw new Error(t("storyboardAssets.textNotAllowed"));
                        const imported = await onImport(payloads);
                        const additions = imported.flatMap((node) => {
                            const binding = bindingForConnectedNode(node);
                            return binding ? [binding] : [];
                        });
                        setDraft((current) => normalizeStoryboardAssetBindings([...current, ...additions]));
                    }}
                />
            ) : null}
        </>
    );
}
