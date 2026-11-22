import { useEffect, useRef, type RefObject } from "react";
import { Link } from "react-router";
import { ArrowUp, LayoutGrid, Workflow } from "lucide-react";
import { Fragment, useId, useState, type CSSProperties } from "react";
import { Popover } from "antd";
import { AlignLeft, ArrowUpRight, Check, ChevronUp, Clapperboard, FolderKanban, Images, Palette, Pencil, Plus, Sparkles, Type, Upload, X } from "lucide-react";

import { canvasThemes } from "@/lib/canvas-theme";
import { CanvasCreateMenu, type CanvasCreateCommand } from "@/components/canvas/canvas-create-menu";
import type { CanvasShortDramaProgress, CanvasShortDramaStepId } from "@/lib/canvas/canvas-short-drama";
import { useActiveTheme } from "@/stores/canvas/use-canvas-theme-store";
import { CanvasNodeType, type CanvasNodeData } from "@/types/canvas";

import { useInterfaceTranslation } from "@/stores/use-interface-locale-store";

import "./canvas-short-drama-entry.css";

const stepMessageKeys = { style: "entryChooseStyle", story: "entryEnterStory", storyboard: "entryGenerateStoryboard", video: "entryGenerateVideo", final: "entryMergeFilm" } as const;

export function CanvasLinkedProjectEmptyState({ projectName, hasChapter, onAddFirstChapter, onOpenAssets, onAddText }: { projectName: string; hasChapter: boolean; onAddFirstChapter: () => void; onOpenAssets: () => void; onAddText: () => void }) {
    const theme = canvasThemes[useActiveTheme()];
    const { t } = useInterfaceTranslation();
    return (
        <div className="pointer-events-none absolute inset-0 z-20 grid place-items-center px-4 pb-16 pt-20">
            <div className="pointer-events-auto w-full max-w-[440px] rounded-lg border p-3 shadow-sm backdrop-blur" data-canvas-no-zoom style={{ background: theme.toolbar.panel, borderColor: theme.toolbar.border, color: theme.node.text }}>
                <div className="flex items-center gap-2.5">
                    <span className="grid size-8 shrink-0 place-items-center rounded-md" style={{ background: theme.toolbar.itemHover, color: theme.node.muted }}>
                        <FolderKanban className="size-4" />
                    </span>
                    <div className="min-w-0">
                        <h2 className="truncate text-sm font-semibold">{projectName}</h2>
                        <p className="mt-0.5 text-[var(--fs-label)]" style={{ color: theme.node.muted }}>
                            {t("entryProjectEmpty")}
                        </p>
                    </div>
                </div>
                <div className="mt-3 grid grid-cols-3 gap-1.5">
                    <button
                        type="button"
                        disabled={!hasChapter}
                        onClick={onAddFirstChapter}
                        className="flex h-9 min-w-0 items-center justify-center gap-1 rounded-md border px-2 text-[var(--fs-label)] font-medium disabled:opacity-35"
                        style={{ borderColor: theme.node.stroke, background: theme.node.fill }}
                    >
                        <Plus className="size-3.5 shrink-0" />
                        <span className="truncate">{t("entryFirstChapter")}</span>
                    </button>
                    <button
                        type="button"
                        onClick={onOpenAssets}
                        className="flex h-9 min-w-0 items-center justify-center gap-1 rounded-md border px-2 text-[var(--fs-label)] font-medium"
                        style={{ borderColor: theme.node.stroke, background: theme.node.fill }}
                    >
                        <Images className="size-3.5 shrink-0" />
                        <span className="truncate">{t("timelineProjectAssets")}</span>
                    </button>
                    <button type="button" onClick={onAddText} className="flex h-9 min-w-0 items-center justify-center gap-1 rounded-md border px-2 text-[var(--fs-label)] font-medium" style={{ borderColor: theme.node.stroke, background: theme.node.fill }}>
                        <Type className="size-3.5 shrink-0" />
                        <span className="truncate">{t("entryNewText")}</span>
                    </button>
                </div>
            </div>
        </div>
    );
}

export function CanvasShortDramaEmptyState({
    onCreatePipeline,
    onSubmitPrompt,
    onStartFreeform,
    onUpload,
    onAddText,
    onAddScript,
}: {
    onCreatePipeline: () => void;
    /** 空字符串表示只打开 Agent，不自动提交。 */
    onSubmitPrompt: (prompt: string) => void;
    onStartFreeform: () => void;
    onUpload: () => void;
    onAddText: () => void;
    onAddScript: () => void;
}) {
    const theme = canvasThemes[useActiveTheme()];
    const { t } = useInterfaceTranslation();
    const [prompt, setPrompt] = useState("");
    const stageRef = useRef<HTMLDivElement>(null);
    const entryStyle = {
        "--canvas-entry-text": theme.node.text,
        "--canvas-entry-muted": theme.node.muted,
        "--canvas-entry-accent": theme.accent.primary,
        "--canvas-entry-on-accent": theme.accent.onPrimary,
        "--canvas-entry-surface": theme.spatial.elevated,
        "--canvas-entry-border": theme.toolbar.border,
    } as CSSProperties;
    const submit = () => {
        const value = prompt.trim();
        if (!value) return;
        onSubmitPrompt(value);
        setPrompt("");
    };
    useCanvasEntryClickRipple(stageRef);
    return (
        <div ref={stageRef} className="canvas-entry-stage" style={entryStyle}>
            <CanvasEntryAmbientRipple />
            <div className="canvas-entry-shell" data-canvas-no-zoom data-canvas-wheel-scroll>
                <span className="canvas-entry-eyebrow">
                    <Clapperboard aria-hidden="true" />
                    {t("canvasEntry.studio")}
                </span>
                <h2 className="canvas-entry-title">
                    {t("canvasEntry.lead")}<strong>{t("canvasEntry.end")}</strong>
                </h2>
                <form
                    className="canvas-entry-composer"
                    onSubmit={(event) => {
                        event.preventDefault();
                        submit();
                    }}
                >
                    <textarea
                        value={prompt}
                        rows={2}
                        placeholder={t("canvasEntry.placeholder")}
                        aria-label={t("canvasEntry.prompt")}
                        onChange={(event) => setPrompt(event.target.value)}
                        onKeyDown={(event) => {
                            if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                                event.preventDefault();
                                submit();
                            }
                        }}
                    />
                    <div className="canvas-entry-composer-bar">
                        <button type="button" className="canvas-entry-ghost" onClick={onUpload}>
                            <Upload aria-hidden="true" />
                            {t("canvasEntry.import")}
                        </button>
                        <span className="canvas-entry-hint">{t("canvasEntry.keyboard")}</span>
                        <button type="submit" className="canvas-entry-send" disabled={!prompt.trim()} aria-label={t("canvasEntry.agent")}>
                            <ArrowUp aria-hidden="true" />
                        </button>
                    </div>
                </form>
                <div className="canvas-entry-suggestions" role="list" aria-label={t("canvasEntry.examples")}>
                    {ENTRY_SUGGESTIONS.map((key) => (
                        <button key={key} type="button" role="listitem" onClick={() => setPrompt(t(key))}>
                            {t(key)}
                        </button>
                    ))}
                </div>
                <div className="canvas-entry-paths">
                    <button type="button" onClick={onCreatePipeline}>
                        <Workflow aria-hidden="true" />
                        <span>
                            <strong>{t("canvasEntry.manual")}</strong>
                        </span>
                    </button>
                    <button type="button" onClick={onAddScript}>
                        <Clapperboard aria-hidden="true" />
                        <span>
                            <strong>{t("canvasEntry.storyboard")}</strong>
                        </span>
                    </button>
                    <button type="button" onClick={onAddText}>
                        <Type aria-hidden="true" />
                        <span>
                            <strong>{t("canvasEntry.text")}</strong>
                        </span>
                    </button>
                    <button type="button" onClick={onStartFreeform}>
                        <LayoutGrid aria-hidden="true" />
                        <span>
                            <strong>{t("canvasEntry.blank")}</strong>
                        </span>
                    </button>
                </div>
            </div>
        </div>
    );
}

function CanvasEntryFilmMark() {
    const id = useId();
    return (
        <svg className="canvas-entry-film-mark" viewBox="0 0 112 112" fill="none" aria-hidden="true" focusable="false">
            <defs>
                <linearGradient id={`${id}-front`} x1="27" y1="18" x2="76" y2="91" gradientUnits="userSpaceOnUse">
                    <stop stopColor="var(--canvas-entry-metal-highlight)" />
                    <stop offset="0.42" stopColor="var(--canvas-entry-metal-mid)" />
                    <stop offset="0.66" stopColor="var(--canvas-entry-metal-highlight)" />
                    <stop offset="1" stopColor="var(--canvas-entry-metal-shadow)" />
                </linearGradient>
                <linearGradient id={`${id}-edge`} x1="36" y1="21" x2="86" y2="83" gradientUnits="userSpaceOnUse">
                    <stop stopColor="var(--canvas-entry-metal-mid)" />
                    <stop offset="1" stopColor="var(--canvas-entry-metal-shadow)" />
                </linearGradient>
            </defs>
            <path d="M35 17 92 50Q98 54 92 58L35 91 26 86 82 54 26 22Z" fill={`url(#${id}-edge)`} />
            <path d="M26 22 82 54 26 86V22ZM36 39V69L62 54 36 39Z" fill={`url(#${id}-front)`} fillRule="evenodd" />
            <path d="M26 22 82 54 26 86V22Z" stroke="var(--canvas-entry-metal-highlight)" strokeOpacity="0.45" strokeWidth="0.6" strokeLinejoin="round" />
            <path d="M36 39V69L62 54" stroke="var(--canvas-entry-metal-shadow)" strokeWidth="1" strokeLinejoin="round" />
            <path d="m35 17 57 33" stroke="var(--canvas-entry-metal-highlight)" strokeOpacity="0.5" strokeWidth="0.6" />
        </svg>
    );
}

export function CanvasFreeformEmptyState({ commands }: { commands: CanvasCreateCommand[] }) {
    const theme = canvasThemes[useActiveTheme()];
    const { t } = useInterfaceTranslation();
    const [createOpen, setCreateOpen] = useState(false);
    const quickCommands = [CanvasNodeType.Text, CanvasNodeType.Script, CanvasNodeType.Image, CanvasNodeType.Video].flatMap((id) => commands.filter((command) => command.id === id));
    const createCommands = commands.map((command) => ({
        ...command,
        onClick: () => {
            setCreateOpen(false);
            command.onClick();
        },
    }));
    return (
        <div className="pointer-events-none absolute inset-0 z-20 grid place-items-center px-4 pb-20 pt-24">
            <div className="pointer-events-auto flex w-full max-w-[520px] flex-col items-center text-center" data-canvas-no-zoom style={{ color: theme.node.text }}>
                <h2 className="text-base font-semibold">{t("composerStart")}</h2>
                <div className="mt-5 grid w-full grid-cols-2 gap-3 sm:grid-cols-4" role="group" aria-label={t("entryCreationStartingPoints")}>
                    {quickCommands.map((command) => (
                        <button
                            key={command.id}
                            type="button"
                            onClick={command.onClick}
                            className="flex h-24 flex-col items-center justify-center gap-3 rounded-xl border text-xs font-medium transition-transform hover:-translate-y-1 focus-visible:outline-2 motion-reduce:transform-none"
                            style={{ background: theme.node.fill, borderColor: theme.node.stroke }}
                        >
                            <span className="[&_svg]:size-6">{command.icon}</span>
                            <span>{command.label}</span>
                        </button>
                    ))}
                </div>
                <Popover
                    arrow={false}
                    open={createOpen}
                    onOpenChange={setCreateOpen}
                    placement="bottom"
                    trigger="click"
                    content={
                        <div className="w-[420px] max-w-[calc(100vw-48px)] p-1" onWheel={(event) => event.stopPropagation()}>
                            <CanvasCreateMenu commands={createCommands} />
                        </div>
                    }
                >
                    <button
                        type="button"
                        aria-label={t("entryMoreToolsLabel")}
                        aria-expanded={createOpen}
                        className="mt-4 inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-xs focus-visible:ring-2"
                        style={{ color: theme.node.muted, "--tw-ring-color": theme.accent.primary } as CSSProperties}
                    >
                        <Plus className="size-3.5" />
                        {t("entryMoreTools")}
                    </button>
                </Popover>
            </div>
        </div>
    );
}

export function CanvasShortDramaGuide({ progress, collapsed, onToggle, onSkip, onStepClick }: { progress: CanvasShortDramaProgress; collapsed: boolean; onToggle: () => void; onSkip: () => void; onStepClick: (stepId: CanvasShortDramaStepId) => void }) {
    const theme = canvasThemes[useActiveTheme()];
    const { t } = useInterfaceTranslation();
    if (!progress.active || collapsed) return null;
    return (
        <div
            data-canvas-no-zoom
            className="absolute left-1/2 top-[var(--canvas-topbar-offset)] z-[var(--z-toolbar)] flex max-w-[calc(100%_-_24px)] -translate-x-1/2 items-center gap-1 rounded-lg border p-1 shadow-sm backdrop-blur"
            style={{ background: theme.toolbar.panel, borderColor: theme.toolbar.border, color: theme.node.text }}
        >
            <div className="hide-scrollbar flex min-w-0 flex-1 items-center overflow-x-auto">
                <div className="flex shrink-0 items-center px-[var(--space-1)]">
                    {progress.steps.map((step, index) => (
                        <Fragment key={step.id}>
                            {index ? (
                                <span
                                    aria-hidden
                                    className="shrink-0 rounded-full transition-colors duration-150 motion-reduce:transition-none"
                                    style={{ width: "var(--flow-step-track-width)", height: "var(--flow-step-track-height)", background: step.status === "pending" ? theme.node.stroke : theme.accent.primary }}
                                />
                            ) : null}
                            <button
                                type="button"
                                aria-current={step.status === "current" ? "step" : undefined}
                                className="flex h-8 shrink-0 items-center gap-[var(--flow-step-gap)] rounded-md px-[var(--space-1-half)] outline-none transition-colors motion-reduce:transition-none hover:bg-black/5 focus-visible:ring-1 focus-visible:ring-inset dark:hover:bg-white/10"
                                style={{ "--tw-ring-color": theme.accent.primary } as CSSProperties}
                                onClick={() => onStepClick(step.id)}
                            >
                                <span
                                    className="grid shrink-0 place-items-center rounded-full font-semibold transition-all duration-150 motion-reduce:transition-none"
                                    style={{
                                        width: step.status === "current" ? "var(--flow-step-node-current)" : "var(--flow-step-node)",
                                        height: step.status === "current" ? "var(--flow-step-node-current)" : "var(--flow-step-node)",
                                        background: step.status === "pending" ? "transparent" : theme.accent.primary,
                                        border: step.status === "pending" ? "var(--stroke-2) solid var(--cn-stroke)" : "none",
                                        color: step.status === "pending" ? theme.node.muted : theme.accent.onPrimary,
                                        boxShadow: step.status === "current" ? "var(--flow-step-current-glow)" : undefined,
                                        fontSize: step.status === "current" ? "var(--fs-body)" : "var(--fs-caption)",
                                    }}
                                >
                                    {step.status === "completed" ? <Check className="size-3.5" /> : index + 1}
                                </span>
                                <span
                                    className="whitespace-nowrap text-[var(--fs-caption)] font-semibold transition-colors duration-150 motion-reduce:transition-none"
                                    style={{ color: step.status === "current" ? theme.accent.primary : step.status === "completed" ? theme.node.text : theme.node.muted }}
                                >
                                    {t(stepMessageKeys[step.id])}
                                </span>
                            </button>
                        </Fragment>
                    ))}
                </div>
            </div>
            <span className="mx-1 h-4 w-px shrink-0" style={{ background: theme.toolbar.border }} />
            {!progress.completed ? (
                <button
                    type="button"
                    className="inline-flex h-8 shrink-0 items-center gap-1 rounded-md px-2 text-[var(--fs-label)] outline-none transition hover:bg-black/5 focus-visible:ring-2 dark:hover:bg-white/10"
                    style={{ color: theme.node.muted, "--tw-ring-color": theme.accent.primary } as CSSProperties}
                    onClick={onSkip}
                >
                    <X className="size-3" />
                    {t("entrySkipGuide")}
                </button>
            ) : null}
            <button
                type="button"
                className="grid size-8 shrink-0 place-items-center rounded-md outline-none transition hover:bg-black/5 focus-visible:ring-2 dark:hover:bg-white/10"
                style={{ color: theme.node.muted, "--tw-ring-color": theme.accent.primary } as CSSProperties}
                onClick={onToggle}
                aria-label={t("entryCollapseGuide")}
            >
                <ChevronUp className="size-3.5" />
            </button>
        </div>
    );
}

export function CanvasStylePlaceholderNodeContent({ onChoose }: { onChoose: () => void }) {
    const theme = canvasThemes[useActiveTheme()];
    const { t } = useInterfaceTranslation();
    return (
        <div className="flex h-full w-full flex-col items-center justify-center px-6 text-center" style={{ color: theme.node.text }}>
            <span className="grid size-10 place-items-center rounded-md" style={{ background: `${theme.accent.primary}16`, color: theme.accent.primary }}>
                <Palette className="size-5" />
            </span>
            <div className="mt-3 text-sm font-semibold">{t("entryProjectStyle")}</div>
            <div className="mt-1 text-xs" style={{ color: theme.node.muted }}>
                {t("entryStylePending")}
            </div>
            <button
                type="button"
                className="mt-4 inline-flex h-8 items-center gap-1.5 rounded-md border px-3 text-xs font-medium outline-none transition hover:brightness-105 focus-visible:ring-2"
                style={{ background: theme.toolbar.panel, borderColor: theme.node.stroke, "--tw-ring-color": theme.accent.primary } as CSSProperties}
                onMouseDown={(event) => event.stopPropagation()}
                onClick={(event) => {
                    event.stopPropagation();
                    onChoose();
                }}
            >
                <Sparkles className="size-3.5" />
                {t("entryChooseStyle")}
            </button>
        </div>
    );
}

export function CanvasStoryInputNodeContent({ node, onEdit }: { node: CanvasNodeData; onEdit: () => void }) {
    const theme = canvasThemes[useActiveTheme()];
    const { t } = useInterfaceTranslation();
    const content = (node.metadata?.content || "").replace(/\s+/g, " ").trim();
    return (
        <div className="flex h-full w-full flex-col overflow-hidden p-4" style={{ color: theme.node.text }}>
            <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2">
                    <span className="grid size-8 shrink-0 place-items-center rounded-md" style={{ background: theme.toolbar.itemHover, color: theme.node.muted }}>
                        <AlignLeft className="size-4" />
                    </span>
                    <span className="truncate text-sm font-semibold">{t("entryStorySynopsis")}</span>
                </div>
            </div>
            <div className="mt-4 min-h-0 flex-1 overflow-hidden border-t pt-3 text-xs leading-6" style={{ borderColor: theme.node.stroke, color: content ? theme.node.muted : theme.node.placeholder }}>
                {content || t("entryStoryPlaceholder")}
            </div>
            <button
                type="button"
                className="mt-3 inline-flex h-8 w-fit items-center gap-1.5 rounded-md px-2 text-xs font-medium outline-none transition hover:bg-black/5 focus-visible:ring-2 dark:hover:bg-white/10"
                style={{ color: theme.node.text, "--tw-ring-color": theme.accent.primary } as CSSProperties}
                onMouseDown={(event) => event.stopPropagation()}
                onClick={(event) => {
                    event.stopPropagation();
                    onEdit();
                }}
            >
                <Pencil className="size-3.5" />
                {t("entryEditStory")}
            </button>
        </div>
    );
}

export function CanvasDramaEmptyState({ dramaName, studioPath, episodeLabel, onProjectEpisode, onAddText }: { dramaName: string; studioPath: string; episodeLabel?: string; onProjectEpisode?: () => void; onAddText: () => void }) {
    const theme = canvasThemes[useActiveTheme()];
    const actionStyle = { borderColor: theme.node.stroke, background: theme.node.fill, color: theme.node.text };
    return (
        <div className="pointer-events-none absolute inset-0 z-20 grid place-items-center px-4 pb-16 pt-20">
            <div className="pointer-events-auto w-full max-w-[460px] rounded-lg border p-3 shadow-sm backdrop-blur" data-canvas-no-zoom style={{ background: theme.toolbar.panel, borderColor: theme.toolbar.border, color: theme.node.text }}>
                <div className="flex items-center gap-2">
                    <span className="grid size-8 shrink-0 place-items-center rounded-md" style={{ background: theme.toolbar.itemHover, color: theme.node.muted }}>
                        <Clapperboard className="size-4" />
                    </span>
                    <div className="min-w-0">
                        <h2 className="truncate text-sm font-semibold">{dramaName} · 精修画布</h2>
                        <p className="mt-0.5 text-[var(--fs-label)]" style={{ color: theme.node.muted }}>
                            从左侧短剧侧栏投送设定、剧情段或成片；精修后在节点工具栏点“采用到短剧”写回。
                        </p>
                    </div>
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2">
                    <button
                        type="button"
                        disabled={!onProjectEpisode}
                        onClick={onProjectEpisode}
                        className="flex h-9 min-w-0 items-center justify-center gap-1 rounded-md border px-2 text-[var(--fs-label)] font-medium disabled:opacity-35"
                        style={actionStyle}
                        title={onProjectEpisode ? `把${episodeLabel || "第一集"}的剧情段投送到画布` : "还没有可投送的剧情段"}
                    >
                        <LayoutGrid className="size-3.5 shrink-0" />
                        <span className="truncate">投送{episodeLabel || "第一集"}</span>
                    </button>
                    <Link to={studioPath} className="flex h-9 min-w-0 items-center justify-center gap-1 rounded-md border px-2 text-[var(--fs-label)] font-medium" style={actionStyle}>
                        <FolderKanban className="size-3.5 shrink-0" />
                        <span className="truncate">打开制作台</span>
                    </Link>
                    <button type="button" onClick={onAddText} className="flex h-9 min-w-0 items-center justify-center gap-1 rounded-md border px-2 text-[var(--fs-label)] font-medium" style={actionStyle}>
                        <Type className="size-3.5 shrink-0" />
                        <span className="truncate">新建文本</span>
                    </button>
                </div>
            </div>
        </div>
    );
}
const ENTRY_SUGGESTIONS = ["canvasEntry.cat", "canvasEntry.romance", "canvasEntry.mystery"] as const;
function CanvasEntryAmbientRipple() {
    return (
        <div className="canvas-entry-ripple" aria-hidden="true">
            <span className="canvas-entry-ripple-ring" />
            <span className="canvas-entry-ripple-ring" />
            <span className="canvas-entry-ripple-ring" />
            <span className="canvas-entry-ripple-ring" />
        </div>
    );
}
function useCanvasEntryClickRipple(stageRef: RefObject<HTMLDivElement | null>) {
    useEffect(() => {
        const stage = stageRef.current;
        const viewport = stage?.closest<HTMLElement>("[data-canvas-viewport]") ?? stage?.parentElement;
        if (!stage || !viewport) return;
        if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
        const handle = (event: PointerEvent) => {
            const target = event.target instanceof Element ? event.target : null;
            if (target?.closest(".canvas-entry-shell,[data-canvas-no-zoom]") || event.button !== 0) return;
            const rect = stage.getBoundingClientRect();
            const x = event.clientX - rect.left;
            const y = event.clientY - rect.top;
            if (x < 0 || y < 0 || x > rect.width || y > rect.height) return;
            const wave = document.createElement("span");
            wave.className = "canvas-entry-click-ripple";
            wave.style.left = `${x}px`;
            wave.style.top = `${y}px`;
            stage.appendChild(wave);
            wave.addEventListener("animationend", () => wave.remove(), { once: true });
        };
        viewport.addEventListener("pointerdown", handle);
        return () => viewport.removeEventListener("pointerdown", handle);
    }, [stageRef]);
}
