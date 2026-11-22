import { workspacePath, workspaceTeamId } from "@/lib/workspace-routes";
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Link, useLocation } from "react-router";
import { Clapperboard, CloudUpload, Gauge, History, FolderTree, CloudDownload, CopyPlus, Focus, FolderKanban, Home, LayoutGrid, Workflow, LoaderCircle, Menu, PanelsLeftBottom, Pencil, Plus, Redo2, Save, Search, Share2, Trash2, Undo2, Upload } from "lucide-react";
import { Button, Dropdown } from "antd";
import { AntTooltip as Tooltip } from "@/components/ui/base/tooltip/ant-tooltip";
import { workspaceBackTarget } from "@/lib/workspace-navigation";

import { WorkspaceCreditGiftMark } from "@/components/layout/workspace-credit-gift-mark";
import { useWalletBalance } from "@/hooks/use-wallet-balance";
import { YingxueBrandMark } from "@/components/brand/yingxue-brand-mark";
import { openWorkspaceWallet } from "@/lib/workspace-wallet";
import { canvasDockStyle } from "@/lib/canvas/canvas-aceternity-style";
import type { CanvasContextSummary } from "@/lib/canvas/canvas-context-summary";
import type { CanvasShortDramaProgress } from "@/lib/canvas/canvas-short-drama";
import { canvasThemes, type CanvasTheme } from "@/lib/canvas-theme";
import { useCanvasThemeStore } from "@/stores/canvas/use-canvas-theme-store";
import { useInterfaceLocaleStore, useInterfaceTranslation } from "@/stores/use-interface-locale-store";
import { interfaceLocaleOptions } from "@/lib/interface-locale";
import { useUserStore } from "@/stores/use-user-store";
import type { CanvasMediaPerformanceMode } from "@/types/canvas";
import { CanvasShortcutsModal } from "./canvas-shortcuts-modal";

export type CanvasProjectView = "canvas" | "assets";

type CanvasProjectHeadingProps = {
    view: CanvasProjectView;
    onViewChange: (view: CanvasProjectView) => void;
    title: string;
    titleDraft: string;
    isTitleEditing: boolean;
    onTitleDraftChange: (value: string) => void;
    onStartTitleEditing: () => void;
    onFinishTitleEditing: () => void;
    onCancelTitleEditing: () => void;
    canUndo: boolean;
    canRedo: boolean;
    onCreateProject: () => void;
    onDeleteProject: () => void;
    onSave: () => void | Promise<void>;
    onForceSave: () => void;
    onImportImage: () => void;
    onUndo: () => void;
    onRedo: () => void;
    syncIcon?: ReactNode;
    onOpenSearch: () => void;
    /** kind=drama 表示关联的是自动制作短剧，链接回短剧制作台。 */
    projectContext?: CanvasContextSummary & { projectId: string; projectName: string; kind?: "drama" };
};

type CanvasTopBarProps = Pick<CanvasProjectHeadingProps, "view" | "onViewChange" | "onOpenSearch"> & {
    projectHeading?: ReactNode;
    versionsOpen: boolean;
    onToggleVersions: () => void;
    mediaPerformanceMode: CanvasMediaPerformanceMode;
    onMediaPerformanceModeChange: (mode: CanvasMediaPerformanceMode) => void;
    onImportLibTV: () => void;
    onImportTapNow: () => void;
    onShare?: () => void;
    shortcutRequestNonce: number;
    onEnterFocusMode: () => void;
    shortDramaGuide?: { progress: CanvasShortDramaProgress; collapsed: boolean; onToggle: () => void };
};

export function CanvasProjectHeading({
    view,
    onViewChange,
    title,
    titleDraft,
    isTitleEditing,
    onTitleDraftChange,
    onStartTitleEditing,
    onFinishTitleEditing,
    onCancelTitleEditing,
    canUndo,
    canRedo,
    onCreateProject,
    onDeleteProject,
    onSave,
    onForceSave,
    onImportImage,
    onUndo,
    onRedo,
    syncIcon,
    onOpenSearch,
    projectContext,
}: CanvasProjectHeadingProps) {
    const { t } = useInterfaceTranslation();
    const back = workspaceBackTarget(useLocation().state, workspacePath(projectContext ? `/projects/${projectContext.projectId}/canvases` : "/canvas"));
    const setLocale = useInterfaceLocaleStore((state) => state.setLocale);
    const languageLoadFailed = useInterfaceLocaleStore((state) => state.loadFailed);
    const theme = canvasThemes[useCanvasThemeStore((state) => state.theme)];
    const titleRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!isTitleEditing) return;
        const close = (event: PointerEvent) => {
            if (!titleRef.current?.contains(event.target as Node)) onFinishTitleEditing();
        };
        document.addEventListener("pointerdown", close, true);
        return () => document.removeEventListener("pointerdown", close, true);
    }, [isTitleEditing, onFinishTitleEditing]);

    return (
        <header className="canvas-topbar-cluster canvas-topbar-project-cluster pointer-events-auto flex min-w-0 items-center gap-2 justify-self-start" style={{ color: theme.node.text, "--dock-command-hover": theme.toolbar.itemHover } as CSSProperties}>
            <Link to={back.to} state={back.state} replace aria-label={t("galleryBack")} title={t("galleryBack")} className="inline-flex shrink-0 rounded-md px-1 focus-visible:outline-2">
                <YingxueBrandMark className="h-8 w-16" />
            </Link>
            <CanvasTopBarTooltip label={t("canvasToolbarMenu")}>
                <Dropdown
                    trigger={["click"]}
                    menu={{
                        items: [
                            {
                                key: "view",
                                icon: view === "canvas" ? <FolderTree className="size-4" /> : <Workflow className="size-4" />,
                                label: t(view === "canvas" ? "canvasSwitchToAssets" : "canvasSwitchToCanvas"),
                                onClick: () => onViewChange(view === "canvas" ? "assets" : "canvas"),
                            },
                            { type: "divider" },
                            { key: "home", icon: <Home className="size-4" />, label: <Link to={workspacePath("/home")}>{t("canvasToolbarHome")}</Link> },
                            { key: "projects", icon: <LayoutGrid className="size-4" />, label: <Link to={workspacePath("/canvas")}>{t("canvasToolbarCanvases")}</Link> },
                            { key: "language", label: t(languageLoadFailed ? "languageLoadFailed" : "language"), children: interfaceLocaleOptions.map(option => ({ key: option.value, label: option.label, onClick: () => { void setLocale(option.value); } })) },
                            { type: "divider" },
                            { key: "new", icon: <Plus className="size-4" />, label: t("canvasToolbarNew"), onClick: onCreateProject },
                            { key: "delete", danger: true, icon: <Trash2 className="size-4" />, label: t("canvasToolbarDelete"), onClick: onDeleteProject },
                            { key: "save", icon: <Save className="size-4" />, label: <MenuLabel text={t("canvasToolbarSave")} shortcut="⌘ S" />, onClick: () => void onSave() },
                            { key: "force-save", icon: <CloudUpload className="size-4" />, label: t("canvasToolbarRepairSave"), onClick: onForceSave },
                            { type: "divider" },
                            { key: "import", icon: <Upload className="size-4" />, label: t("canvasToolbarImportMedia"), onClick: onImportImage },
                            { key: "search", icon: <Search className="size-4" />, label: <MenuLabel text={t("canvasToolbarSearch")} shortcut="⌘ F" />, onClick: onOpenSearch },
                            { type: "divider" },
                            { key: "undo", disabled: !canUndo, icon: <Undo2 className="size-4" />, label: <MenuLabel text={t("canvasToolbarUndo")} shortcut="⌘ Z" />, onClick: onUndo },
                            { key: "redo", disabled: !canRedo, icon: <Redo2 className="size-4" />, label: <MenuLabel text={t("canvasToolbarRedo")} shortcut="⌘ ⇧ Z / ⌘ Y" />, onClick: onRedo },
                        ],
                    }}
                >
                    <button type="button" className="canvas-topbar-action grid size-9 place-items-center rounded-full" style={{ color: theme.node.text }} aria-label={t("canvasToolbarMenu")}>
                        <Menu className="size-5" />
                    </button>
                </Dropdown>
            </CanvasTopBarTooltip>

            <div ref={titleRef} className="canvas-topbar-title-block flex min-w-0 flex-auto flex-col items-start overflow-hidden">
                {isTitleEditing ? (
                    <input
                        autoFocus
                        size={canvasTitleInputSize(titleDraft)}
                        value={titleDraft}
                        onChange={(event) => onTitleDraftChange(event.target.value)}
                        onBlur={onFinishTitleEditing}
                        onKeyDown={(event) => {
                            if (event.key === "Enter") onFinishTitleEditing();
                            if (event.key === "Escape") onCancelTitleEditing();
                        }}
                        className="h-8 w-auto min-w-12 max-w-[min(280px,42vw)] appearance-none border-0 bg-transparent p-0 text-left text-base font-semibold tracking-normal outline-none ring-0 focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0"
                        style={{ color: theme.node.text, caretColor: theme.accent.primary, border: 0, boxShadow: "none", outline: "none" }}
                        aria-label="画布名称"
                    />
                ) : (
                    <div className="canvas-topbar-title-row flex min-w-0 items-center gap-0.5">
                        <button type="button" className="min-w-0 flex-1 truncate text-left text-base font-semibold tracking-normal transition-opacity hover:opacity-75" onClick={onStartTitleEditing} title="点击修改画布名称">
                            {title}
                        </button>
                        <CanvasTopBarTooltip label="重命名画布">
                            <button
                                type="button"
                                className="canvas-topbar-action grid size-7 shrink-0 place-items-center rounded-md opacity-60 transition-opacity hover:opacity-100 focus-visible:outline-none focus-visible:ring-2"
                                style={{ color: theme.node.text }}
                                onClick={onStartTitleEditing}
                                aria-label="重命名画布"
                            >
                                <Pencil className="size-3.5" />
                            </button>
                        </CanvasTopBarTooltip>
                    </div>
                )}
                {projectContext && !isTitleEditing ? (
                    <div className="canvas-topbar-project-context mt-0.5 flex w-full min-w-0 items-center gap-2 overflow-hidden text-[var(--fs-tiny)]" style={{ color: theme.node.muted }}>
                        <Link
                            to={`/projects/${encodeURIComponent(projectContext.projectId)}`}
                            className="inline-flex min-w-0 items-center gap-1 hover:underline"
                            title={projectContext.kind === "drama" ? `打开短剧制作台：${projectContext.projectName}` : `返回项目：${projectContext.projectName}`}
                        >
                            {projectContext.kind === "drama" ? <Clapperboard className="size-3 shrink-0" /> : <FolderKanban className="size-3 shrink-0" />}
                            <span className="max-w-[120px] truncate">{projectContext.projectName}</span>
                        </Link>
                        <span aria-hidden>·</span>
                        <button type="button" className="min-w-0 truncate hover:underline" onClick={onOpenSearch} title="搜索并定位章节或镜头">
                            {projectContext.chapterLabel || `${projectContext.nodeCount} 个节点`}
                            {projectContext.shotLabel ? ` · ${projectContext.shotLabel}` : ""}
                            {projectContext.selectedCount ? ` · 已选 ${projectContext.selectedCount}` : ""}
                        </button>
                    </div>
                ) : null}
            </div>
            {syncIcon}
        </header>
    );
}

export function CanvasTopBar({ projectHeading, versionsOpen, onToggleVersions, mediaPerformanceMode, onMediaPerformanceModeChange, view, onViewChange, onOpenSearch, onImportLibTV, onImportTapNow, onShare, shortcutRequestNonce, onEnterFocusMode, shortDramaGuide }: CanvasTopBarProps) {
    const { locale, t } = useInterfaceTranslation();
    const theme = canvasThemes[useCanvasThemeStore((state) => state.theme)];
    const dockStyle = canvasDockStyle(theme, theme.node.text);
    const user = useUserStore((state) => state.user);
    const creditsEnabled = useUserStore((state) => state.features.creditsEnabled) && !workspaceTeamId;
    const { availableMicrocredits, refreshing } = useWalletBalance(user?.id, creditsEnabled);
    const [shortcutsOpen, setShortcutsOpen] = useState(false);
    const [importMenuOpen, setImportMenuOpen] = useState(false);

    useEffect(() => {
        if (shortcutRequestNonce > 0) setShortcutsOpen(true);
    }, [shortcutRequestNonce]);

    return (
        <>
            <div className="canvas-topbar pointer-events-none absolute inset-x-0 top-0 z-[var(--z-toolbar)] grid h-[var(--canvas-topbar-h)] grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center px-4 sm:px-5">
                {projectHeading}

                <CanvasViewSwitch view={view} onChange={onViewChange} dockStyle={dockStyle} theme={theme} />

                <div className="canvas-topbar-cluster canvas-topbar-tools-cluster pointer-events-auto col-start-3 row-start-1 flex items-center gap-2 justify-self-end" style={dockStyle}>
                    <CanvasTopBarTooltip label={t("canvasToolbarSearchCanvas")}>
                        <Button
                            type="text"
                            className="canvas-topbar-action !hidden !h-10 !w-10 !min-w-10 !rounded-xl !p-0 lg:!inline-flex"
                            style={{ color: theme.node.text }}
                            icon={<Search className="size-4" />}
                            onClick={onOpenSearch}
                            aria-label={t("canvasToolbarSearchCanvas")}
                        />
                    </CanvasTopBarTooltip>
                    <CanvasTopBarTooltip label="导入第三方画布" suppressed={importMenuOpen}>
                        <Dropdown
                            trigger={["click"]}
                            placement="bottomRight"
                            onOpenChange={setImportMenuOpen}
                            menu={{
                                items: [
                                    { key: "libtv", icon: <CopyPlus className="size-4" />, label: t("canvasImportTitle", { source: "LibTV" }), onClick: onImportLibTV },
                                    { key: "tapnow", icon: <CloudDownload className="size-4" />, label: t("canvasImportTitle", { source: "TapNow" }), onClick: onImportTapNow },
                                ],
                            }}
                        >
                            <Button type="text" className="canvas-topbar-action canvas-topbar-import-button !h-10 !rounded-xl !px-2.5 !font-medium" style={{ color: theme.node.text }} icon={<CloudDownload className="size-4" />} aria-label={t("canvasToolbarImport")}>
                                <span className="hidden lg:inline">{t("canvasToolbarImport")}</span>
                            </Button>
                        </Dropdown>
                    </CanvasTopBarTooltip>
                    <CanvasTopBarTooltip label={t("canvasToolbarPerformanceMode")}>
                        <Dropdown
                            trigger={["click"]}
                            menu={{
                                selectable: true,
                                selectedKeys: [mediaPerformanceMode],
                                onClick: ({ key }) => onMediaPerformanceModeChange(key as CanvasMediaPerformanceMode),
                                items: [
                                    { key: "auto", label: t("canvasToolbarAuto") },
                                    { key: "quality", label: t("canvasToolbarQuality") },
                                    { key: "performance", label: t("canvasToolbarFast") },
                                ],
                            }}
                        >
                            <Button type="text" className="canvas-topbar-action !hidden !h-10 !w-10 !min-w-10 !rounded-xl !p-0 lg:!inline-flex" style={{ color: theme.node.text }} icon={<Gauge className="size-4" />} aria-label={t("canvasToolbarPerformanceMode")} />
                        </Dropdown>
                    </CanvasTopBarTooltip>
                    {user && creditsEnabled ? (
                        <CanvasTopBarTooltip label={t("canvasToolbarCredits")}>
                            <button
                                type="button"
                                className="canvas-topbar-action inline-flex h-9 min-w-[5.5rem] items-center justify-center gap-1.5 rounded-lg px-2.5 text-xs font-medium tabular-nums"
                                style={{ color: theme.node.text }}
                                aria-label={t("canvasToolbarCredits")}
                                onClick={() => openWorkspaceWallet()}
                            >
                                {refreshing && availableMicrocredits === null ? <LoaderCircle className="size-3.5 animate-spin opacity-60" style={{ color: theme.accent.primary }} /> : <WorkspaceCreditGiftMark className="is-compact" />}
                                <span>{availableMicrocredits === null ? "--" : (availableMicrocredits / 1_000_000).toLocaleString(locale, { maximumFractionDigits: 3 })}</span>
                            </button>
                        </CanvasTopBarTooltip>
                    ) : null}
                    <CanvasTopBarTooltip label={t("canvasToolbarFocusHint")}>
                        <Button type="text" className="canvas-topbar-action !h-10 !w-10 !min-w-10 !rounded-xl !p-0" style={{ color: theme.node.text }} icon={<Focus className="size-4" />} onClick={onEnterFocusMode} aria-label={t("canvasToolbarFocus")} />
                    </CanvasTopBarTooltip>
                    {shortDramaGuide ? (
                        <CanvasTopBarTooltip label={shortDramaGuide.collapsed ? t("canvasToolbarExpandDrama") : t("canvasToolbarCollapseDrama")}>
                            <Button
                                type="text"
                                className="canvas-topbar-action !h-10 !rounded-xl !px-2.5 !font-medium"
                                style={{ color: theme.node.text, background: shortDramaGuide.collapsed ? undefined : theme.toolbar.activeBg }}
                                icon={<Clapperboard className="size-4" />}
                                onClick={shortDramaGuide.onToggle}
                                aria-label={t("canvasToolbarDrama")}
                                aria-pressed={!shortDramaGuide.collapsed}
                            >
                                <span className="tabular-nums">{shortDramaGuide.progress.completedCount}/5</span>
                            </Button>
                        </CanvasTopBarTooltip>
                    ) : null}
                    <CanvasTopBarTooltip label={t("canvasToolbarVersionsHint")}>
                        <Button
                            type="text"
                            className="canvas-topbar-action canvas-topbar-version-button !h-10 !rounded-xl !px-2.5 !font-medium"
                            style={{ color: theme.node.text, background: versionsOpen ? theme.toolbar.activeBg : undefined }}
                            icon={<History className="size-4" />}
                            aria-label={t("canvasToolbarVersions")}
                            aria-pressed={versionsOpen}
                            onClick={onToggleVersions}
                        >
                            {t("canvasToolbarVersion")}
                        </Button>
                    </CanvasTopBarTooltip>
                    {onShare && (
                        <CanvasTopBarTooltip label={t("canvasToolbarShare")}>
                        <Button type="text" className="canvas-topbar-action !h-10 !w-10 !min-w-10 !rounded-xl !p-0" style={{ color: theme.node.text }} icon={<Share2 className="size-4" />} onClick={onShare} aria-label={t("canvasToolbarShare")} />
                    </CanvasTopBarTooltip>
                    )}
                </div>
            </div>
            <CanvasShortcutsModal open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
        </>
    );
}

// 居中的视图切换：胶囊轨道里两个圆形图标按钮，当前视图用反色圆形标出；两项都是持久状态，用 aria-pressed 表达。
// 文字收进提示与 aria-label。窄屏两侧命令组占满时隐藏，入口保留在画布菜单里。
function CanvasViewSwitch({ view, onChange, dockStyle, theme }: { view: CanvasProjectView; onChange: (view: CanvasProjectView) => void; dockStyle: CSSProperties; theme: CanvasTheme }) {
    const { t } = useInterfaceTranslation();
    const items: Array<{ value: CanvasProjectView; label: string; icon: ReactNode }> = [
        { value: "canvas", label: t("canvasControls.canvas"), icon: <Workflow /> },
        { value: "assets", label: t("canvasControls.assets"), icon: <PanelsLeftBottom /> },
    ];
    const style = {
        ...dockStyle,
        "--view-switch-idle": theme.node.muted,
        "--view-switch-hover": theme.node.text,
        "--view-switch-active-bg": theme.node.text,
        "--view-switch-active-fg": theme.canvas.background,
    } as CSSProperties;
    return (
        <div role="group" aria-label={t("canvasControls.views")} className="canvas-topbar-cluster canvas-topbar-view-switch pointer-events-auto col-start-2 row-start-1 hidden items-center justify-self-center xl:flex" style={style}>
            {items.map((item) => (
                <CanvasTopBarTooltip key={item.value} label={item.label}>
                    {/* 未分层的 `button { color: inherit }` 会压过 @layer 里的颜色规则，颜色走行内变量，由样式表按状态切换。 */}
                    <button type="button" className="canvas-topbar-view-option" style={{ color: "var(--view-switch-color)" }} aria-label={item.label} aria-pressed={view === item.value} onClick={() => onChange(item.value)}>
                        {item.icon}
                    </button>
                </CanvasTopBarTooltip>
            ))}
        </div>
    );
}

// 顶栏是 --z-toolbar 上的绝对定位浮层，会为子元素建立层叠上下文。行内绝对定位的提示
// 无论 z-index 多高都无法越过它，会被顶栏下方 --z-panel-floating 的生成任务面板盖住，
// 因此提示必须走 portal 的浮层层级。
// 提示向下弹出会盖住顶栏下方的节点工具栏：离开立即消失，且提示本身不接收指针，避免截获下方按钮的点击。
// suppressed 用于对应菜单展开期间不再显示提示。
function CanvasTopBarTooltip({ label, suppressed = false, children }: { label: string; suppressed?: boolean; children: ReactNode }) {
    return (
        <Tooltip title={suppressed ? null : label} placement="bottom" mouseLeaveDelay={0} styles={{ root: { pointerEvents: "none" } }}>
            <span className="relative inline-flex">{children}</span>
        </Tooltip>
    );
}

function MenuLabel({ text, shortcut }: { text: string; shortcut: string }) {
    return (
        <span className="flex min-w-36 items-center justify-between gap-8">
            <span>{text}</span>
            <span className="text-xs opacity-45">{shortcut}</span>
        </span>
    );
}

function canvasTitleInputSize(value: string) {
    const visualLength = Array.from(value || "画布名称").reduce((length, character) => length + (character.codePointAt(0)! > 0xff ? 2 : 1), 0);
    return Math.min(30, Math.max(5, visualLength));
}
