import { App, Button, Dropdown, Popover } from "antd";
import { CloudCheck, CloudOff, Download, FileClock, LoaderCircle, RefreshCw } from "lucide-react";
import { useState } from "react";
import { exportCanvasProjects } from "@/lib/canvas/canvas-export";
import { readAllCanvasSyncDrafts, readCanvasSyncDrafts, type CanvasSyncDraft } from "@/services/canvas-sync-drafts";
import { getActiveUserScope } from "@/lib/user-scope";
import { useCanvasStore } from "@/stores/canvas/use-canvas-store";
import { useSyncProgressStore } from "@/stores/use-sync-progress-store";
import { retryRemoteUserDataSync } from "@/services/user-data-sync";
import { useInterfaceTranslation } from "@/stores/use-interface-locale-store";
import "./canvas-sync-status.css";

export function CanvasSyncStatus({ projectId, onLoadLatest, onOpenVersions }: { projectId: string; onLoadLatest: () => Promise<void>; onOpenVersions?: () => void }) {
    const { message, modal } = App.useApp();
    const { t } = useInterfaceTranslation();
    const progress = useSyncProgressStore((state) => state.syncingProjects[projectId]);
    const [busy, setBusy] = useState(false);
    const [statusOpen, setStatusOpen] = useState(false);
    const phase = progress?.phase;
    const conflict = phase === "conflict";
    const error = phase === "error";
    const retryScheduled = error && progress?.message?.includes("自动重试");
    const saving = phase === "pending" || phase === "saving" || phase === "uploading";
    const reconciling = phase === "reconciling";
    const tone = conflict ? "conflict" : error ? "error" : saving || reconciling ? "pending" : phase === "done" ? "done" : "idle";
    const label = t(conflict ? "canvasSyncConflict" : error ? "canvasSyncError" : reconciling ? "canvasSyncReconciling" : saving ? "canvasSyncSaving" : phase === "done" ? "canvasSyncDone" : "canvasSyncIdle");
    const description = conflict
        ? t("canvasSyncConflictDescription")
        : error
          ? t("canvasSyncErrorDescription")
          : reconciling
            ? t("canvasSyncReconcilingDescription")
            : saving
              ? t("canvasSyncSavingDescription")
              : phase === "done"
                ? t("canvasSyncDoneDescription")
                : t("canvasSyncIdleDescription");

    const run = async (operation: () => Promise<unknown>) => {
        setBusy(true);
        try {
            await operation();
        } catch (cause) {
            message.error(cause instanceof Error ? cause.message : t("canvasSyncOperationFailed"));
            throw cause;
        } finally {
            setBusy(false);
        }
    };

    const confirmLoadLatest = () => {
        modal.confirm({
            title: t("canvasSyncLoadTitle"),
            icon: <CloudOff className="canvas-sync-modal-icon" aria-hidden="true" />,
            content: (
                <div className="canvas-sync-confirm-copy">
                    <p>{t("canvasSyncReplaceWarning")}</p>
                    <p>{t("canvasSyncKeepDraftWarning")}</p>
                </div>
            ),
            okText: t("canvasSyncKeepAndLoad"),
            cancelText: t("canvasSyncKeepEditing"),
            okButtonProps: { danger: true },
            onOk: () =>
                run(async () => {
                    await onLoadLatest();
                    setStatusOpen(false);
                    message.success(t("canvasSyncLoaded"));
                }),
        });
    };

    return (
        <Popover
            trigger="click"
            placement="bottom"
            open={statusOpen}
            onOpenChange={setStatusOpen}
            arrow={false}
            classNames={{ root: "canvas-sync-popover", container: "canvas-sync-popover-surface", content: "canvas-sync-popover-content" }}
            content={
                <div className={`canvas-sync-panel canvas-sync-panel--${tone}`} data-canvas-no-zoom>
                    <div className="canvas-sync-panel__header">
                        <span className="canvas-sync-panel__status-icon" aria-hidden="true">
                            {saving ? <LoaderCircle className="animate-spin motion-reduce:animate-none" /> : conflict || error ? <CloudOff /> : <CloudCheck />}
                        </span>
                        <div className="canvas-sync-panel__heading">
                            <span className="canvas-sync-panel__eyebrow">{t("canvasSyncHeading")}</span>
                            <strong>{label}</strong>
                        </div>
                    </div>
                    <p className="canvas-sync-panel__description" role="status">
                        {description}
                    </p>
                    {progress?.message && progress.message !== description && (
                        <p className="canvas-sync-panel__description">
                            {t("canvasSyncOriginalDetail")}：{progress.message}
                        </p>
                    )}
                    {conflict ? (
                        <div className="canvas-sync-panel__callout">
                            <strong>{t("canvasSyncProtectLocal")}</strong>
                            <span>
                                {progress?.draftCount ? t("canvasSyncDraftCount", { count: progress.draftCount }) : t("canvasSyncDraftBeforeLoad")} {t("canvasSyncNotMerge")}
                            </span>
                        </div>
                    ) : error ? (
                        <div className="canvas-sync-panel__callout">
                            <strong>{t(retryScheduled ? "canvasSyncWaitingRetry" : "canvasSyncNotOverwritten")}</strong>
                            <span>{retryScheduled ? t("canvasSyncAutoRetryHint") : t("canvasSyncRetryHint")}</span>
                        </div>
                    ) : null}
                    <div className="canvas-sync-panel__actions">
                        {error ? (
                            <Button
                                type="primary"
                                block
                                icon={<RefreshCw className="size-3.5" />}
                                loading={busy}
                                onClick={() =>
                                    void run(() => retryRemoteUserDataSync(projectId))
                                        .then(() => setStatusOpen(false))
                                        .catch(() => undefined)
                                }
                            >
                                {t("canvasSyncRetry")}
                            </Button>
                        ) : null}
                        <Button block icon={<CloudOff className="size-3.5" />} disabled={busy || saving} onClick={confirmLoadLatest}>
                            {t("canvasSyncLoad")}
                        </Button>
                        <div className="canvas-sync-panel__secondary-actions">
                            <Button
                                type="text"
                                size="small"
                                disabled={busy}
                                icon={<Download className="size-3.5" />}
                                onClick={() =>
                                    void run(async () => {
                                        const project = useCanvasStore.getState().openProject(projectId);
                                        if (!project) throw new Error(t("canvasLibraryMissing"));
                                        await exportCanvasProjects([project], t("followupUi.localDraft", { name: project.title }));
                                        message.success(t("canvasSyncDownloaded"));
                                    }).catch(() => undefined)
                                }
                            >
                                {t("canvasSyncDownload")}
                            </Button>
                            {onOpenVersions ? (
                                <Button
                                    type="text"
                                    size="small"
                                    disabled={busy}
                                    icon={<FileClock className="size-3.5" />}
                                    onClick={() => {
                                        setStatusOpen(false);
                                        onOpenVersions();
                                    }}
                                >
                                    {t("canvasSyncVersions")}
                                    {progress?.draftCount ? t("canvasSyncVersionDrafts", { count: progress.draftCount }) : ""}
                                </Button>
                            ) : null}
                        </div>
                    </div>
                </div>
            }
        >
            <Button
                type="text"
                size="small"
                className={`canvas-sync-status-trigger canvas-sync-status-trigger--${tone}`}
                aria-label={t("canvasSyncAccessibleStatus", { status: label })}
                aria-expanded={statusOpen}
                icon={saving ? <LoaderCircle className="size-3.5 animate-spin motion-reduce:animate-none" /> : conflict || error ? <CloudOff className="size-3.5" /> : <CloudCheck className="size-3.5" />}
            >
                <span className="canvas-sync-status-label text-xs">{label}</span>
            </Button>
        </Popover>
    );
}

export function CanvasSyncDraftMenu({ projectId }: { projectId?: string }) {
    const { message } = App.useApp();
    const { locale, t } = useInterfaceTranslation();
    const [drafts, setDrafts] = useState<CanvasSyncDraft[]>([]);
    const [draftScope, setDraftScope] = useState("");
    const [loading, setLoading] = useState(false);
    const [exporting, setExporting] = useState(false);
    return (
        <Dropdown
            trigger={["click"]}
            onOpenChange={(open) => {
                if (!open) return;
                const scope = getActiveUserScope();
                setDraftScope(scope);
                setDrafts([]);
                setLoading(true);
                void (projectId ? readCanvasSyncDrafts(projectId, scope) : readAllCanvasSyncDrafts(scope))
                    .then((items) => {
                        if (getActiveUserScope() === scope) setDrafts(items.reverse());
                    })
                    .catch(() => message.error(t("canvasDraftsReadFailed")))
                    .finally(() => setLoading(false));
            }}
            menu={{
                items: drafts.length
                    ? drafts.map((draft) => ({
                          key: draft.id,
                          label: `${draft.project.title} · ${new Date(draft.savedAt).toLocaleString(locale)}`,
                          onClick: () => {
                              if (getActiveUserScope() !== draftScope) {
                                  setDrafts([]);
                                  message.error(t("canvasDraftsAccountChanged"));
                                  return;
                              }
                              setExporting(true);
                              void exportCanvasProjects([draft.project], t("followupUi.localDraft", { name: draft.project.title }), { includeLocalDrawings: false })
                                  .then(() => message.success(t("canvasDraftsDownloaded")))
                                  .catch(() => message.error(t("canvasDraftsDownloadFailed")))
                                  .finally(() => setExporting(false));
                          },
                      }))
                    : [{ key: "empty", label: t(loading ? "canvasDraftsLoading" : "canvasDraftsEmpty"), disabled: true }],
            }}
        >
            <Button size={projectId ? "small" : "middle"} loading={exporting}>
                {t("canvasDrafts")}
            </Button>
        </Dropdown>
    );
}
