import { App, Modal, Upload } from "antd";
import { CloudUpload, FileText, ShieldCheck } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import type { RegisteredPlugin } from "@/lib/plugins/plugin-types";
import { useInterfaceTranslation } from "@/stores/use-interface-locale-store";

import pluginDevelopmentGuideMarkdown from "./plugin-development-guide.md?raw";
import { getPluginDocumentation } from "./plugin-documentation";
import { PluginMarkdown } from "./plugin-markdown";
import "./plugins.css";

type UploadPluginModalProps = {
    open: boolean;
    onClose: () => void;
    onUpload: (file: File) => void | Promise<void>;
};

const MANIFEST_EXAMPLE = pluginDevelopmentGuideMarkdown.match(/```json\s*([\s\S]*?)```/)?.[1].trim();

export function UploadPluginModal({ open, onClose, onUpload }: UploadPluginModalProps) {
    const { t } = useInterfaceTranslation();
    const { message } = App.useApp();
    const [activeTab, setActiveTab] = useState<"install" | "guide">("install");
    const [isDraggingPlugin, setIsDraggingPlugin] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [copied, setCopied] = useState(false);
    const dragDepth = useRef(0);
    const uploadInFlight = useRef(false);
    const copyTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

    useEffect(() => {
        if (!open) {
            setActiveTab("install");
            setIsDraggingPlugin(false);
            setCopied(false);
            dragDepth.current = 0;
        }
        return () => clearTimeout(copyTimer.current);
    }, [open]);

    const handlePluginDragEnter = (event: React.DragEvent<HTMLDivElement>) => {
        event.preventDefault();
        dragDepth.current += 1;
        setIsDraggingPlugin(true);
    };

    const handlePluginDragLeave = (event: React.DragEvent<HTMLDivElement>) => {
        event.preventDefault();
        dragDepth.current -= 1;
        if (dragDepth.current <= 0) {
            dragDepth.current = 0;
            setIsDraggingPlugin(false);
        }
    };

    const handlePluginDrop = (event: React.DragEvent<HTMLDivElement>) => {
        event.preventDefault();
        dragDepth.current = 0;
        setIsDraggingPlugin(false);
    };

    const handleExecuteUpload = async (file: File) => {
        if (uploadInFlight.current) return;
        uploadInFlight.current = true;
        setUploading(true);
        try {
            await onUpload(file);
        } catch (error) {
            message.error(error instanceof Error ? error.message : "安装插件失败");
        } finally {
            uploadInFlight.current = false;
            setUploading(false);
        }
    };

    const copySnippet = async () => {
        try {
            if (!MANIFEST_EXAMPLE) throw new Error("开发规范中缺少清单示例");
            if (!navigator.clipboard) throw new Error("当前环境不支持剪贴板，请从开发规范中手动复制");
            await navigator.clipboard.writeText(MANIFEST_EXAMPLE);
            setCopied(true);
            clearTimeout(copyTimer.current);
            copyTimer.current = setTimeout(() => setCopied(false), 2000);
        } catch (error) {
            message.error(error instanceof Error ? error.message : t("settingsUi.copyManually"));
        }
    };

    const isCompact = activeTab === "install";

    return (
        <Modal
            className={`workspace-modal plugin-upload-modal ${isCompact ? "plugin-upload-modal-compact" : "workspace-modal-wide"}`}
            title={t("followupUi.uploadPlugin")}
            open={open}
            centered
            footer={null}
            destroyOnHidden
            closable={!uploading}
            mask={{ closable: !uploading }}
            onCancel={uploading ? undefined : onClose}
            styles={{ body: { maxHeight: "min(84vh, 900px)", overflowY: "auto", overscrollBehavior: "contain", padding: "16px 20px 24px" } }}
        >
            <div className="plugin-upload-tabs-bar">
                <div className="plugin-upload-tabs-nav">
                    <button type="button" className={`plugin-upload-tab-btn ${activeTab === "install" ? "is-active" : ""}`} aria-pressed={activeTab === "install"} onClick={() => setActiveTab("install")}>
                        <CloudUpload className="size-4" />
                        <span>{t("followupUi.installPluginPackage")}</span>
                    </button>
                    <button type="button" className={`plugin-upload-tab-btn ${activeTab === "guide" ? "is-active" : ""}`} aria-pressed={activeTab === "guide"} onClick={() => setActiveTab("guide")}>
                        <FileText className="size-4" />
                        <span>{t("followupUi.pluginGuide")}</span>
                    </button>
                </div>
                {activeTab === "guide" ? (
                    <button type="button" className="plugin-upload-copy-btn" onClick={() => void copySnippet()} title={t("followupUi.copyPluginManifest")}>
                        <span>{copied ? t("followupUi.manifestCopied") : t("followupUi.copyManifestExample")}</span>
                    </button>
                ) : (
                    <div className="plugin-upload-badge">
                        <ShieldCheck className="size-3.5 text-status-success" />
                        <span>{t("followupUi.sandboxIsolation")}</span>
                    </div>
                )}
            </div>

            {activeTab === "install" ? (
                <div className="plugin-upload-install-view">
                    <div className="plugin-upload-panel-heading">
                        <span className="plugin-upload-panel-icon">
                            <CloudUpload className="size-5" />
                        </span>
                        <div>
                            <h2>{t("followupUi.installPluginPackage")}</h2>
                            <p>{t("followupUi.pluginPackageHelp")}</p>
                        </div>
                    </div>

                    <div
                        className={`plugin-upload-dropzone-shell${isDraggingPlugin ? " is-dragging" : ""}${uploading ? " is-uploading" : ""}`}
                        onDragEnter={handlePluginDragEnter}
                        onDragLeave={handlePluginDragLeave}
                        onDragOver={(event) => event.preventDefault()}
                        onDrop={handlePluginDrop}
                    >
                        <Upload.Dragger
                            className="plugin-upload-dropzone"
                            accept=".yingce-plugin,.zip"
                            maxCount={1}
                            disabled={uploading}
                            showUploadList={false}
                            beforeUpload={(file) => {
                                void handleExecuteUpload(file);
                                return false;
                            }}
                        >
                            {uploading ? (
                                <div className="py-6 flex flex-col items-center justify-center gap-3">
                                    <div className="size-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                                    <p className="ant-upload-text">{t("followupUi.installingPlugin")}</p>
                                    <p className="ant-upload-hint">{t("followupUi.validatingManifest")}</p>
                                </div>
                            ) : (
                                <>
                                    <CloudUpload className="plugin-upload-dropzone-icon" />
                                    <p className="ant-upload-text">{isDraggingPlugin ? t("followupUi.dropPlugin") : t("followupUi.choosePluginFile")}</p>
                                    <p className="ant-upload-hint">{t("followupUi.pluginFileLimit")}</p>
                                </>
                            )}
                        </Upload.Dragger>
                    </div>

                    <div className="plugin-upload-notice">
                        <ShieldCheck className="size-4 shrink-0 text-status-success" />
                        <span>{t("followupUi.pluginTrustHelp")}</span>
                    </div>

                    <div className="plugin-upload-switch-guide-hint">
                        <span>{t("followupUi.firstPlugin")}</span>
                        <button type="button" onClick={() => setActiveTab("guide")} className="plugin-upload-link-btn">
                            {t("followupUi.openPluginGuide")}
                        </button>
                    </div>
                </div>
            ) : (
                <div className="plugin-upload-guide-view">
                    <div className="plugin-upload-guide-banner">
                        <ShieldCheck className="size-4 shrink-0 text-primary" />
                        <span>{t("followupUi.pluginGuideReadOnly")}</span>
                    </div>
                    <section className="plugin-upload-guide">
                        <PluginMarkdown source={pluginDevelopmentGuideMarkdown} />
                    </section>
                </div>
            )}
        </Modal>
    );
}

type PluginDetailsModalProps = {
    plugin?: RegisteredPlugin;
    restoreFocus: boolean;
    onClose: () => void;
};

export function PluginDetailsModal({ plugin, restoreFocus, onClose }: PluginDetailsModalProps) {
    const { t } = useInterfaceTranslation();
    return (
        <Modal
            className="workspace-modal workspace-modal-wide plugin-details-modal"
            title={
                plugin ? (
                    <div className="plugin-details-title">
                        <FileText className="size-4" />
                        <span>{plugin.manifest.name}</span>
                        <span className="plugin-version">v{plugin.manifest.version}</span>
                    </div>
                ) : null
            }
            open={Boolean(plugin)}
            centered
            footer={null}
            destroyOnHidden
            focusable={{ focusTriggerAfterClose: restoreFocus }}
            onCancel={onClose}
            styles={{ body: { maxHeight: "min(78vh, 820px)", overflowY: "auto", overscrollBehavior: "contain" } }}
        >
            {plugin ? <PluginMarkdown className="plugin-details-document" source={getPluginDocumentation(plugin.manifest, t)} /> : null}
        </Modal>
    );
}
