import { useInterfaceTranslation } from "@/stores/use-interface-locale-store";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { App, Button, Input, Segmented } from "antd";
import { AppModal } from "@/components/ui/product/app-modal";
import { Braces, Image, Layers3, Save, Check, Palette } from "lucide-react";
import { StyleAssetBindingModal } from "@/components/canvas/style-asset-binding-modal";
import { createStyleProfileSnapshot, styleProfileValidationMessage, type StyleProfileSnapshot } from "@/lib/canvas/style-profile";
import { Select } from "@/components/ui/base/select";
type EditorSection = "identity" | "prompt" | "execution";
type StyleProfileEditorModalProps = {
    open: boolean;
    initialProfile: StyleProfileSnapshot | null;
    saving?: boolean;
    onClose: () => void;
    onSave: (profile: StyleProfileSnapshot, applyToProject: boolean) => void;
};
export function StyleProfileEditorModal({ open, initialProfile, saving = false, onClose, onSave }: StyleProfileEditorModalProps) {
    const { t } = useInterfaceTranslation();
    const { message, modal } = App.useApp();
    const [section, setSection] = useState<EditorSection>("identity");
    const [draft, setDraft] = useState<StyleProfileSnapshot | null>(initialProfile);
    const [baseline, setBaseline] = useState("");
    const [assetsOpen, setAssetsOpen] = useState(false);
    useEffect(() => {
        if (!open) return;
        const next = initialProfile ? createStyleProfileSnapshot(initialProfile) : null;
        setDraft(next);
        setBaseline(next ? JSON.stringify(next) : "");
        setSection("identity");
        setAssetsOpen(false);
    }, [initialProfile, open]);
    const validationMessage = useMemo(() => (draft ? styleProfileValidationMessage(draft, t) : t("styleValidationUi.draftMissing")), [draft, t]);
    if (!draft) return null;
    const update = (patch: Partial<StyleProfileSnapshot>) => setDraft((current) => (current ? { ...current, ...patch } : current));
    const requestClose = () => {
        if (JSON.stringify(draft) === baseline) {
            onClose();
            return;
        }
        modal.confirm({ title: t("styleToolsUi.discardStyleChanges"), content: t("styleValidationUi.unsavedChangesLost"), okText: t("skillsUi.discardChanges"), cancelText: t("canvasSyncKeepEditing"), okButtonProps: { danger: true }, onOk: onClose });
    };
    const submit = (applyToProject: boolean) => {
        if (validationMessage) {
            message.error(validationMessage);
            return;
        }
        onSave(createStyleProfileSnapshot({ ...draft, source: "user" }), applyToProject);
    };
    return (
        <>
            <AppModal rootClassName="style-profile-editor-modal" open={open} title={null} footer={null} centered width="min(1120px, calc(100vw - 24px))" onCancel={requestClose} flush>
                <div className="flex max-h-dvh min-h-0 flex-col overflow-hidden bg-background text-foreground">
                    <header className="flex min-h-16 items-center border-b border-border px-4 pr-12 sm:px-5 sm:pr-14">
                        <div className="min-w-0">
                            <div className="flex items-center gap-2">
                                <span className="grid size-8 shrink-0 place-items-center rounded-md border border-border bg-foreground/5">
                                    <Palette className="size-3.5" />
                                </span>
                                <div>
                                    <h2 className="text-sm font-semibold">{t("styleToolsUi.styleEditor")}</h2>
                                    <p className="mt-0.5 truncate text-[var(--fs-tiny)] text-foreground/45">
                                        {draft.title || t("styleToolsUi.untitledStyle")} {t("styleToolsUi.myStylesSuffix")}
                                    </p>
                                </div>
                            </div>
                        </div>
                    </header>

                    <nav className="style-profile-editor-tabs grid shrink-0 grid-cols-3 border-b border-border px-2 sm:flex sm:px-4" role="tablist" aria-label={t("styleToolsUi.styleEditorSections")}>
                        <EditorTab id="style-profile-tab-identity" panelId="style-profile-panel-identity" active={section === "identity"} icon={<Image className="size-3.5" />} label={t("settingsUi.basicInfo")} onClick={() => setSection("identity")} />
                        <EditorTab id="style-profile-tab-prompt" panelId="style-profile-panel-prompt" active={section === "prompt"} icon={<Braces className="size-3.5" />} label={t("styleToolsUi.promptRules")} onClick={() => setSection("prompt")} />
                        <EditorTab
                            id="style-profile-tab-execution"
                            panelId="style-profile-panel-execution"
                            active={section === "execution"}
                            icon={<Layers3 className="size-3.5" />}
                            label={t("styleToolsUi.executionConfiguration")}
                            onClick={() => setSection("execution")}
                        />
                    </nav>

                    <div className="style-profile-editor-workspace grid min-h-0 flex-1 lg:grid-cols-3">
                        <StylePreview profile={draft} />
                        <main id={`style-profile-panel-${section}`} className="thin-scrollbar min-h-0 overflow-y-auto p-4 sm:p-5 lg:col-span-2" role="tabpanel" aria-labelledby={`style-profile-tab-${section}`}>
                            {section === "identity" ? <IdentityFields profile={draft} onChange={update} /> : null}
                            {section === "prompt" ? <PromptFields profile={draft} onChange={update} /> : null}
                            {section === "execution" ? <ExecutionFields profile={draft} onChange={update} onEditAssets={() => setAssetsOpen(true)} /> : null}
                        </main>
                    </div>

                    <footer className="flex flex-col gap-3 border-t border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
                        <p className={`text-[var(--fs-tiny)] ${validationMessage ? "text-red-500" : "text-foreground/45"}`}>{validationMessage || t("styleToolsUi.styleSnapshotHelp")}</p>
                        <div className="flex shrink-0 flex-wrap justify-end gap-2">
                            <Button onClick={requestClose}>{t("timelineCancel")}</Button>
                            <Button icon={<Save className="size-3.5" />} disabled={Boolean(validationMessage)} loading={saving} onClick={() => submit(false)}>
                                {t("styleToolsUi.saveToMyStyles")}
                            </Button>
                            <Button type="primary" icon={<Check className="size-3.5" />} disabled={Boolean(validationMessage)} loading={saving} onClick={() => submit(true)}>
                                {t("styleToolsUi.saveAndApply")}
                            </Button>
                        </div>
                    </footer>
                </div>
            </AppModal>
            <StyleAssetBindingModal
                open={assetsOpen}
                profile={draft}
                onClose={() => setAssetsOpen(false)}
                onApply={(profile) => {
                    setDraft(profile);
                    setAssetsOpen(false);
                }}
            />
        </>
    );
}
function StylePreview({ profile }: { profile: StyleProfileSnapshot }) {
    const { t } = useInterfaceTranslation();
    return (
        <aside className="style-profile-editor-preview thin-scrollbar min-h-0 overflow-y-auto border-b border-border bg-foreground/5 lg:border-b-0 lg:border-r">
            <div className="relative aspect-video overflow-hidden border-b border-border bg-foreground/5">
                {profile.coverUrl ? (
                    <img src={profile.coverUrl} alt={t("canvasCompleteUi.coverNamed", { value0: profile.title || t("styleToolsUi.untitledStyle") })} className="h-full w-full object-cover" />
                ) : (
                    <div className="grid h-full place-items-center text-foreground/25">
                        <Image className="size-7" />
                    </div>
                )}
                <span className="absolute bottom-3 left-3 rounded bg-background/85 px-2 py-1 text-[var(--fs-tiny)] font-medium backdrop-blur">{t("styleToolsUi.myStyles")}</span>
            </div>
            <div className="p-4 sm:p-5">
                <h3 className="text-base font-semibold">{profile.title || t("styleToolsUi.untitledStyle")}</h3>
                <p className="mt-2 text-xs leading-5 text-foreground/48">{profile.description || t("styleToolsUi.styleSummaryHelp")}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                    {profile.tags.length ? (
                        profile.tags.map((tag) => (
                            <span key={tag} className="rounded bg-foreground/10 px-2 py-1 text-[var(--fs-tiny)] text-foreground/58">
                                {tag}
                            </span>
                        ))
                    ) : (
                        <span className="text-[var(--fs-tiny)] text-foreground/35">{t("canvasUi.noTags")}</span>
                    )}
                </div>
                <dl className="mt-5 grid grid-cols-2 border-y border-border py-3 text-[var(--fs-tiny)]">
                    <Metric label="Prompt" value={t("canvasUi.characterCount", { count: profile.prompt.length })} />
                    <Metric label={t("styleToolsUi.negativeConstraints")} value={t("canvasUi.characterCount", { count: profile.negativePrompt?.length || 0 })} />
                    <Metric label={t("styleToolsUi.executionAssetLabel")} value={t("exportSourceCount", { count: profile.assets.length })} />
                    <Metric label={t("styleToolsUi.policy")} value={profile.executionPolicy === "strict-assets" ? t("styleToolsUi.strictBlock") : t("styleToolsUi.compatibleFallback")} />
                </dl>
            </div>
        </aside>
    );
}
function IdentityFields({ profile, onChange }: EditorFieldsProps) {
    const { t } = useInterfaceTranslation();
    const selection = profile.selection || {};
    const setSelection = (key: string, value: string) => onChange({ selection: { ...selection, [key]: value } });
    return (
        <div className="space-y-5">
            <SectionHeading title={t("styleToolsUi.styleIdentity")} description={t("styleToolsUi.styleIdentityHelp")} />
            <div className="grid gap-4 sm:grid-cols-2">
                <Field label={t("styleToolsUi.styleName")} className="sm:col-span-2">
                    <Input maxLength={80} showCount value={profile.title} placeholder={t("styleToolsUi.styleNameExample")} onChange={(event) => onChange({ title: event.target.value })} />
                </Field>
                <Field label={t("styleToolsUi.styleDescription")} className="sm:col-span-2">
                    <Input.TextArea maxLength={500} showCount autoSize={{ minRows: 3, maxRows: 6 }} value={profile.description} placeholder={t("styleToolsUi.styleDescriptionHelp")} onChange={(event) => onChange({ description: event.target.value })} />
                </Field>
                <Field label={t("styleToolsUi.coverImageUrl")} className="sm:col-span-2">
                    <Input value={profile.coverUrl} placeholder={t("styleToolsUi.coverUrlHelp")} onChange={(event) => onChange({ coverUrl: event.target.value })} />
                </Field>
                <Field label={t("pluginUi.tags")} className="sm:col-span-2">
                    <Select mode="tags" maxCount={20} tokenSeparators={[",", "，"]} value={profile.tags} placeholder={t("styleToolsUi.styleTagsHelp")} onChange={(tags) => onChange({ tags })} />
                </Field>
            </div>
            <SectionHeading title={t("styleToolsUi.additionalMetadata")} description={t("styleToolsUi.additionalMetadataHelp")} />
            <div className="grid gap-4 sm:grid-cols-2">
                <Field label={t("styleToolsUi.genreWorld")}>
                    <Input value={selection.world || ""} placeholder={t("styleToolsUi.genreWorldExample")} onChange={(event) => setSelection("world", event.target.value)} />
                </Field>
                <Field label={t("styleToolsUi.visualMedium")}>
                    <Input value={selection.medium || ""} placeholder={t("styleToolsUi.visualMediumExample")} onChange={(event) => setSelection("medium", event.target.value)} />
                </Field>
                <Field label={t("styleToolsUi.narrativeMood")}>
                    <Input value={selection.tone || ""} placeholder={t("styleToolsUi.narrativeMoodExample")} onChange={(event) => setSelection("tone", event.target.value)} />
                </Field>
                <Field label={t("styleToolsUi.characterDesign")}>
                    <Input value={selection.character || ""} placeholder={t("styleToolsUi.characterDesignExample")} onChange={(event) => setSelection("character", event.target.value)} />
                </Field>
            </div>
        </div>
    );
}
function PromptFields({ profile, onChange }: EditorFieldsProps) {
    const { t } = useInterfaceTranslation();
    return (
        <div className="space-y-5">
            <SectionHeading title={t("styleToolsUi.completeStylePrompt")} description={t("styleToolsUi.completeStylePromptHelp")} />
            <Field label={t("styleToolsUi.positivePrompt")}>
                <Input.TextArea value={profile.prompt} autoSize={{ minRows: 16, maxRows: 28 }} placeholder={t("styleToolsUi.positivePromptHelp")} onChange={(event) => onChange({ prompt: event.target.value })} />
            </Field>
            <Field label={t("styleToolsUi.recommendedNegativePrompt")}>
                <Input.TextArea value={profile.negativePrompt} autoSize={{ minRows: 6, maxRows: 14 }} placeholder={t("styleToolsUi.negativePromptHelp")} onChange={(event) => onChange({ negativePrompt: event.target.value })} />
            </Field>
        </div>
    );
}
function ExecutionFields({ profile, onChange, onEditAssets }: EditorFieldsProps & { onEditAssets: () => void }) {
    const { t } = useInterfaceTranslation();
    const enabled = profile.assets.filter((asset) => asset.enabled !== false);
    return (
        <div className="space-y-5">
            <SectionHeading title={t("styleToolsUi.generationExecution")} description={t("styleToolsUi.generationPolicyHelp")} />
            <Field label={t("styleToolsUi.executionPolicy")}>
                <Segmented
                    block
                    value={profile.executionPolicy || "compatible-fallback"}
                    options={[
                        { value: "compatible-fallback", label: t("styleToolsUi.compatibleFallback") },
                        { value: "strict-assets", label: t("styleToolsUi.strictBlock") },
                    ]}
                    onChange={(executionPolicy) => onChange({ executionPolicy: executionPolicy as StyleProfileSnapshot["executionPolicy"] })}
                />
            </Field>
            <div className="flex flex-col gap-3 border-y border-border py-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h4 className="text-sm font-medium">{t("styleToolsUi.executionAssetLabel")}</h4>
                    <p className="mt-1 text-[var(--fs-label)] text-foreground/45">{t("styleValidationUi.boundSummary", { count: profile.assets.length, enabled: enabled.length })}</p>
                </div>
                <Button icon={<Layers3 className="size-3.5" />} onClick={onEditAssets}>
                    {t("styleToolsUi.configureModelAssets")}
                </Button>
            </div>
            {profile.assets.length ? (
                <div className="divide-y divide-border border-b border-border">
                    {profile.assets.map((asset) => (
                        <div key={asset.id} className="flex items-center gap-3 py-3 text-xs">
                            <span className={`size-1.5 shrink-0 rounded-full ${asset.enabled !== false && asset.status === "validated" ? "bg-emerald-500" : asset.status === "unavailable" ? "bg-red-500" : "bg-amber-500"}`} />
                            <span className="min-w-0 flex-1 truncate font-medium">{asset.title}</span>
                            <span className="shrink-0 text-foreground/40">
                                {asset.kind.toUpperCase()} · {asset.status === "validated" ? t("styleToolsUi.validated") : asset.status === "unavailable" ? t("modelUi.unavailable") : t("styleToolsUi.pendingValidation")}
                            </span>
                        </div>
                    ))}
                </div>
            ) : (
                <div className="grid min-h-36 place-items-center border-b border-border text-center text-xs text-foreground/38">{t("styleToolsUi.noAssetsPromptOnly")}</div>
            )}
            <p className="text-[var(--fs-tiny)] leading-5 text-foreground/42">{t("styleToolsUi.modelAdapterPolicyHelp")}</p>
        </div>
    );
}
type EditorFieldsProps = { profile: StyleProfileSnapshot; onChange: (patch: Partial<StyleProfileSnapshot>) => void };
function SectionHeading({ title, description }: { title: string; description: string }) {
    return (
        <div className="border-b border-border pb-3">
            <h3 className="text-sm font-semibold">{title}</h3>
            <p className="mt-1 text-[var(--fs-label)] text-foreground/45">{description}</p>
        </div>
    );
}
function Field({ label, className = "", children }: { label: string; className?: string; children: ReactNode }) {
    return (
        <label className={`grid gap-2 text-xs ${className}`}>
            <span className="font-medium text-foreground/62">{label}</span>
            {children}
        </label>
    );
}
function Metric({ label, value }: { label: string; value: string }) {
    return (
        <div className="min-w-0 py-1">
            <dt className="text-foreground/38">{label}</dt>
            <dd className="mt-0.5 truncate font-medium text-foreground/65">{value}</dd>
        </div>
    );
}
function EditorTab({ id, panelId, active, icon, label, onClick }: { id: string; panelId: string; active: boolean; icon: ReactNode; label: string; onClick: () => void }) {
    return (
        <button
            type="button"
            id={id}
            role="tab"
            aria-selected={active}
            aria-controls={panelId}
            className={`style-profile-editor-tab relative flex h-11 min-w-0 items-center justify-center gap-2 px-3 text-xs font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-inset sm:justify-start ${active ? "is-active text-foreground" : "text-foreground/45 hover:text-foreground/75"}`}
            onClick={onClick}
        >
            {icon}
            <span className="truncate">{label}</span>
        </button>
    );
}
