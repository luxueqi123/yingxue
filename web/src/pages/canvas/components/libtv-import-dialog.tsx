import { App, Button, Input, Modal, Tag, Segmented } from "antd";
import { CircleAlert, ExternalLink, Import, LoaderCircle, FileJson } from "lucide-react";
import { useMemo, useRef, useState } from "react";

import { buildLibTVImagePreviewUrl, buildLibTVVideoPreviewUrl, buildLibTVVideoSourceUrl, formatLibTVBatchTime, parseLibTVProjectUUID, assertLibTVImportFitsCanvas, buildLibTVCanvasNodes, getLibTVImportReport, readLibTVJSONFile } from "@/lib/canvas/libtv-import";
import { importLibTVCanvas, type LibTVImportResult, importLibTVCanvasJSON } from "@/services/api/libtv";
import { CanvasNodeType, type CanvasConnection, type CanvasNodeData, type ViewportTransform } from "@/types/canvas";
import { type CanvasImportSaveStatus } from "../canvas-import-save";
import { useCanvasStore } from "@/stores/canvas/use-canvas-store";
import { useInterfaceTranslation } from "@/stores/use-interface-locale-store";

type Props = {
    open: boolean;
    projectId: string;
    viewport: ViewportTransform;
    viewportSize: { width: number; height: number };
    onClose: () => void;
    onApply: (nodes: CanvasNodeData[], connections: CanvasConnection[]) => Promise<CanvasImportSaveStatus>;
};

export function LibTVImportDialog({ open, projectId, viewport, viewportSize, onClose, onApply }: Props) {
    const { t } = useInterfaceTranslation();
    const { message } = App.useApp();
    const [value, setValue] = useState("");
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState<LibTVImportResult | null>(null);
    const [saveStarted, setSaveStarted] = useState(false);
    const applyingRef = useRef(false);
    const [sourceMode, setSourceMode] = useState<"online" | "file">("online");
    const [localFile, setLocalFile] = useState<{ name: string; source: string } | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const uuid = useMemo(() => parseLibTVProjectUUID(value), [value]);
    const report = useMemo(() => (result ? getLibTVImportReport(result, t) : []), [result, t]);

    const reset = () => {
        setValue("");
        setResult(null);
        setSaveStarted(false);
        setLocalFile(null);
        if (fileInputRef.current) fileInputRef.current.value = "";
    };

    const close = () => {
        if (loading) return;
        reset();
        onClose();
    };

    const changeValue = (nextValue: string) => {
        setValue(nextValue);
        setResult(null);
        setSaveStarted(false);
    };

    const chooseFile = async (file?: File) => {
        if (!file) return;
        setLoading(true);
        setResult(null);
        setLocalFile(null);
        try {
            setLocalFile({ name: file.name, source: await readLibTVJSONFile(file, t) });
        } catch (error) {
            message.error(error instanceof Error ? error.message : t("canvasImportFileReadFailed"));
        } finally {
            setLoading(false);
            if (fileInputRef.current) fileInputRef.current.value = "";
        }
    };

    const load = async () => {
        if (sourceMode === "online" && !uuid) {
            message.error(t("canvasImportLibRequired"));
            return;
        }
        if (sourceMode === "file" && !localFile) {
            message.error(t("canvasImportFileRequired"));
            return;
        }
        setLoading(true);
        try {
            setResult(sourceMode === "file" && localFile ? await importLibTVCanvasJSON(projectId, localFile.source) : await importLibTVCanvas(projectId, uuid));
        } catch (error) {
            message.error(error instanceof Error ? error.message : t("canvasImportReadFailed", { source: "LibTV" }));
        } finally {
            setLoading(false);
        }
    };

    const apply = async () => {
        if (!result || applyingRef.current) return;
        applyingRef.current = true;
        setSaveStarted(true);
        setLoading(true);
        try {
            const project = useCanvasStore.getState().projects.find((item) => item.id === projectId);
            if (!project) throw new Error(t("canvasImportProjectMissing"));
            const nodes = buildLibTVCanvasNodes(result, viewport, viewportSize, t);
            assertLibTVImportFitsCanvas(project, nodes, result.connections, t);
            const status = await onApply(nodes, result.connections);
            reset();
            onClose();
            const summary = `${result.importedNodeCount} 个节点和 ${result.importedConnectionCount} 条连接`;
            if (status === "pending") message.warning(`已在本机保存 ${summary}，正在后台同步`);
            else message.success(`已导入 ${summary}并保存到云端`);
        } catch (error) {
            message.error(error instanceof Error ? error.message : t("canvasImportSaveFailed"));
        } finally {
            applyingRef.current = false;
            setLoading(false);
        }
    };

    return (
        <Modal
            className="workspace-modal"
            open={open}
            onCancel={close}
            title={t("canvasImportTitle", { source: "LibTV" })}
            width={620}
            footer={
                result ? (
                    [
                        <Button key="close" onClick={close}>
                            {t("canvasImportClose")}
                        </Button>,
                        <Button key="apply" type="primary" icon={<Import className="size-4" />} loading={loading} onClick={() => void apply()}>
                            {saveStarted ? "重试保存" : "确认导入"}
                        </Button>,
                    ]
                ) : (
                    <Button type="primary" loading={loading} onClick={() => void load()}>
                        {t("canvasImportRead")}
                    </Button>
                )
            }
        >
            <div className="space-y-4">
                <Segmented
                    block
                    value={sourceMode}
                    disabled={loading}
                    options={[
                        { value: "online", label: t("canvasImportOnline") },
                        { value: "file", label: t("canvasImportFile") },
                    ]}
                    onChange={(mode) => {
                        setSourceMode(mode as "online" | "file");
                        reset();
                    }}
                />
                {sourceMode === "online" ? (
                    <div>
                        <label className="mb-2 block text-sm font-medium">{t("canvasImportLibLabel")}</label>
                        <Input
                            aria-label={t("canvasImportLibLabel")}
                            value={value}
                            onChange={(event) => changeValue(event.target.value)}
                            placeholder={t("canvasImportLibPlaceholder")}
                            disabled={loading}
                            suffix={uuid && value !== uuid ? <ExternalLink className="size-4 text-foreground/35" /> : null}
                        />
                    </div>
                ) : (
                    <div className="space-y-2">
                        <input ref={fileInputRef} type="file" accept=".json,application/json" className="hidden" disabled={loading} onChange={(event) => void chooseFile(event.target.files?.[0])} />
                        <Button icon={<FileJson className="size-4" />} disabled={loading} onClick={() => fileInputRef.current?.click()}>
                            {t("canvasImportChooseFile")}
                        </Button>
                        {localFile ? <div className="break-all text-sm">{localFile.name}</div> : null}
                        <p className="text-xs leading-5 text-foreground/55">{t("canvasImportFileHint")}</p>
                    </div>
                )}
                {loading && !result ? (
                    <div className="flex items-center gap-2 text-sm text-foreground/55">
                        <LoaderCircle className="size-4 animate-spin" />
                        {t("canvasImportReading", { source: "LibTV" })}
                    </div>
                ) : null}
                {result ? (
                    <div className="space-y-3">
                        <div className="rounded-xl p-4" style={{ background: "var(--library-surface)" }}>
                            <div className="flex flex-wrap items-start justify-between gap-3">
                                <div>
                                    <div className="text-sm font-semibold">{result.projectName || t("canvasImportCanvas", { source: "LibTV" })}</div>
                                    <div className="mt-1 text-sm text-foreground/60">{t("canvasImportCounts", { nodes: result.importedNodeCount, connections: result.importedConnectionCount })}</div>
                                </div>
                                <Tag color="blue">{t("canvasImportBatch", { time: formatLibTVBatchTime(result.batchCreatedAt, t) })}</Tag>
                            </div>
                            <div className="mt-3 text-xs leading-5 text-foreground/50">{t("canvasImportPlacement")}</div>
                        </div>
                        <div className="text-xs leading-5 text-foreground/60">{t("canvasImportMediaWarning")}</div>
                        {result.sourceSnapshot ? <div className="text-xs leading-5 text-foreground/60">{t("canvasImportSnapshotWarning")}</div> : null}
                        {result.skippedNodes.length || result.skippedConnections.length || result.multiResultNodeCount || result.staleNodeCount || result.reusedFailedNodeCount || result.placeholderNodeCount || result.convertedSpecialCount ? (
                            <div className="flex items-start gap-2 rounded-lg px-3 py-2.5 text-xs leading-5 text-foreground/60" style={{ background: "var(--surface-hover)" }}>
                                <CircleAlert className="mt-0.5 size-4 shrink-0" />
                                <div>
                                    {result.skippedNodes.length ? <div>{t("canvasImportSkippedNodes", { count: result.skippedNodes.length })}</div> : null}
                                    {result.skippedConnections.length ? <div>{t("canvasImportSkippedConnections", { count: result.skippedConnections.length })}</div> : null}
                                    {result.reusedFailedNodeCount ? <div>{t("canvasImportReused", { count: result.reusedFailedNodeCount })}</div> : null}
                                    {result.placeholderNodeCount ? <div>{t("canvasImportPlaceholders", { count: result.placeholderNodeCount })}</div> : null}
                                    {result.convertedSpecialCount ? <div>{t("canvasImportSpecial", { count: result.convertedSpecialCount })}</div> : null}
                                    {result.multiResultNodeCount ? <div>{t("canvasImportMulti", { count: result.multiResultNodeCount })}</div> : null}
                                    {result.staleNodeCount ? <div>{t("canvasImportStale", { count: result.staleNodeCount })}</div> : null}
                                </div>
                            </div>
                        ) : null}
                        {report.length ? (
                            <div className="max-h-60 space-y-2 overflow-y-auto rounded-lg p-3 text-xs leading-5" style={{ background: "var(--surface-hover)" }} aria-label={t("canvasImportDetails")}>
                                {report.map((item) => (
                                    <div key={item.key} className="break-words">
                                        <div className="font-medium">{item.label}</div>
                                        <div className="text-foreground/60">{item.message}</div>
                                    </div>
                                ))}
                            </div>
                        ) : null}
                        <div className="flex flex-wrap gap-2">
                            <Tag>{saveStarted ? "保存未完成，导入内容仍保留" : "等待确认导入"}</Tag>
                        </div>
                    </div>
                ) : null}
            </div>
        </Modal>
    );
}
