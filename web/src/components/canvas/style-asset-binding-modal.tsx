import { useInterfaceTranslation } from "@/stores/use-interface-locale-store";
import type { InterfaceMessageKey, InterfaceTranslate } from "@/lib/interface-locale";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Button, Input, InputNumber } from "antd";
import { AppModal } from "@/components/ui/product/app-modal";
import { Switch } from "@/components/ui/base/switch";
import { AlertTriangle, Box, Check, FileImage, Link2, Plus, Save, SlidersHorizontal, Trash2 } from "lucide-react";
import { nanoid } from "nanoid";
import { Select } from "@/components/ui/base/select";

import {
    createStyleProfileSnapshot,
    MAX_STYLE_ASSETS,
    styleAssetValidationMessage,
    type StyleAssetBinding,
    type StyleAssetKind,
    type StyleAssetStatus,
    type StyleProfileSnapshot,
} from "@/lib/canvas/style-profile";

const kindOptions: Array<{ value: StyleAssetKind; label: InterfaceMessageKey | "LoRA" }> = [
    { value: "lora", label: "LoRA" },
    { value: "template", label: "styleToolsUi.imageTemplate" },
    { value: "reference", label: "styleToolsUi.referenceGroup" },
    { value: "prompt", label: "styleToolsUi.promptModule" },
];

const statusOptions: Array<{ value: StyleAssetStatus; label: InterfaceMessageKey }> = [
    { value: "draft", label: "styleToolsUi.pendingValidation" },
    { value: "validated", label: "styleToolsUi.validated" },
    { value: "unavailable", label: "styleToolsUi.unavailable" },
];

const policyOptions: Array<{ value: NonNullable<StyleProfileSnapshot["executionPolicy"]>; label: InterfaceMessageKey }> = [
    { value: "compatible-fallback", label: "styleToolsUi.compatibleFallback" },
    { value: "strict-assets", label: "styleToolsUi.strictBlock" },
];

const emptyAsset = (): StyleAssetBinding => ({
    id: nanoid(),
    kind: "lora",
    provider: "liblib",
    title: "",
    enabled: false,
    weight: 0.8,
    status: "draft",
});

type StyleAssetBindingModalProps = {
    open: boolean;
    profile: StyleProfileSnapshot | null;
    onClose: () => void;
    onApply: (profile: StyleProfileSnapshot) => void;
};

export function StyleAssetBindingModal({ open, profile, onClose, onApply }: StyleAssetBindingModalProps) {
    const { t } = useInterfaceTranslation();
    const [draft, setDraft] = useState<StyleProfileSnapshot | null>(profile);
    const [editingId, setEditingId] = useState("");

    useEffect(() => {
        if (!open) return;
        setDraft(profile ? createStyleProfileSnapshot(profile) : null);
        setEditingId(profile?.assets[0]?.id || "");
    }, [open, profile]);

    const editing = useMemo(() => draft?.assets.find((asset) => asset.id === editingId), [draft, editingId]);
    const issues = useMemo(() => draft?.assets.map((asset) => ({ id: asset.id, message: styleAssetValidationMessage(asset, t) })).filter((issue) => issue.message) || [], [draft, t]);
    if (!draft) return null;

    const updateAsset = (patch: Partial<StyleAssetBinding>) => {
        setDraft((current) => current ? { ...current, assets: current.assets.map((asset) => asset.id === editingId ? { ...asset, ...patch } : asset) } : current);
    };
    const addAsset = () => {
        const asset = emptyAsset();
        setDraft((current) => current ? { ...current, assets: [...current.assets, asset] } : current);
        setEditingId(asset.id);
    };
    const deleteAsset = (id: string) => {
        setDraft((current) => current ? { ...current, assets: current.assets.filter((asset) => asset.id !== id) } : current);
        setEditingId((current) => current === id ? draft.assets.find((asset) => asset.id !== id)?.id || "" : current);
    };

    return (
        <AppModal
            rootClassName="style-asset-binding-modal"
            open={open}
            title={null}
            footer={null}
            centered
            width="min(980px, calc(100vw - 24px))"
            onCancel={onClose}
            flush
        >
            <div className="flex max-h-dvh min-h-0 flex-col overflow-hidden bg-background text-foreground">
                <header className="flex items-start justify-between gap-3 border-b border-border px-4 py-3 pr-12 sm:items-center sm:px-5">
                    <div className="min-w-0">
                        <h2 className="text-sm font-semibold">{t("styleToolsUi.executionAssets")}</h2>
                        <p className="mt-0.5 text-[var(--fs-label)] text-foreground/45">{t("styleToolsUi.executionAssetsHelp")}</p>
                    </div>
                    <Button className="shrink-0" icon={<Plus className="size-3.5" />} disabled={draft.assets.length >= MAX_STYLE_ASSETS} title={draft.assets.length >= MAX_STYLE_ASSETS ? t("canvasCompleteUi.bindingLimit", { value0: MAX_STYLE_ASSETS }) : undefined} onClick={addAsset}>{t("styleToolsUi.addAsset")}</Button>
                </header>

                <div className="grid min-h-0 flex-1 md:grid-cols-3">
                    <aside className="thin-scrollbar max-h-52 min-h-0 overflow-y-auto border-b border-border md:col-span-1 md:max-h-none md:border-b-0 md:border-r">
                        <div className="sticky top-0 z-10 border-b border-border bg-background px-4 py-3">
                            <label className="flex items-center justify-between gap-3 text-xs">
                                <span className="min-w-0">
                                    <span className="block font-medium">{t("styleToolsUi.executionPolicy")}</span>
                                    <span className="mt-0.5 block text-[var(--fs-tiny)] text-foreground/42">{t("styleToolsUi.incompatiblePolicyHelp")}</span>
                                </span>
                                <Select<NonNullable<StyleProfileSnapshot["executionPolicy"]>>
                                    className="shrink-0"
                                    size="small"
                                    value={draft.executionPolicy || "compatible-fallback"}
                                    options={policyOptions.map(option => ({ ...option, label: t(option.label) }))}
                                    onChange={(executionPolicy) => setDraft({ ...draft, executionPolicy })}
                                />
                            </label>
                        </div>

                        {draft.assets.length ? (
                            <div className="divide-y divide-border">
                                {draft.assets.map((asset) => {
                                    const issue = styleAssetValidationMessage(asset, t);
                                    return (
                                        <button
                                            key={asset.id}
                                            type="button"
                                            className={`flex w-full items-start gap-3 px-4 py-3 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-inset ${editingId === asset.id ? "bg-foreground/10" : "hover:bg-foreground/5"}`}
                                            onClick={() => setEditingId(asset.id)}
                                        >
                                            <AssetKindIcon kind={asset.kind} />
                                            <span className="min-w-0 flex-1">
                                                <span className="block truncate text-xs font-medium">{asset.title || t("styleToolsUi.untitledAsset")}</span>
                                                <span className="mt-1 block truncate text-[var(--fs-tiny)] text-foreground/42">{assetKindLabel(asset.kind, t)} · {assetStatusLabel(asset.status, t)}</span>
                                            </span>
                                            <span className={`mt-1 size-1.5 shrink-0 rounded-full ${issue ? "bg-red-500" : asset.enabled ? asset.status === "validated" ? "bg-emerald-500" : "bg-amber-500" : "bg-foreground/20"}`} />
                                        </button>
                                    );
                                })}
                            </div>
                        ) : (
                            <EmptyAssetList />
                        )}
                    </aside>

                    <main className="thin-scrollbar min-h-0 overflow-y-auto p-4 sm:p-5 md:col-span-2">
                        {editing ? (
                            <AssetEditor asset={editing} onChange={updateAsset} onDelete={() => deleteAsset(editing.id)} />
                        ) : (
                            <div className="grid min-h-72 place-items-center text-center">
                                <div><Plus className="mx-auto size-5 text-foreground/25" /><p className="mt-2 text-xs text-foreground/50">{t("styleToolsUi.chooseExecutionAsset")}</p></div>
                            </div>
                        )}
                    </main>
                </div>

                <footer className="flex flex-col gap-3 border-t border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
                    <div className="flex min-w-0 items-start gap-2 text-[var(--fs-tiny)] text-foreground/45">
                        {issues.length ? <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-red-500" /> : <Check className="mt-0.5 size-3.5 shrink-0" />}
                        <span className="min-w-0 leading-5">{issues.length ? t("styleValidationUi.assetIssues", { count: issues.length, message: issues[0].message }) : t("styleValidationUi.assetSummary", { count: draft.assets.length, enabled: draft.assets.filter((asset) => asset.enabled).length })}</span>
                    </div>
                    <div className="flex shrink-0 justify-end gap-2">
                        <Button onClick={onClose}>{t("timelineCancel")}</Button>
                        <Button
                            type="primary"
                            icon={<Save className="size-3.5" />}
                            disabled={issues.length > 0}
                            onClick={() => onApply(createStyleProfileSnapshot({ ...draft, source: "user", revision: draft.revision + 1 }))}
                        >
                            {t("modelUi.apply")}
                        </Button>
                    </div>
                </footer>
            </div>
        </AppModal>
    );
}

function AssetEditor({ asset, onChange, onDelete }: { asset: StyleAssetBinding; onChange: (patch: Partial<StyleAssetBinding>) => void; onDelete: () => void }) {
    const { t } = useInterfaceTranslation();
    const validationMessage = styleAssetValidationMessage(asset, t);
    return (
        <div className="space-y-5">
            <div className="flex items-start justify-between gap-3 border-b border-border pb-4">
                <div>
                    <h3 className="text-sm font-semibold">{t("styleToolsUi.assetConfiguration")}</h3>
                    <p className="mt-1 text-[var(--fs-label)] text-foreground/45">{t("styleToolsUi.validatedAssetsOnly")}</p>
                </div>
                <Button danger type="text" icon={<Trash2 className="size-3.5" />} onClick={onDelete}>{t("canvasLibraryDelete")}</Button>
            </div>

            {validationMessage ? (
                <div className="flex gap-2 rounded-md bg-red-500/8 px-3 py-2 text-[var(--fs-label)] leading-5 text-foreground/65">
                    <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-red-500" />
                    <span>{validationMessage}</span>
                </div>
            ) : null}

            <div className="grid gap-4 sm:grid-cols-2">
                <Field label={t("styleToolsUi.assetType")}>
                    <Select<StyleAssetKind> value={asset.kind} options={kindOptions.map(option => ({ ...option, label: option.label === "LoRA" ? "LoRA" : t(option.label) }))} onChange={(kind) => onChange({ kind })} />
                </Field>
                <Field label={t("styleToolsUi.enabledStatus")}>
                    <div className="flex h-8 items-center justify-between border-b border-border">
                        <span className="text-xs text-foreground/55">{t("styleToolsUi.includeExecution")}</span>
                        <Switch size="sm" checked={asset.enabled !== false} onChange={(enabled) => onChange({ enabled })} />
                    </div>
                </Field>
                <Field label={t("canvasUi.assetName")}>
                    <Input value={asset.title} placeholder={t("styleToolsUi.fantasyExample")} onChange={(event) => onChange({ title: event.target.value })} />
                </Field>
                <Field label={t("styleToolsUi.validationStatus")}>
                    <Select<StyleAssetStatus> value={asset.status} options={statusOptions.map(option => ({ ...option, label: t(option.label) }))} onChange={(status) => onChange({ status })} />
                </Field>
                <Field label={t("styleToolsUi.sourceAdapter")}>
                    <Input value={asset.provider} placeholder={t("styleToolsUi.sourceAdapterPlaceholder")} onChange={(event) => onChange({ provider: event.target.value })} />
                </Field>
                <Field label={t("styleToolsUi.sourceAssetId")}>
                    <Input value={asset.sourceId} placeholder={t("styleToolsUi.sourceAssetIdPlaceholder")} onChange={(event) => onChange({ sourceId: event.target.value })} />
                </Field>
                <Field label={t("styleToolsUi.sourcePageUrl")} className="sm:col-span-2">
                    <Input value={asset.sourceUrl} placeholder={t("styleToolsUi.sourcePageUrlHelp")} onChange={(event) => onChange({ sourceUrl: event.target.value })} />
                </Field>
                <Field label={t("styleToolsUi.assetModelId")}>
                    <Input value={asset.model} placeholder={t("styleToolsUi.liblibModelExample")} onChange={(event) => onChange({ model: event.target.value })} />
                </Field>
                <Field label={t("styleToolsUi.modelVersion")}>
                    <Input value={asset.version} placeholder={t("styleToolsUi.versionIdPlaceholder")} onChange={(event) => onChange({ version: event.target.value })} />
                </Field>
                <Field label={t("styleToolsUi.compatibleBaseModels")} className="sm:col-span-2">
                    <Select<string[]> mode="tags" value={asset.baseModels || []} tokenSeparators={[","]} placeholder={t("styleToolsUi.baseModelsPlaceholder")} onChange={(baseModels) => onChange({ baseModels })} />
                </Field>
            </div>

            {asset.kind === "lora" ? <LoraFields asset={asset} onChange={onChange} /> : null}
            {asset.kind === "reference" ? <ReferenceFields asset={asset} onChange={onChange} /> : null}
            {asset.kind === "prompt" || asset.kind === "template" ? <PromptFields asset={asset} onChange={onChange} /> : null}

            <GenerationParameterFields asset={asset} onChange={onChange} />
            <LicenseFields asset={asset} onChange={onChange} />

            {asset.enabled !== false && (asset.kind === "lora" || asset.kind === "reference") ? (
                <div className="flex gap-2 rounded-md bg-amber-500/8 px-3 py-2 text-[var(--fs-label)] leading-5 text-foreground/60">
                    <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-amber-500" />
                    <span>{t("styleValidationUi.adapterUnavailable", { adapter: asset.kind === "lora" ? "LoRA" : t("styleToolsUi.referenceInjection") })}</span>
                </div>
            ) : null}
        </div>
    );
}

function LoraFields({ asset, onChange }: AssetFieldProps) {
    const { t } = useInterfaceTranslation();
    return (
        <section className="grid gap-4 border-t border-border pt-4 sm:grid-cols-2">
            <Field label={t("styleToolsUi.loraWeight")}>
                <InputNumber className="w-full" min={0} max={2} step={0.05} value={asset.weight} onChange={(weight) => onChange({ weight: weight ?? undefined })} />
            </Field>
            <Field label={t("styleToolsUi.triggerWords")}>
                <Select<string[]> mode="tags" value={asset.triggerWords || []} tokenSeparators={[","]} placeholder={t("assetsUi.tagsPlaceholder")} onChange={(triggerWords) => onChange({ triggerWords })} />
            </Field>
        </section>
    );
}

function ReferenceFields({ asset, onChange }: AssetFieldProps) {
    const { t } = useInterfaceTranslation();
    return (
        <section className="grid gap-4 border-t border-border pt-4">
            <Field label={t("styleToolsUi.referenceImageUrl")}>
                <Select<string[]> mode="tags" value={asset.referenceUrls || []} tokenSeparators={[","]} placeholder={t("styleToolsUi.referenceUrlPlaceholder")} onChange={(referenceUrls) => onChange({ referenceUrls })} />
            </Field>
            <Field label={t("styleToolsUi.projectResourceId")}>
                <Select<string[]> mode="tags" value={asset.referenceResourceIds || []} tokenSeparators={[","]} placeholder={t("styleToolsUi.resourceIdPlaceholder")} onChange={(referenceResourceIds) => onChange({ referenceResourceIds })} />
            </Field>
        </section>
    );
}

function PromptFields({ asset, onChange }: AssetFieldProps) {
    const { t } = useInterfaceTranslation();
    return (
        <section className="border-t border-border pt-4">
            <Field label={t("styleToolsUi.promptModule")}>
                <Input.TextArea autoSize={{ minRows: 4, maxRows: 8 }} value={asset.promptFragment} placeholder={t("styleToolsUi.stablePromptRequirements")} onChange={(event) => onChange({ promptFragment: event.target.value })} />
            </Field>
        </section>
    );
}

function GenerationParameterFields({ asset, onChange }: AssetFieldProps) {
    const { t } = useInterfaceTranslation();
    const parameters = asset.parameters || {};
    const updateParameters = (patch: NonNullable<StyleAssetBinding["parameters"]>) => onChange({ parameters: { ...parameters, ...patch } });
    return (
        <section className="border-t border-border pt-4">
            <h4 className="mb-3 text-xs font-semibold">{t("styleToolsUi.suggestedParameters")}</h4>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <Field label="Sampler"><Input value={parameters.sampler} placeholder={t("assetsUi.optional")} onChange={(event) => updateParameters({ sampler: event.target.value })} /></Field>
                <Field label="Steps"><InputNumber className="w-full" min={1} max={200} value={parameters.steps} onChange={(steps) => updateParameters({ steps: steps ?? undefined })} /></Field>
                <Field label="CFG"><InputNumber className="w-full" min={0} max={50} step={0.5} value={parameters.cfg} onChange={(cfg) => updateParameters({ cfg: cfg ?? undefined })} /></Field>
                <Field label={t("styleToolsUi.recommendedSize")}><Input value={parameters.size} placeholder={t("styleToolsUi.sizeExample")} onChange={(event) => updateParameters({ size: event.target.value })} /></Field>
            </div>
        </section>
    );
}

function LicenseFields({ asset, onChange }: AssetFieldProps) {
    const { t } = useInterfaceTranslation();
    return (
        <section className="border-t border-border pt-4">
            <h4 className="mb-3 text-xs font-semibold">{t("styleToolsUi.licenseSnapshot")}</h4>
            <div className="grid gap-4 sm:grid-cols-2">
                <Field label={t("styleToolsUi.commercialUse")}>
                    <Select
                        value={asset.license?.commercial === true ? "yes" : asset.license?.commercial === false ? "no" : "unknown"}
                        options={[{ value: "unknown", label: t("styleToolsUi.notConfirmed") }, { value: "yes", label: t("styleToolsUi.commercialAllowed") }, { value: "no", label: t("styleToolsUi.commercialDisallowed") }]}
                        onChange={(value: "unknown" | "yes" | "no") => onChange({ license: { ...asset.license, commercial: value === "unknown" ? undefined : value === "yes" } })}
                    />
                </Field>
                <Field label={t("styleToolsUi.licenseSource")}><Input value={asset.license?.source} placeholder={t("styleToolsUi.licensePageVersion")} onChange={(event) => onChange({ license: { ...asset.license, source: event.target.value } })} /></Field>
                <Field label={t("styleToolsUi.licenseNotes")} className="sm:col-span-2"><Input value={asset.license?.note} placeholder={t("styleToolsUi.licenseNotesPlaceholder")} onChange={(event) => onChange({ license: { ...asset.license, note: event.target.value } })} /></Field>
            </div>
        </section>
    );
}

type AssetFieldProps = {
    asset: StyleAssetBinding;
    onChange: (patch: Partial<StyleAssetBinding>) => void;
};

function AssetKindIcon({ kind }: { kind: StyleAssetKind }) {
    return (
        <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded bg-foreground/5 text-foreground/55">
            {kind === "lora" ? <SlidersHorizontal className="size-3.5" /> : kind === "reference" ? <FileImage className="size-3.5" /> : kind === "template" ? <Box className="size-3.5" /> : <Link2 className="size-3.5" />}
        </span>
    );
}

function EmptyAssetList() {
    const { t } = useInterfaceTranslation();
    return (
        <div className="grid min-h-52 place-items-center px-6 text-center">
            <div><Box className="mx-auto size-5 text-foreground/25" /><p className="mt-2 text-xs font-medium">{t("styleToolsUi.noExecutionAssets")}</p><p className="mt-1 text-[var(--fs-tiny)] leading-5 text-foreground/42">{t("styleToolsUi.promptOnlyStyle")}</p></div>
        </div>
    );
}

function assetKindLabel(kind: StyleAssetKind, t: InterfaceTranslate) {
    const key = kindOptions.find((item) => item.value === kind)?.label;
    return key && key !== "LoRA" ? t(key) : key || kind;
}

function assetStatusLabel(status: StyleAssetStatus, t: InterfaceTranslate) {
    const key = statusOptions.find((item) => item.value === status)?.label;
    return key ? t(key) : status;
}

function Field({ label, className = "", children }: { label: string; className?: string; children: ReactNode }) {
    return <label className={`grid gap-2 text-xs ${className}`}><span className="font-medium text-foreground/60">{label}</span>{children}</label>;
}
