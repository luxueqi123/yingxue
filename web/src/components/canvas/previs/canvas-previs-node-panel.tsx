import { useInterfaceTranslation } from "@/stores/use-interface-locale-store";
import { useState, type ReactNode } from "react";
import { Box, Camera, Clapperboard, Lightbulb, LockKeyhole, Move3d, Timer, MousePointerClick } from "lucide-react";
import { CachedResourceImage } from "@/components/cached-resource-image";
import { canvasThemes, type CanvasTheme } from "@/lib/canvas-theme";
import { gatePrevisPreviewFailure, resolvePrevisActiveShot, resolvePrevisPreviewSource, type PrevisNodeContentReader } from "@/lib/canvas/previs/previs-preview";
import { useActiveTheme } from "@/stores/canvas/use-canvas-theme-store";
import type { CanvasNodeData } from "@/types/canvas";
import type { PrevisScene } from "@/types/previs";
import { PrevisMiniViewport } from "./previs-mini-viewport";
import "./canvas-previs-node-card.css";
export function CanvasPrevisNodePanel({ node, scene, readNodeContent, onOpen, professional = true }: { node: CanvasNodeData; scene: PrevisScene | null; readNodeContent: PrevisNodeContentReader; onOpen: () => void; professional?: boolean }) {
    const { t } = useInterfaceTranslation();
    const theme = canvasThemes[useActiveTheme()];
    const shot = resolvePrevisActiveShot(scene, node.metadata?.previsShotId);
    const [failedUrl, setFailedUrl] = useState<string | null>(null);
    const preview = gatePrevisPreviewFailure(resolvePrevisPreviewSource({ scene, shot, previewNodeId: node.metadata?.previsPreviewNodeId, readNodeContent }), failedUrl);
    const title = node.metadata?.workflowTitle || node.title;
    const objectCount = scene?.objects.filter((item) => item.visible !== false).length || 0;
    const cameraCount = scene?.cameras.length || 0;
    const lightCount = scene?.lights.length || 0;
    return (
        <div className="previs-node-card" style={{ color: theme.node.text }}>
            <header className="previs-node-card-header">
                <div className="previs-node-card-kicker">
                    <span className="previs-node-card-mark">
                        <Clapperboard className="size-3.5" />
                    </span>
                    <span>PREVIS / 3D</span>
                </div>
                <span className="previs-node-card-status">
                    <span className="size-1.5 rounded-full bg-emerald-400" />
                    {t("canvasPrevisUi001")}
                </span>
            </header>
            <div className="previs-node-card-title-row">
                <div className="min-w-0">
                    <h3 className="previs-node-card-title" title={title}>
                        {title}
                    </h3>
                    <p className="previs-node-card-shot" title={shot?.name || t("canvasPrevisUi002")}>
                        {shot?.name || t("canvasPrevisUi002")}
                    </p>
                </div>
                <span className="previs-node-card-duration">
                    <Timer className="size-3" />
                    {shot?.duration ?? 0}s
                </span>
            </div>

            <button
                type="button"
                data-canvas-no-zoom
                className="previs-node-preview group"
                style={{ background: theme.node.fill, borderColor: theme.node.stroke }}
                title={professional ? t("canvasPrevisUi003") : t("canvasPrevisUi004")}
                disabled={!professional}
                onMouseDown={(event) => event.stopPropagation()}
                onPointerDown={(event) => event.stopPropagation()}
                onClick={(event) => {
                    event.stopPropagation();
                    onOpen();
                }}
            >
                {preview.kind === "image" ? (
                    <CachedResourceImage
                        src={preview.url}
                        storageKey={preview.storageKey}
                        alt={t("canvasPrevisDyn001", { title })}
                        className="previs-node-preview-image"
                        draggable={false}
                        eager
                        fallback={<PrevisPreviewState kind="empty" theme={theme} />}
                        onError={() => setFailedUrl(preview.url || preview.storageKey || "")}
                    />
                ) : scene && scene.objects.length > 0 ? (
                    <PrevisMiniViewport scene={scene} />
                ) : (
                    <PrevisPreviewState kind={preview.kind} theme={theme} />
                )}
                <span className={`previs-node-preview-cta ${professional ? "group-hover:opacity-100 group-focus-visible:opacity-100" : "opacity-100"}`} style={{ background: `${theme.toolbar.panel}e8`, color: theme.node.text }}>
                    {professional ? (
                        <>
                            <Move3d className="size-3.5" />
                            {t("canvasPrevisUi005")}
                        </>
                    ) : (
                        <>
                            <LockKeyhole className="size-3.5" />
                            {t("canvasPrevisUi006")}
                        </>
                    )}
                </span>
            </button>

            <footer className="previs-node-card-footer" style={{ borderColor: theme.node.stroke, color: theme.node.muted }}>
                <Stat icon={<Box className="size-3" />} value={objectCount} label={t("canvasPrevisUi007")} />
                <Stat icon={<Camera className="size-3" />} value={cameraCount} label={t("canvasPrevisUi008")} />
                <Stat icon={<Lightbulb className="size-3" />} value={lightCount} label={t("canvasPrevisUi009")} />
                <span className="previs-node-card-footer-action">
                    <MousePointerClick className="size-3" />
                    {t("canvasPrevisUi010")}
                </span>
            </footer>
        </div>
    );
}
function PrevisPreviewState({ kind, theme }: { kind: "loading" | "empty"; theme: CanvasTheme }) {
    const { t } = useInterfaceTranslation();
    const loading = kind === "loading";
    return (
        <div className="flex h-full w-full flex-col items-center justify-center gap-2 px-3 text-center">
            <span className="grid size-11 shrink-0 place-items-center rounded-2xl" style={{ background: theme.toolbar.activeBg }}>
                <Clapperboard className="size-4" style={{ color: theme.node.muted }} aria-hidden />
            </span>
            <span className="max-w-full truncate text-xs font-semibold" style={{ color: theme.node.text }}>
                {loading ? t("canvasPrevisUi011") : t("canvasPrevisUi012")}
            </span>
            <span className="max-w-full text-[11px] leading-4" style={{ color: theme.node.muted }}>
                {loading ? t("canvasPrevisUi013") : t("canvasPrevisUi014")}
            </span>
        </div>
    );
}
function Stat({ icon, value, label }: { icon: ReactNode; value: number; label: string }) {
    const { t } = useInterfaceTranslation();
    return (
        <span className="inline-flex min-w-0 items-center gap-1" title={t("canvasPrevisDyn002", { count: value, label: label })}>
            {icon}
            <b>{value}</b>
            <span>{label}</span>
        </span>
    );
}
