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
import { CanvasNodeType, type CanvasFrameColor, type CanvasNodeData, type CanvasNodeTypeId, type CanvasWorkspaceMode, type ContextMenuState, type Position } from "@/types/canvas";
import "./canvas-context-menu.css";

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
    onSetFrameColor: (color?: CanvasFrameColor) => void;
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
    onSetFrameColor,
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
    const [frameColorOpen, setFrameColorOpen] = useState(false);

    useEffect(() => {
        const close = (event: PointerEvent) => {
            const target = event.target;
            if (target instanceof Element && target.closest(".ant-popover")) return;
            onClose();
        };
        const closeOnEscape = (event: KeyboardEvent) => {
            if (event.key !== "Escape") return;
            if (categoryOpen || frameColorOpen) {
                setCategoryOpen(false);
                setFrameColorOpen(false);
            } else onClose();
        };
        window.addEventListener("pointerdown", close);
        window.addEventListener("keydown", closeOnEscape);
        return () => {
            window.removeEventListener("pointerdown", close);
            window.removeEventListener("keydown", closeOnEscape);
        };
    }, [categoryOpen, frameColorOpen, onClose]);

    useEffect(() => {
        setAddOpen(menu.type === "canvas" && Boolean(menu.createOpen));
        setCategoryOpen(false);
        setFrameColorOpen(false);
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
    const position = getContextMenuPosition(menu);
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
                className="canvas-context-panel aceternity-floating-panel fixed z-[var(--z-popover)] flex w-[224px] origin-top-left flex-col overflow-hidden rounded-[var(--r-lg)] border p-2 backdrop-blur-2xl backdrop-saturate-150"
                style={
                    {
                        left: position.left,
                        "--canvas-context-anchor-y": `${position.top}px`,
                        background: theme.spatial.elevated,
                        borderColor: theme.toolbar.border,
                        color: theme.node.text,
                        "--menu-hover": theme.toolbar.itemHover,
                        "--tw-ring-color": theme.node.muted,
                    } as CSSProperties
                }
                onContextMenu={(event) => event.preventDefault()}
                onPointerDown={(event) => event.stopPropagation()}
            >
                <div className="thin-scrollbar flex min-h-0 flex-col gap-1.5 overflow-y-auto overscroll-contain [&>*]:shrink-0">
                    {onCreateDramaFromStoryboard ? <MenuButton icon={<Clapperboard />} label="交给短剧自动制作" detail="按分镜原样转录，生成参考图与视频" onClick={() => runAction(onCreateDramaFromStoryboard)} /> : null}
                    {menu.type === "node" && isFrame && frameColorOpen ? (
                        <>
                            <MenuHeader title="设置背板颜色" description={node?.title} onBack={() => setFrameColorOpen(false)} />
                            <MenuSection label="颜色" />
                            <div className="grid grid-cols-4 gap-2 px-2 pb-2">
                                {FRAME_COLOR_OPTIONS.map((option) => (
                                    <button
                                        key={option.value}
                                        type="button"
                                        className="grid size-8 place-items-center rounded-full border transition-transform hover:scale-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
                                        style={{ background: option.swatch, borderColor: theme.toolbar.border, color: "white", outlineColor: theme.frame.activeStroke }}
                                        aria-label={option.label}
                                        title={option.label}
                                        onClick={() => runAction(() => onSetFrameColor(option.value))}
                                    >
                                        {node?.metadata?.frame?.color === option.value ? <Check className="size-4" /> : null}
                                    </button>
                                ))}
                            </div>
                            <MenuButton icon={<PanelTop />} label="恢复默认颜色" onClick={() => runAction(() => onSetFrameColor(undefined))} />
                        </>
                    ) : menu.type === "node" && isMedia && categoryOpen ? (
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
                            <MenuButton icon={<Plus className="size-4" />} label={t("createAddNodes")} expanded={addOpen} onClick={() => setAddOpen((value) => !value)} />
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
                                    {isFrame ? (
                                        <>
                                            <MenuButton
                                                icon={isFolder ? <FolderOpen /> : <PanelTop />}
                                                label={node?.metadata?.frame?.collapsed ? `展开${isFolder ? "文件夹" : "背板"}` : `折叠${isFolder ? "文件夹" : "背板"}`}
                                                onClick={() => runAction(onToggleFrame)}
                                            />
                                            {!isFolder ? <MenuButton icon={<PanelTop />} label="设置背板颜色" chevron onClick={() => setFrameColorOpen(true)} /> : null}
                                        </>
                                    ) : (
                                        <MenuButton icon={<FolderPlus />} label="保存到我的素材" disabled={!canSaveAsset} onClick={() => runAction(onSaveAsset)} />
                                    )}
                                    {isText ? <MenuButton icon={<Maximize2 />} label="放大编辑" onClick={() => runAction(onEditText)} /> : null}
                                    {isDrawing ? <MenuButton icon={<Pencil />} label="打开绘图" onClick={() => runAction(onOpenDrawing)} /> : null}
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
            className="canvas-context-panel aceternity-floating-panel fixed z-[var(--z-popover)] flex w-[360px] max-w-[calc(100vw-24px)] origin-top flex-col overflow-hidden rounded-[var(--r-lg)] border p-2 backdrop-blur-2xl backdrop-saturate-150"
            contentClassName="thin-scrollbar relative z-[1] min-h-0 overflow-y-auto overscroll-contain"
            style={{ left, "--canvas-context-anchor-y": `${parentPosition.top}px`, background: theme.spatial.elevated, borderColor: theme.toolbar.border, color: theme.node.text } as CSSProperties}
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

const FRAME_COLOR_OPTIONS: Array<{ value: CanvasFrameColor; label: string; swatch: string }> = [
    { value: "blue", label: "蓝色", swatch: "#5b8def" },
    { value: "green", label: "绿色", swatch: "#56a978" },
    { value: "violet", label: "紫色", swatch: "#9b68d0" },
    { value: "amber", label: "琥珀色", swatch: "#d99a36" },
    { value: "rose", label: "玫瑰色", swatch: "#d96976" },
    { value: "teal", label: "青色", swatch: "#42a6a0" },
    { value: "slate", label: "灰色", swatch: "#7c8492" },
];

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
    expanded,
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
    expanded?: boolean;
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
            className={`canvas-menu-item group flex w-full items-center gap-2.5 rounded-[var(--r-md)] px-2.5 text-left outline-none enabled:hover:bg-[var(--menu-item-hover)] focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-40 ${detail ? "min-h-11 py-1.5" : "h-9"}`}
            style={{ color, background: active ? theme.toolbar.activeBg : undefined, "--menu-item-hover": danger ? `${theme.accent.danger}1a` : "var(--menu-hover)" } as CSSProperties}
            disabled={disabled}
            aria-expanded={expanded}
            onClick={onClick}
        >
            <span className={`canvas-menu-item-icon grid size-4 shrink-0 place-items-center [&_svg]:size-4 [&_svg]:stroke-[1.75] ${detail ? "self-start mt-0.5" : ""} ${danger || active ? "" : "opacity-60 group-hover:opacity-100"}`}>{icon}</span>
            <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5 font-medium leading-5" style={{ fontSize: "var(--fs-ui)" }}>
                    <span className="truncate">{label}</span>
                    {badge ? (
                        <span className="rounded-[var(--r-xs)] px-1 font-medium leading-4 tabular-nums" style={{ background: "var(--menu-hover)", color: theme.node.muted, fontSize: "var(--fs-label)" }}>
                            {badge}
                        </span>
                    ) : null}
                </span>
                {detail ? (
                    <span className="block truncate leading-4" style={{ color: theme.node.muted, fontSize: "var(--fs-label)" }}>
                        {detail}
                    </span>
                ) : null}
            </span>
            {shortcut ? (
                <kbd className="shrink-0 font-sans tracking-[.04em] tabular-nums" style={{ color: theme.node.faint, fontSize: "var(--fs-label)" }}>
                    {shortcut}
                </kbd>
            ) : null}
            {chevron || expanded !== undefined ? (
                <span aria-hidden className="grid size-5 shrink-0 place-items-center rounded-[var(--r-sm)]" style={{ color: expanded ? theme.node.text : theme.node.faint, background: expanded ? theme.toolbar.activeBg : undefined }}>
                    <ChevronRight className="size-3.5" />
                </span>
            ) : null}
        </button>
    );
}

function MenuDivider() {
    const theme = canvasThemes[useActiveTheme()];
    return <div role="separator" className="mx-2 my-1 h-px" style={{ background: theme.toolbar.border, opacity: 0.7 }} />;
}

function getContextMenuPosition(menu: ContextMenuState) {
    if (typeof window === "undefined") return { left: menu.x, top: menu.y };
    const width = 224;
    return {
        left: clamp(menu.x, 12, Math.max(12, window.innerWidth - width - 12)),
        top: menu.y,
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
