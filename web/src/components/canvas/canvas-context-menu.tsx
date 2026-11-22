import type { InterfaceTranslate } from "@/lib/interface-locale";
import { AnimatePresence } from "motion/react";
import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import {
    ArrowLeft,
    AtSign,
    Check,
    ChevronRight,
    CircleCheckBig,
    Clapperboard,
    Clipboard,
    CloudUpload,
    Copy,
    Download,
    FolderOpen,
    FolderPlus,
    History,
    Image as ImageIcon,
    Layers3,
    LayoutTemplate,
    Link2,
    Maximize2,
    PanelTop,
    Pencil,
    Plus,
    Redo2,
    Tags,
    Trash2,
    Undo2,
    Upload,
    UserRound,
} from "lucide-react";

import { CanvasCreateMenu, type CanvasCreateCommand } from "@/components/canvas/canvas-create-menu";
import { ASSET_ASSIGNABLE_CATEGORY_OPTIONS } from "@/lib/asset-category";
import { aceternityMotion } from "@/lib/aceternity-motion";
import { SpotlightSurface } from "@/components/ui/aceternity/spotlight-surface";
import { canvasThemes } from "@/lib/canvas-theme";
import { canvasNodeAssetCategory } from "@/lib/canvas/canvas-node-asset";
import { isCanvasFolderNode } from "@/lib/canvas/canvas-frame";
import { currentMediaVersion, hasMediaVersionHistory, listMediaVersions } from "@/lib/canvas/canvas-media-versions";
import { formatRelativeTime } from "@/lib/relative-time";
import { resolveAddNodeMenuCommands, type AddNodeMenuContext } from "@/lib/canvas/tool-registry";
import { useActiveTheme } from "@/stores/canvas/use-canvas-theme-store";
import { usePluginStore } from "@/stores/use-plugin-store";
import { useInterfaceTranslation } from "@/stores/use-interface-locale-store";
import { CanvasNodeType, type CanvasNodeData, type CanvasNodeTypeId, type CanvasWorkspaceMode, type ContextMenuState, type Position } from "@/types/canvas";

type CanvasAssetCategory = NonNullable<NonNullable<CanvasNodeData["metadata"]>["assetCategory"]>;

const assetCategoryOptions: Array<{ value: CanvasAssetCategory; label: string }> = ASSET_ASSIGNABLE_CATEGORY_OPTIONS;

type CanvasNodeContextMenuProps = {
    menu: ContextMenuState;
    node?: CanvasNodeData | null;
    workspaceMode?: CanvasWorkspaceMode;
    isProjectLinked?: boolean;
    canUndo: boolean;
    canRedo: boolean;
    canPaste: boolean;
    selectedCount?: number;
    onClose: () => void;
    onAddNode: (type: CanvasNodeTypeId) => void;
    onAddFolder: () => void;
    onChooseStyle: () => void;
    onOpenPrevis: (position: Position) => void;
    onUpload: () => void;
    onOpenAssets: () => void;
    onOpenProjectCharacters: () => void;
    onOpenPoseLibrary?: () => void;
    onUndo: () => void;
    onRedo: () => void;
    onPaste: () => void;
    onCopyNode: () => void;
    onCreateGenerationCopy: () => void;
    onDuplicate: () => void;
    onDelete: () => void;
    onSaveAsset: () => void;
    onViewMedia: () => void;
    onOpenVersions?: () => void;
    onEditText: () => void;
    onOpenDrawing: () => void;
    onGenerateImage: () => void;
    onCopyContent: () => void;
    onCopyMediaUrl: () => void;
    onUploadToArkPrivateAsset: () => void;
    onSetAssetCategory: (category: CanvasAssetCategory) => void;
    onToggleFrame: () => void;
    onSpreadSelection?: () => void;
    onCopySelection?: () => void;
    onDeleteSelection?: () => void;
    onSendToAgent?: () => void;
    downloadableSelectionCount?: number;
    onDownloadSelection?: () => void;

onAdoptToDrama?: () => void;
onCreateDramaFromStoryboard?: () => void;};

export function CanvasNodeContextMenu({
    menu,
    node,
    workspaceMode = "professional",
    isProjectLinked = false,
    canUndo,
    canRedo,
    canPaste,
    selectedCount = 0,
    onClose,
    onAddNode,
    onAddFolder,
    onChooseStyle,
    onOpenPrevis,
    onUpload,
    onOpenAssets,
    onOpenProjectCharacters,
    onOpenPoseLibrary,
    onUndo,
    onRedo,
    onPaste,
    onCopyNode,
    onCreateGenerationCopy,
    onDuplicate,
    onDelete,
    onSaveAsset,
    onViewMedia,
    onOpenVersions,
    onEditText,
    onOpenDrawing,
    onGenerateImage,
    onCopyContent,
    onCopyMediaUrl,
    onUploadToArkPrivateAsset,
    onSetAssetCategory,
    onToggleFrame,
    onSpreadSelection,
    onCopySelection,
    onDeleteSelection,
    onSendToAgent,
    downloadableSelectionCount = 0,
    onDownloadSelection,
 onAdoptToDrama, onCreateDramaFromStoryboard}: CanvasNodeContextMenuProps) {
    const theme = canvasThemes[useActiveTheme()];
    const { t } = useInterfaceTranslation();
    const [addOpen, setAddOpen] = useState(false);
    const [categoryOpen, setCategoryOpen] = useState(false);

    useEffect(() => {
        const close = (event: PointerEvent) => {
            const target = event.target;
            if (target instanceof Element && target.closest(".ant-popover")) return;
            onClose();
        };
        const closeOnEscape = (event: KeyboardEvent) => {
            if (event.key !== "Escape") return;
            if (categoryOpen) setCategoryOpen(false);
            else onClose();
        };
        window.addEventListener("pointerdown", close);
        window.addEventListener("keydown", closeOnEscape);
        return () => {
            window.removeEventListener("pointerdown", close);
            window.removeEventListener("keydown", closeOnEscape);
        };
    }, [categoryOpen, onClose]);

    useEffect(() => {
        setAddOpen(menu.type === "canvas" && Boolean(menu.createOpen));
        setCategoryOpen(false);
    }, [menu]);

    const runAction = (action: () => void) => {
        action();
        onClose();
    };
    const nodeContent = typeof node?.metadata?.content === "string" ? node.metadata.content : "";
    const isImage = node?.type === CanvasNodeType.Image;
    const isText = node?.type === CanvasNodeType.Text;
    const isCharacterReference = Boolean(isText && node?.metadata?.workflowKind === "character" && node.metadata.characterAssetId);
    const isDrawing = node?.type === CanvasNodeType.Drawing;
    const isVideo = node?.type === CanvasNodeType.Video;
    const isMedia = isImage || isVideo;
    const isAudio = node?.type === CanvasNodeType.Audio;
    const isFrame = node?.type === CanvasNodeType.Frame;
    const isFolder = isCanvasFolderNode(node);
    const hasNodeContent = isText ? Boolean(nodeContent.trim()) : Boolean(nodeContent);
    const canSaveAsset = Boolean(node && !isCharacterReference && (isText ? hasNodeContent : hasNodeContent && (isImage || isVideo || isAudio)));
    const canOpenPreview = Boolean(isMedia && hasNodeContent);
    const canGenerateFromText = Boolean(isText && !isCharacterReference && hasNodeContent);
    const canCopyMediaUrl = Boolean(isMedia && hasNodeContent);
    const assetCategory = node ? canvasNodeAssetCategory(node) : "other";
    const hasMultiSelection = selectedCount >= 2;
    const versionCount = listMediaVersions(node).length;
    const versionCurrent = currentMediaVersion(node);
    const canOpenVersions = Boolean(onOpenVersions && hasMediaVersionHistory(node));
    const versionDetail = canOpenVersions ? (versionCurrent ? `当前 V${versionCurrent.number} · ${formatRelativeTime(versionCurrent.createdAt)}` : "当前内容未在历史中，可切回旧版本") : "重新生成或替换后保留旧版本";
    const versionMenuButton = onOpenVersions ? (
        <MenuButton icon={<History />} label={t("sharedDialogsUi.versionHistory")} badge={versionCount > 1 ? String(versionCount) : undefined} detail={versionDetail} disabled={!canOpenVersions} onClick={() => runAction(onOpenVersions)} />
    ) : null;
    const position = getContextMenuPosition(menu, hasMultiSelection);
    const skippedDownloadCount = Math.max(0, selectedCount - downloadableSelectionCount);
    const downloadSelectionButton = hasMultiSelection ? (
        <MenuButton
            icon={<Download />}
            label={downloadableSelectionCount ? t("canvasCompleteUi.downloadAssetCount", { value0: downloadableSelectionCount }) : t("canvasCompleteUi.downloadAssets")}
            detail={!downloadableSelectionCount ? t("canvasCompleteUi.noDownloadableMedia") : skippedDownloadCount ? t("canvasCompleteUi.skipInvalidAssets", { value0: skippedDownloadCount }) : t("canvasCompleteUi.individualDownloads")}
            disabled={!onDownloadSelection || !downloadableSelectionCount}
            onClick={() => onDownloadSelection && runAction(onDownloadSelection)}
        />
    ) : null;

    return (
        <>
            <SpotlightSurface
                spotlightColor={theme.toolbar.itemHover}
                data-canvas-context-menu
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: aceternityMotion.duration.instant, ease: aceternityMotion.easing.enter }}
                className="aceternity-floating-panel fixed z-[var(--z-popover)] flex w-[224px] max-h-[calc(100vh-56px)] origin-top-left flex-col overflow-hidden rounded-[var(--r-lg)] border p-1.5 backdrop-blur-2xl backdrop-saturate-150"
                style={
                    { left: position.left, top: position.top, background: theme.spatial.elevated, borderColor: theme.toolbar.border, color: theme.node.text, "--menu-hover": theme.toolbar.itemHover, "--tw-ring-color": theme.node.muted } as CSSProperties
                }
                onContextMenu={(event) => event.preventDefault()}
                onPointerDown={(event) => event.stopPropagation()}
            >
                <div className="absolute inset-x-8 top-0 h-px" style={{ background: `linear-gradient(90deg, transparent, ${theme.toolbar.border}, transparent)` }} />
                <div className="thin-scrollbar min-h-0 overflow-y-auto">
                    {onCreateDramaFromStoryboard ? <MenuButton icon={<Clapperboard />} label="交给短剧自动制作" detail="按分镜原样转录，生成参考图与视频" onClick={() => runAction(onCreateDramaFromStoryboard)} /> : null}
{menu.type === "node" && isMedia && categoryOpen ? (
                        <>
                            <MenuHeader title={t("contextCategory")} description={node?.title || nodeTypeLabel(node, t)} onBack={() => setCategoryOpen(false)} />
                            <MenuSection label={t("contextUsage")} />
                            {assetCategoryOptions.map((option) => (
                                <MenuButton key={option.value} icon={assetCategory === option.value ? <Check /> : <Tags />} label={option.label} active={assetCategory === option.value} onClick={() => runAction(() => onSetAssetCategory(option.value))} />
                            ))}
                        </>
                    ) : menu.type === "canvas" ? (
                        <>
                            <MenuHeader title={t("contextCanvas")} />
                            {hasMultiSelection ? (
                                <>
                                    <MenuButton icon={<LayoutTemplate className="size-4" />} label={t("contextSpread")} detail={t("contextSpreadDetail")} disabled={!onSpreadSelection} onClick={() => onSpreadSelection && runAction(onSpreadSelection)} />
                                    {downloadSelectionButton}
                                    <MenuDivider />
                                </>
                            ) : null}
                            <MenuButton icon={<Plus className="size-4" />} label={t("createAddNodes")} chevron active={addOpen} onClick={() => setAddOpen((value) => !value)} />
                            <MenuButton icon={<Upload className="size-4" />} label={t("contextUpload")} onClick={() => runAction(onUpload)} />
                            {!isProjectLinked ? <MenuButton icon={<FolderOpen className="size-4" />} label={t("contextInsertAsset")} onClick={() => runAction(onOpenAssets)} /> : null}
                            <MenuDivider />
                            <MenuSection label={t("contextHistory")} />
                            <MenuButton icon={<Undo2 className="size-4" />} label={t("canvasToolbarUndo")} shortcut="⌘Z" disabled={!canUndo} onClick={() => runAction(onUndo)} />
                            <MenuButton icon={<Redo2 className="size-4" />} label={t("canvasToolbarRedo")} shortcut="⇧⌘Z" disabled={!canRedo} onClick={() => runAction(onRedo)} />
                            <MenuButton icon={<Clipboard className="size-4" />} label={t("contextPaste")} shortcut="⌘V" disabled={!canPaste} onClick={() => runAction(onPaste)} />
                        </>
                    ) : menu.type === "node" && hasMultiSelection ? (
                        <>
                            <MenuHeader title={t("contextSelected", { count: selectedCount })} />
                            <MenuSection label={t("contextSelection")} />
                            <MenuButton icon={<LayoutTemplate />} label={t("contextSpread")} detail={t("contextSpreadDetail")} disabled={!onSpreadSelection} onClick={() => onSpreadSelection && runAction(onSpreadSelection)} />
                            <MenuDivider />
                            <MenuButton icon={<Copy />} label={t("contextCopyCount", { count: selectedCount })} shortcut="⌘C" disabled={!onCopySelection} onClick={() => onCopySelection && runAction(onCopySelection)} />
                            {downloadSelectionButton}
                            <MenuButton icon={<AtSign />} label={t("contextAgent")} disabled={!onSendToAgent} onClick={() => onSendToAgent && runAction(onSendToAgent)} />
                            <MenuButton icon={<Trash2 />} label={t("toolbarDeleteCount", { count: selectedCount })} danger disabled={!onDeleteSelection} onClick={() => onDeleteSelection && runAction(onDeleteSelection)} />
                        </>
                    ) : menu.type === "node" ? (
                        <>
                            {isCharacterReference ? (
                                <>
                                    <MenuHeader title={t("contextCharacter")} description={node?.metadata?.characterName || node?.title} />
                                    <MenuSection label={t("contextCharacterRef")} />
                                    <MenuButton icon={<UserRound />} label={t("contextCharacterDetail")} onClick={() => runAction(onEditText)} />
                                    <MenuDivider />
                                    <MenuSection label={t("contextNode")} />
                                    <MenuButton icon={<AtSign />} label={t("contextAgent")} disabled={!onSendToAgent} onClick={() => onSendToAgent && runAction(onSendToAgent)} />
                                    <MenuButton icon={<Copy />} label={t("contextCopyCharacter")} shortcut="⌘C" onClick={() => runAction(onCopyNode)} />
                                    <MenuButton icon={<Layers3 />} label={t("contextDuplicateRef")} shortcut="⌘D" onClick={() => runAction(onDuplicate)} />
                                    <MenuButton icon={<Trash2 />} label={t("contextDeleteNode")} danger onClick={() => runAction(onDelete)} />
                                </>
                            ) : isMedia ? (
                                <>
                                    <MenuHeader title={t(isImage ? "contextImage" : "contextVideo")} description={node?.title || nodeTypeLabel(node, t)} />
                                    <MenuSection label={t("contextArchive")} />
                                    <MenuButton icon={<Maximize2 />} label={t("contextPreview")} disabled={!canOpenPreview} onClick={() => runAction(onViewMedia)} />
                                    {onAdoptToDrama ? <MenuButton icon={<CircleCheckBig />} label="采用到短剧" detail={isImage ? "设为设定参考图" : "设为剧情段视频"} disabled={!hasNodeContent} onClick={() => runAction(onAdoptToDrama)} /> : null}
{versionMenuButton}
                                    <MenuButton icon={<Tags />} label={t("contextCategory")} chevron onClick={() => setCategoryOpen(true)} />
                                    {isImage ? <MenuButton icon={<CloudUpload />} label={t("contextArk")} onClick={() => runAction(onUploadToArkPrivateAsset)} /> : null}
                                    <MenuDivider />
                                    <MenuSection label={t("contextNode")} />
                                    <MenuButton icon={<AtSign />} label={t("contextAgent")} disabled={!onSendToAgent} onClick={() => onSendToAgent && runAction(onSendToAgent)} />
                                    <MenuButton icon={<Copy />} label={t("contextCopyNode")} shortcut="⌘C" onClick={() => runAction(onCopyNode)} />
                                    {isImage ? <MenuButton icon={<Clipboard />} label={t("contextCopyImage")} disabled={!hasNodeContent} onClick={() => runAction(onCopyContent)} /> : null}
                                    <MenuButton icon={<Link2 />} label={t(isImage ? "contextImageUrl" : "contextVideoUrl")} disabled={!canCopyMediaUrl} onClick={() => runAction(onCopyMediaUrl)} />
                                    <MenuButton icon={<Copy />} label={t("contextGenerationCopy")} onClick={() => runAction(onCreateGenerationCopy)} />
                                    <MenuButton icon={<Layers3 />} label={t("contextVariant")} shortcut="⌘D" onClick={() => runAction(onDuplicate)} />
                                    <MenuButton icon={<Trash2 />} label={t("contextDeleteNode")} danger onClick={() => runAction(onDelete)} />
                                </>
                            ) : (
                                <>
                                    <MenuHeader title={node?.title || nodeTypeLabel(node, t)} />
                                    <MenuSection label={t("contextActions")} />
                                    {isFrame ? <MenuButton icon={isFolder ? <FolderOpen /> : <PanelTop />} label={t(node?.metadata?.frame?.collapsed ? (isFolder ? "contextExpandFolder" : "contextExpandFrame") : (isFolder ? "contextCollapseFolder" : "contextCollapseFrame"))} onClick={() => runAction(onToggleFrame)} /> : <MenuButton icon={<FolderPlus />} label={t("contextSave")} disabled={!canSaveAsset} onClick={() => runAction(onSaveAsset)} />}
                                    {isText ? <MenuButton icon={<Maximize2 />} label={t("contextEdit")} onClick={() => runAction(onEditText)} /> : null}
                                    {isDrawing ? <MenuButton icon={<Pencil />} label={t("contextDrawing")} onClick={() => runAction(onOpenDrawing)} /> : null}
                                    {isText ? <MenuButton icon={<ImageIcon />} label={t("contextGenerate")} disabled={!canGenerateFromText} onClick={() => runAction(onGenerateImage)} /> : null}
                                    {isAudio ? versionMenuButton : null}
                                    <MenuDivider />
                                    <MenuSection label={t("contextCopies")} />
                                    <MenuButton icon={<AtSign />} label={t("contextAgent")} disabled={!onSendToAgent} onClick={() => onSendToAgent && runAction(onSendToAgent)} />
                                    <MenuButton icon={<Copy />} label={t(isFrame ? (isFolder ? "contextCopyFolder" : "contextCopyFrame") : "contextCopyNode")} shortcut="⌘C" onClick={() => runAction(onCopyNode)} />
                                    {isText ? <MenuButton icon={<Clipboard />} label={t("contextCopyText")} disabled={!hasNodeContent} onClick={() => runAction(onCopyContent)} /> : null}
                                    <MenuButton icon={<Copy />} label={t(isFrame ? (isFolder ? "contextDuplicateFolder" : "contextDuplicateFrame") : "contextVariant")} shortcut="⌘D" onClick={() => runAction(onDuplicate)} />
                                    <MenuButton icon={<Clipboard />} label={t("contextPaste")} shortcut="⌘V" disabled={!canPaste} onClick={() => runAction(onPaste)} />
                                    <MenuButton icon={<Trash2 />} label={t(isFrame ? (isFolder ? "contextDeleteFolder" : "contextDeleteFrame") : "contextDeleteNode")} danger onClick={() => runAction(onDelete)} />
                                </>
                            )}
                        </>
                    ) : (
                        <>
                            <MenuHeader title={t("contextConnection")} />
                            <MenuButton icon={<Trash2 className="size-4" />} label={t("contextDeleteConnection")} danger onClick={() => runAction(onDelete)} />
                        </>
                    )}
                </div>
            </SpotlightSurface>

            <AnimatePresence>
                {menu.type === "canvas" && addOpen ? (
                    <AddNodeContextMenu
                        parentPosition={position}
                        workspaceMode={workspaceMode}
                        isProjectLinked={isProjectLinked}
                        onAddNode={(type) => runAction(() => onAddNode(type))}
                        onAddFolder={() => runAction(onAddFolder)}
                        onChooseStyle={() => runAction(onChooseStyle)}
                        onOpenPrevis={() => runAction(() => onOpenPrevis(menu.position))}
                        onUpload={() => runAction(onUpload)}
                        onOpenAssets={() => runAction(onOpenAssets)}
                        onOpenProjectCharacters={() => runAction(onOpenProjectCharacters)}
                        onOpenPoseLibrary={onOpenPoseLibrary ? () => runAction(onOpenPoseLibrary) : undefined}
                    />
                ) : null}
            </AnimatePresence>
        </>
    );
}

function AddNodeContextMenu({
    parentPosition,
    workspaceMode,
    isProjectLinked,
    onAddNode,
    onAddFolder,
    onChooseStyle,
    onOpenPrevis,
    onUpload,
    onOpenAssets,
    onOpenProjectCharacters,
    onOpenPoseLibrary,
}: {
    parentPosition: { left: number; top: number };
    workspaceMode: CanvasWorkspaceMode;
    isProjectLinked: boolean;
    onAddNode: (type: CanvasNodeTypeId) => void;
    onAddFolder: () => void;
    onChooseStyle: () => void;
    onOpenPrevis: () => void;
    onUpload: () => void;
    onOpenAssets: () => void;
    onOpenProjectCharacters: () => void;
    onOpenPoseLibrary?: () => void;
}) {
    const theme = canvasThemes[useActiveTheme()];
    const installations = usePluginStore((state) => state.installations);
    const pluginStates = usePluginStore((state) => state.pluginStates);
    const left = getSubmenuLeft(parentPosition.left);
    const { locale } = useInterfaceTranslation();
    const createContext: AddNodeMenuContext = {
        locale,
        workspaceMode,
        isProjectLinked,
        enabledPluginIds: new Set(installations.filter((item) => pluginStates[item.manifest.id]?.effectiveEnabled ?? item.enabled).map((item) => item.manifest.id)),
        handlers: {
            onAddText: () => onAddNode(CanvasNodeType.Text),
            onAddImage: () => onAddNode(CanvasNodeType.Image),
            onAddVideo: () => onAddNode(CanvasNodeType.Video),
            onAddAudio: () => onAddNode(CanvasNodeType.Audio),
            onAddScript: () => onAddNode(CanvasNodeType.Script),
            onAddFrame: () => onAddNode(CanvasNodeType.Frame),
            onAddFolder,
            onAddDrawing: () => onAddNode(CanvasNodeType.Drawing),
            onAddExtensionNode: onAddNode,
            onAddWorkflow: () => onAddNode(CanvasNodeType.Config),
            onChooseStyle,
            onOpenPrevis,
            onUpload,
            onOpenMyAssets: onOpenAssets,
            onOpenProjectCharacters,
            onOpenPoseLibrary,
        },
    };
    const commands: CanvasCreateCommand[] = resolveAddNodeMenuCommands(createContext).map((command) => ({
        id: command.id,
        label: command.label,
        icon: command.icon,
        badge: command.badge,
        section: command.section,
        onClick: () => command.run(createContext),
    }));

    return (
        <SpotlightSurface
            spotlightColor={theme.toolbar.itemHover}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: aceternityMotion.duration.instant, ease: aceternityMotion.easing.enter }}
            className="aceternity-floating-panel fixed z-[var(--z-popover)] w-[360px] origin-top overflow-hidden rounded-[var(--dock-radius)] border p-2 backdrop-blur-2xl"
            style={{ left, top: parentPosition.top, background: theme.spatial.elevated, borderColor: theme.toolbar.border, color: theme.node.text }}
            onContextMenu={(event) => event.preventDefault()}
            onPointerDown={(event) => event.stopPropagation()}
        >
            <CanvasCreateMenu commands={commands} />
        </SpotlightSurface>
    );
}

function MenuHeader({ title, description, onBack }: { title: string; description?: string; onBack?: () => void }) {
    const { t } = useInterfaceTranslation();
    const theme = canvasThemes[useActiveTheme()];
    return (
        <div className="mb-0.5 flex items-start gap-1 px-1.5 py-1.5">
            {onBack ? <button type="button" onClick={onBack} className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-md outline-none hover:bg-black/5 focus-visible:ring-2 dark:hover:bg-white/8" aria-label={t("contextBack")}><ArrowLeft className="size-3.5" /></button> : null}
            <span className="min-w-0"><span className="block truncate text-xs font-semibold">{title}</span>{description && description !== title ? <span className="mt-0.5 block truncate text-[var(--fs-micro)]" style={{ color: theme.node.muted }}>{description}</span> : null}</span>
        </div>
    );
}

function MenuSection({ label }: { label: string }) {
    return <div className="px-2 pb-1 pt-2 text-[var(--fs-micro)] font-medium opacity-45">{label}</div>;
}

function MenuButton({
    icon,
    label,
    detail,
    shortcut,
    badge,
    chevron = false,
    active = false,
    disabled = false,
    danger = false,
    onClick,
}: {
    icon: ReactNode;
    label: string;
    detail?: string;
    shortcut?: string;
    badge?: string;
    chevron?: boolean;
    active?: boolean;
    disabled?: boolean;
    danger?: boolean;
    onClick?: () => void;
}) {
    const theme = canvasThemes[useActiveTheme()];
    const color = danger ? theme.accent.danger : theme.node.text;
    return (
        <button
            type="button"
            className="canvas-menu-item group flex min-h-9 w-full items-center gap-2 rounded-lg border border-transparent px-2 py-1 text-left outline-none enabled:hover:border-black/10 enabled:hover:bg-black/5 focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-35 dark:enabled:hover:border-white/10 dark:enabled:hover:bg-white/8"
            style={{ color, background: active ? theme.toolbar.activeBg : undefined, "--tw-ring-color": theme.node.muted } as CSSProperties}
            disabled={disabled}
            onClick={onClick}
        >
            <span className="canvas-menu-item-icon grid size-7 shrink-0 place-items-center rounded-md border opacity-75 group-hover:opacity-100 [&_svg]:size-3.5" style={{ background: danger ? `${theme.accent.danger}12` : theme.spatial.surface, borderColor: danger ? `${theme.accent.danger}33` : theme.toolbar.border, color: danger ? theme.accent.danger : theme.node.text }}>{icon}</span>
            <span className="min-w-0 flex-1"><span className="flex items-center gap-1 text-xs font-medium"><span className="truncate">{label}</span>{badge ? <span className="rounded-full border px-1 py-0.5 text-[var(--fs-nano)] font-semibold" style={{ background: theme.toolbar.activeBg, borderColor: theme.toolbar.border, color: theme.node.muted }}>{badge}</span> : null}</span>{detail ? <span className="mt-0.5 block truncate text-[var(--fs-micro)]" style={{ color: theme.node.muted }}>{detail}</span> : null}</span>
            {shortcut ? <span className="shrink-0 text-[var(--fs-micro)] opacity-38">{shortcut}</span> : null}
            {chevron ? <ChevronRight className="size-3 shrink-0 opacity-45" /> : null}
        </button>
    );
}

function MenuDivider() {
    const theme = canvasThemes[useActiveTheme()];
    return <div className="mx-2 my-1 h-px" style={{ background: `linear-gradient(90deg, transparent, ${theme.toolbar.border}, transparent)` }} />;
}

function getContextMenuPosition(menu: ContextMenuState, hasMultiSelection = false) {
    if (typeof window === "undefined") return { left: menu.x, top: menu.y };
    const width = 224;
    const estimatedHeight = menu.type === "node" ? Math.min(hasMultiSelection ? 290 : 360, window.innerHeight - 72) : menu.type === "canvas" ? (hasMultiSelection ? 350 : 250) : 84;
    return {
        left: clamp(menu.x, 12, Math.max(12, window.innerWidth - width - 12)),
        top: clamp(menu.y, 68, Math.max(68, window.innerHeight - estimatedHeight - 12)),
    };
}

function getSubmenuLeft(parentLeft: number) {
    if (typeof window === "undefined") return parentLeft + 192;
    return parentLeft + 224 + 8 + 360 <= window.innerWidth - 12 ? parentLeft + 232 : Math.max(12, parentLeft - 368);
}

function clamp(value: number, min: number, max: number) {
    return Math.min(Math.max(value, min), max);
}

function nodeTypeLabel(node: CanvasNodeData | null | undefined, t: InterfaceTranslate) {
    if (!node) return t("contextNode");
    if (node.type === CanvasNodeType.Image) return t("contextImageNode");
    if (node.type === CanvasNodeType.Text) return t("contextTextNode");
    if (node.type === CanvasNodeType.Script) return t("contextScriptNode");
    if (node.type === CanvasNodeType.Skill) return t("contextSkillNode");
    if (node.type === CanvasNodeType.Video) return t("contextVideoNode");
    if (node.type === CanvasNodeType.Audio) return t("contextAudioNode");
    if (node.type === CanvasNodeType.Drawing) return t("contextDrawingNode");
    if (node.type === CanvasNodeType.Frame) return t(isCanvasFolderNode(node) ? "contextFolder" : "contextFrame");
    return t("contextGenerationNode");
}
