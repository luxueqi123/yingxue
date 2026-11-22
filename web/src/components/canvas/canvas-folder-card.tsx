import { App, Dropdown, Input } from "antd";
import { Download, Layers3, LoaderCircle, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import type { KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";

import { ProjectPreview } from "@/components/canvas/canvas-project-card";
import { exportCanvasProjects } from "@/lib/canvas/canvas-export";
import { useCanvasStore } from "@/stores/canvas/use-canvas-store";
import type { CanvasLibrarySummary } from "@/services/api/user-data";
import { loadCanvasProjectForEditing, saveRemoteUserDataNow } from "@/services/user-data-sync";
import { useCanvasUiStore } from "@/stores/canvas/use-canvas-ui-store";
import { cn } from "@/lib/utils";
import { useInterfaceTranslation } from "@/stores/use-interface-locale-store";
import { translateInterface, type InterfaceLocale } from "@/lib/interface-locale";

type CanvasFolderCardProps = {
    project: CanvasLibrarySummary;
    projectName?: string;
    onClick: () => void;
    onPrefetch?: () => void;
    opening?: boolean;
};

/** 画布库中的文件夹封面：单一卡片表面承载预览和信息，避免相邻卡片互相侵入。 */
export function CanvasFolderCard({ project, projectName, onClick, onPrefetch, opening = false }: CanvasFolderCardProps) {
    const { message } = App.useApp();
    const { locale, t } = useInterfaceTranslation();
    const renameProject = useCanvasStore((state) => state.renameProject);
    const selectedIds = useCanvasUiStore((state) => state.selectedProjectIds);
    const editingId = useCanvasUiStore((state) => state.editingProjectId);
    const editingTitle = useCanvasUiStore((state) => state.editingProjectTitle);
    const startEditing = useCanvasUiStore((state) => state.startEditingProject);
    const setEditingTitle = useCanvasUiStore((state) => state.setEditingProjectTitle);
    const stopEditing = useCanvasUiStore((state) => state.stopEditingProject);
    const toggleSelected = useCanvasUiStore((state) => state.toggleSelectedProjectId);
    const setDeleteIds = useCanvasUiStore((state) => state.setDeleteProjectIds);
    const editing = editingId === project.id;
    const selected = selectedIds.includes(project.id);

    const saveTitle = async () => {
        if (!editing) return;
        stopEditing();
        try {
            const fullProject = await loadCanvasProjectForEditing(project.id);
            if (!fullProject) throw new Error(t("canvasB.folderCard.notFound"));
            renameProject(project.id, editingTitle);
            await saveRemoteUserDataNow(project.id);
        } catch (error) { message.error(error instanceof Error ? error.message : t("canvasLibraryRenameFailed")); }
    };
    const exportProject = async () => {
        try {
            const fullProject = await loadCanvasProjectForEditing(project.id);
            if (!fullProject) throw new Error(t("canvasB.folderCard.notFound"));
            await exportCanvasProjects([fullProject], project.title || t("canvasB.common.canvas"));
        } catch (error) { message.error(error instanceof Error ? error.message : t("canvasB.common.exportFailed")); }
    };

    const handleOpenKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
        if (event.target !== event.currentTarget) return;
        if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            if (!editing && !opening) onClick();
        }
    };

    return (
        <article className={cn("product-collection-card canvas-collection-card", selected && "is-selected", editing && "is-editing", opening && "is-opening")} onPointerEnter={onPrefetch} onPointerDown={onPrefetch} onFocusCapture={onPrefetch}>
            <div className="canvas-collection-open" role="button" tabIndex={0} aria-label={t("canvasB.folderCard.openCanvas", { title: project.title })} aria-busy={opening} onClick={() => !editing && !opening && onClick()} onKeyDown={handleOpenKeyDown}>
                <div className="canvas-collection-preview">
                    <div className="canvas-collection-preview-media" aria-hidden="true">
                        <ProjectPreview project={{ id: project.id, nodes: project.previewNodes }} preferLatestImage quiet mosaic />
                    </div>
                    <span className="canvas-collection-badge" title={t("canvasB.folderCard.nodeCount", { count: project.nodeCount })}>
                        <Layers3 aria-hidden="true" />
                        <span>{project.nodeCount}</span>
                        <span className="sr-only">{t("canvasB.folderCard.nodesSuffix")}</span>
                    </span>
                    {opening ? <div className="canvas-collection-opening"><LoaderCircle className="size-5 animate-spin" aria-hidden="true" /><span>{t("canvasLibraryOpening")}</span></div> : null}
                </div>
                <div className="canvas-collection-body">
                    <div className="canvas-collection-heading-row">
                        {editing ? (
                            <Input
                                className="canvas-collection-title-input"
                                aria-label={t("canvasLibraryRenameNamed", { name: project.title })}
                                value={editingTitle}
                                onChange={(event) => setEditingTitle(event.target.value)}
                                onClick={(event) => event.stopPropagation()}
                                onBlur={saveTitle}
                                onKeyDown={(event) => {
                                    if (event.key === "Enter") saveTitle();
                                    if (event.key === "Escape") stopEditing();
                                }}
                                autoFocus
                            />
                        ) : (
                            <span className="canvas-collection-title">{project.title}</span>
                        )}
                    </div>
                    <div className="canvas-collection-meta">
                        <span className="canvas-collection-meta-item">{projectName ? t("canvasLibraryProject", { name: projectName }) : t("canvasLibraryIndependent")}</span>
                        <span className="canvas-collection-meta-separator" aria-hidden="true">·</span>
                        <span className="canvas-collection-meta-item">{t("canvasLibraryNodes", { count: project.nodeCount })}</span>
                    </div>
                    <time className="canvas-collection-updated" dateTime={project.updatedAt} title={t("canvasLibraryCreated", { date: formatCanvasDate(project.createdAt, locale) })}>{t("canvasLibraryUpdated", { date: formatCanvasDate(project.updatedAt, locale) })}</time>
                </div>
            </div>

            <span className={cn("canvas-collection-select", selected && "is-visible")} onClick={(event) => event.stopPropagation()}>
                <input
                    type="checkbox"
                    checked={selected}
                    onChange={(event) => toggleSelected(project.id, event.target.checked)}
                    aria-label={t("canvasB.folderCard.selectTitle", { title: project.title })}
                />
            </span>

            {!editing ? (
                <button
                    type="button"
                    className="product-icon-button canvas-collection-rename"
                    aria-label={t("canvasLibraryRenameNamed", { name: project.title })}
                    title={t("canvasLibraryRename")}
                    onClick={(event) => {
                        event.stopPropagation();
                        startEditing(project.id, project.title);
                    }}
                >
                    <Pencil />
                </button>
            ) : null}

            <div className="canvas-collection-actions" onClick={(event) => event.stopPropagation()}>
                <Dropdown
                    trigger={["click"]}
                    placement="bottomRight"
                    menu={{
                        onClick: ({ domEvent }) => domEvent.stopPropagation(),
                        items: [
                            { key: "export", icon: <Download className="size-3.5" />, label: t("canvasLibraryExportCard"), onClick: () => void exportProject() },
                            { type: "divider" },
                            { key: "delete", danger: true, icon: <Trash2 className="size-3.5" />, label: t("common.delete"), onClick: () => setDeleteIds([project.id]) },
                        ],
                    }}
                >
                    <button type="button" className="product-icon-button canvas-collection-more" aria-label={t("canvasB.folderCard.canvasActions", { title: project.title })} title={t("canvasB.common.moreActions")} onClick={(event) => event.stopPropagation()}>
                        <MoreHorizontal />
                    </button>
                </Dropdown>
            </div>
        </article>
    );
}

function formatCanvasDate(value: string, locale: InterfaceLocale) {
    const timestamp = Date.parse(value);
    return Number.isFinite(timestamp)
        ? new Date(timestamp).toLocaleString(locale, {
              year: "numeric",
              month: "2-digit",
              day: "2-digit",
              hour: "2-digit",
              minute: "2-digit",
          })
        : translateInterface(locale, "canvasLibraryTimeUnavailable");
}
