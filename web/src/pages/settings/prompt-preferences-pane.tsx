import { useInterfaceTranslation } from "@/stores/use-interface-locale-store";
import { App, Button, Input, Skeleton, Tabs } from "antd";
import { Select } from "@/components/ui/base/select";
import { SegmentedControl } from "@/components/ui/base/segmented-control";
import { StatusBadge } from "@/components/ui/base/badges";
import { Callout } from "@/components/ui/product/callout";
import { EmptyState } from "@/components/ui/product/empty-state";
import { RotateCcw, Save, ShieldCheck, Undo2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { PromptCodeEditor } from "@/components/prompt/prompt-code-editor";
import {
    listUserPromptPreferences,
    resetUserPromptCustomization,
    updateUserPromptCustomization,
    type UserPromptCustomization,
    type UserPromptPreference,
} from "@/services/api/auth";

type CustomizationMode = UserPromptCustomization["mode"];


export function PromptPreferencesPane() {
    const { t } = useInterfaceTranslation();
    const modeOptions = [{ label: t("settingsUi.inheritPlatform"), value: "inherit" }, { label: t("settingsUi.appendRequirements"), value: "append" }, { label: t("settingsUi.advancedRewrite"), value: "rewrite" }];
    const { message, modal } = App.useApp();
    const [preferences, setPreferences] = useState<UserPromptPreference[]>([]);
    const [selectedOperation, setSelectedOperation] = useState("");
    const [mode, setMode] = useState<CustomizationMode>("inherit");
    const [appendContent, setAppendContent] = useState("");
    const [rewriteContent, setRewriteContent] = useState("");
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [loadError, setLoadError] = useState("");
    const requestIdRef = useRef(0);

    const reload = async (preferredOperation?: string) => {
        const reqId = ++requestIdRef.current;
        setLoading(true);
        setLoadError("");
        try {
            const result = await listUserPromptPreferences();
            if (reqId !== requestIdRef.current) return;
            setPreferences(result.preferences);
            setSelectedOperation((current) => preferredOperation || current || result.preferences[0]?.definition.operation || "");
        } catch (error) {
            if (reqId !== requestIdRef.current) return;
            const msg = error instanceof Error ? error.message : t("settingsUi.promptReadFailed");
            setLoadError(msg);
            message.error(msg);
        } finally {
            if (reqId === requestIdRef.current) {
                setLoading(false);
            }
        }
    };

    useEffect(() => { void reload(); }, []);

    const selected = useMemo(() => preferences.find((item) => item.definition.operation === selectedOperation), [preferences, selectedOperation]);
    const savedMode = selected?.customization?.mode || "inherit";
    const savedAppendContent = savedMode === "append" ? selected?.customization?.content || "" : "";
    const savedRewriteContent = savedMode === "rewrite" ? selected?.customization?.content || "" : selected?.template?.content || "";
    const activeContent = mode === "append" ? appendContent : mode === "rewrite" ? rewriteContent : "";
    const savedActiveContent = savedMode === "append" ? savedAppendContent : savedMode === "rewrite" ? savedRewriteContent : "";
    const dirty = mode !== savedMode || activeContent !== savedActiveContent;

    const restoreDraft = (preference = selected) => {
        const customization = preference?.customization;
        setMode(customization?.mode || "inherit");
        setAppendContent(customization?.mode === "append" ? customization.content : "");
        setRewriteContent(customization?.mode === "rewrite" ? customization.content : preference?.template?.content || "");
    };

    useEffect(() => { restoreDraft(selected); }, [selected]);

    useEffect(() => {
        if (!dirty) return undefined;
        const preventUnload = (event: BeforeUnloadEvent) => event.preventDefault();
        window.addEventListener("beforeunload", preventUnload);
        return () => window.removeEventListener("beforeunload", preventUnload);
    }, [dirty]);

    const selectOperation = (operation: string) => {
        if (operation === selectedOperation) return;
        if (!dirty) {
            setSelectedOperation(operation);
            return;
        }
        modal.confirm({
            title: t("settingsUi.discardTemplateConfirm"),
            content: t("settingsUi.discardTemplateHint"),
            okText: t("settingsUi.discardSwitch"),
            cancelText: t("canvasSyncKeepEditing"),
            okButtonProps: { danger: true },
            onOk: () => setSelectedOperation(operation),
        });
    };

    const save = async () => {
        if (!selected) return;
        const content = mode === "append" ? appendContent : mode === "rewrite" ? rewriteContent : "";
        if (mode !== "inherit" && !content.trim()) {
            message.warning(t("settingsUi.personalPromptRequired"));
            return;
        }
        setSaving(true);
        try {
            await updateUserPromptCustomization(selected.definition.operation, { mode, content });
            await reload(selected.definition.operation);
            message.success(t("settingsUi.promptPrefsSaved"));
        } catch (error) {
            message.error(error instanceof Error ? error.message : t("settingsUi.promptPrefsSaveFailed"));
        } finally {
            setSaving(false);
        }
    };

    const reset = () => {
        if (!selected) return;
        modal.confirm({
            title: t("settingsUi.restoreTemplateConfirm"),
            content: t("settingsUi.restoreTemplateHint", { name: selected.definition.label }),
            okText: t("settingsUi.restoreTemplate"),
            cancelText: t("timelineCancel"),
            onOk: async () => {
                try {
                    await resetUserPromptCustomization(selected.definition.operation);
                    await reload(selected.definition.operation);
                    message.success(t("settingsUi.templateRestored"));
                } catch (error) {
                    message.error(error instanceof Error ? error.message : t("settingsUi.templateRestoreFailed"));
                }
            },
        });
    };

    if (loading && preferences.length === 0) return <Skeleton active paragraph={{ rows: 10 }} />;
    if (loadError && preferences.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center gap-3 py-16">
                <Callout tone="error" title={t("settingsUi.promptPrefsLoadFailed")}>{loadError}</Callout>
                <Button icon={<RotateCcw className="size-4" />} onClick={() => void reload()}>{t("authRetry")}</Button>
            </div>
        );
    }
    if (!selected) return <EmptyState title={t("settingsUi.noPromptTemplates")} />;

    const templateContent = selected.template?.content || t("settingsUi.noActiveTemplate");
    const previewCreative = mode === "inherit" ? templateContent : mode === "append" ? `${templateContent}\n\n【用户个性化创作要求】\n${appendContent}` : rewriteContent;
    const outputLabel = selected.definition.outputType === "json" ? selected.definition.schemaKey || "JSON" : t("composerModeText");

    return (
        <div className="flex min-h-full flex-col">
            <header className="shrink-0 pb-4">
                <div className="flex flex-wrap items-end justify-between gap-4">
                    <div className="min-w-0 flex-1">
                         <label className="mb-2 block text-xs font-medium text-foreground/55">{t("settingsUi.promptTemplate")}</label>
                        <Select
                             ariaLabel={t("settingsUi.promptTemplate")}
                            className="w-full max-w-md"
                            value={selectedOperation}
                            onChange={selectOperation}
                            options={preferences.map((item) => ({
                                value: item.definition.operation,
                                label: `${item.definition.category} · ${item.definition.label}${item.customization && item.customization.mode !== "inherit" ? ` · ${t("settingsUi.customized")}` : ""}`,
                            }))}
                        />
                    </div>
                    <div className="flex shrink-0 flex-wrap gap-2">
                        <Button icon={<Undo2 className="size-4" />} disabled={!dirty || saving} onClick={() => restoreDraft()}>{t("settingsUi.undoChanges")}</Button>
                        <Button icon={<RotateCcw className="size-4" />} disabled={!selected.customization || saving} onClick={reset}>{t("settingsUi.restorePlatform")}</Button>
                        <Button type="primary" icon={<Save className="size-4" />} loading={saving} disabled={!dirty} onClick={() => void save()}>{t("settingsUi.saveChanges")}</Button>
                    </div>
                </div>

                <div className="mt-4 flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                            <h2 className="text-base font-semibold">{selected.definition.label}</h2>
                            <StatusBadge variant="filled" tone="neutral" label={t("settingsUi.platformVersion", { version: selected.template?.version || "--" })} />
                            <StatusBadge variant="filled" tone="neutral" label={outputLabel} />
                            {dirty ? <StatusBadge variant="filled" tone="warning" label={t("agentSettingsUiUnsaved")} /> : null}
                        </div>
                        <p className="mt-1 text-xs leading-5 text-foreground/55">{selected.definition.description}</p>
                    </div>
<SegmentedControl value={mode} options={modeOptions} onChange={(value) => setMode(value as CustomizationMode)} />
                </div>
            </header>

            {selected.outdated ? <Callout className="mt-4" tone="warning" title={t("settingsUi.templateUpdated")}>{t("settingsUi.templateUpdatedHint")}</Callout> : null}

            <div className="grid min-h-0 flex-1 gap-4 pt-4 lg:grid-cols-3">
                <section className="flex min-h-0 flex-col lg:col-span-2">
                    <div className="mb-3 shrink-0">
                        <h3 className="text-sm font-semibold">{mode === "inherit" ? t("settingsUi.currentTemplate") : mode === "append" ? t("settingsUi.personalRequirements") : t("settingsUi.rewriteStrategy")}</h3>
                        <p className="mt-1 text-xs leading-5 text-foreground/50">
                            {mode === "inherit" ? t("settingsUi.inheritHint") : mode === "append" ? t("settingsUi.appendHint") : t("settingsUi.rewriteHint")}
                        </p>
                    </div>
                    {mode === "append" ? (
                        <Input.TextArea
                            className="min-h-96 resize-none"
                            value={appendContent}
                            maxLength={12000}
                            showCount
                            placeholder={t("settingsUi.promptExample")}
                            onChange={(event) => setAppendContent(event.target.value)}
                        />
                    ) : (
                        <div className="min-h-96 flex-1 overflow-hidden rounded-md bg-surface-active">
                            <PromptCodeEditor
                                value={mode === "inherit" ? templateContent : rewriteContent}
                                readOnly={mode === "inherit"}
                                ariaLabel={mode === "inherit" ? t("settingsUi.platformPrompt") : t("settingsUi.personalPromptRewrite")}
                                onChange={mode === "rewrite" ? setRewriteContent : undefined}
                            />
                        </div>
                    )}
                </section>

                <aside className="min-h-0 pt-4 lg:pl-6 lg:pt-0">
                    <Tabs
                        size="small"
                        items={[
                            {
                                key: "baseline",
                                label: t("settingsUi.platformBaseline"),
                                children: <pre className="thin-scrollbar max-h-96 overflow-auto whitespace-pre-wrap text-xs leading-6 text-foreground/65">{templateContent}</pre>,
                            },
                            {
                                key: "contract",
                                label: t("settingsUi.outputContract"),
                                children: <div><div className="mb-3 flex items-center gap-2 text-xs font-medium"><ShieldCheck className="size-4" />{t("settingsUi.serverReadonly")}</div><pre className="thin-scrollbar max-h-96 overflow-auto whitespace-pre-wrap text-xs leading-6 text-foreground/65">{selected.definition.outputContract}</pre></div>,
                            },
                            {
                                key: "preview",
                                label: t("settingsUi.finalStructure"),
                                children: <div className="space-y-5 text-xs leading-6"><section><div className="mb-2 font-medium text-foreground/80">{t("settingsUi.creativeStrategy")}</div><pre className="thin-scrollbar max-h-64 overflow-auto whitespace-pre-wrap text-foreground/65">{previewCreative || t("settingsUi.notEntered")}</pre></section><section><div className="mb-2 font-medium text-foreground/80">{t("settingsUi.runtimeAppend")}</div><p className="text-foreground/55">{t("settingsUi.runtimeAppendHint")}</p></section></div>,
                            },
                        ]}
                    />
                </aside>
            </div>
        </div>
    );
}
