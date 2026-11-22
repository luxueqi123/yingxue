import { useMemo, useRef, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { App, Button, Input } from "antd";
import type { TextAreaRef } from "antd/es/input/TextArea";
import { BookMarked, Check, Eye, FileText, PenLine, RotateCcw, Search, Sparkles, TriangleAlert } from "lucide-react";

import { AppModal } from "@/components/ui/product/app-modal";
import { CHARACTER_VARIABLES, renderAssetPrompt, SCENE_VARIABLES, unknownAssetVariables } from "@/lib/drama/asset-prompt";
import { cn } from "@/lib/utils";
import { getDramaAssetSchemes, type DramaAssetMode, type DramaAssetSchemeCatalog, type DramaAssetSettings } from "@/services/api/drama";
import { getSkillFile, listAddedSkills, listSkillFiles } from "@/services/api/skills";
import { useInterfaceTranslation } from "@/stores/use-interface-locale-store";

// 角色/场景参考图方案：开工前选定，设置页可改。保存的是全文提示词，预览就是实际发送的内容。

const PROMPT_LIMIT = 4000;
const CUSTOM_RATIOS = ["16:9", "4:3", "1:1", "3:4", "9:16"];

export function useAssetSchemes() {
    return useQuery({ queryKey: ["drama-asset-schemes"], queryFn: getDramaAssetSchemes, staleTime: 10 * 60_000 });
}

export function defaultAssetSettings(catalog?: DramaAssetSchemeCatalog): DramaAssetSettings | undefined {
    const scheme = catalog?.schemes[0];
    if (!catalog || !scheme) return undefined;
    return { mode: scheme.mode, characterPrompt: scheme.characterPrompt, scenePrompt: catalog.scenePrompt, characterRatio: scheme.ratio };
}

export type AssetPreviewSample = { characterName: string; characterAppearance: string; sceneName: string; sceneAppearance: string; style: string; rules: string };

const FALLBACK_SAMPLE: AssetPreviewSample = { characterName: "主角", characterAppearance: "（作品圣经建立后自动填入角色外貌）", sceneName: "主场景", sceneAppearance: "（作品圣经建立后自动填入环境描述）", style: "写实电影感", rules: "" };

/** 方案示意：用色块画出版式，比文字更快看懂差别。 */
function SchemeGlyph({ mode }: { mode: DramaAssetMode }) {
    if (mode === "portrait")
        return (
            <span className="drama-glyph is-portrait">
                <i />
            </span>
        );
    if (mode === "turnaround")
        return (
            <span className="drama-glyph is-turnaround">
                <i />
                <i />
                <i />
            </span>
        );
    if (mode === "fourview")
        return (
            <span className="drama-glyph is-fourview">
                <i className="is-face" />
                <i />
                <i />
                <i />
                <b />
            </span>
        );
    return (
        <span className="drama-glyph is-custom">
            <PenLine className="size-4" />
        </span>
    );
}

export function AssetSchemePicker({ value, onChange, sample, layout = "wide" }: { value?: DramaAssetSettings; onChange: (value: DramaAssetSettings) => void; sample?: Partial<AssetPreviewSample>; layout?: "wide" | "compact" }) {
    const { modal } = App.useApp();
    const { t, locale } = useInterfaceTranslation();
    const catalogQuery = useAssetSchemes();
    const catalog = catalogQuery.data;
    const [tab, setTab] = useState<"character" | "scene">("character");
    const [importOpen, setImportOpen] = useState(false);
    const editorRef = useRef<TextAreaRef>(null);
    const preview = { ...FALLBACK_SAMPLE, ...Object.fromEntries(Object.entries(sample || {}).filter(([, item]) => item)) } as AssetPreviewSample;
    if (catalogQuery.isError) return <div className="drama-assets" role="alert">{t("assetScheme.readFailed")}<Button size="small" onClick={() => void catalogQuery.refetch()}>{t("assetScheme.retry")}</Button></div>;
    if (catalog && !catalog.schemes.length) return <div className="drama-assets" role="alert">{t("assetScheme.noneAvailable")}</div>;
    if (!catalog || !value) return <div className="drama-assets is-loading">{t("assetScheme.loading")}</div>;

    const scheme = catalog.schemes.find((item) => item.mode === value.mode);
    const prompt = tab === "character" ? value.characterPrompt : value.scenePrompt;
    const variables = tab === "character" ? CHARACTER_VARIABLES : SCENE_VARIABLES;
    const defaultPrompt = tab === "character" ? scheme?.characterPrompt || catalog.schemes[0].characterPrompt : catalog.scenePrompt;
    const unknown = unknownAssetVariables(prompt, variables);
    const modified = prompt.trim() !== defaultPrompt.trim();
    const rendered =
        tab === "character"
            ? renderAssetPrompt(prompt, { 角色名称: preview.characterName, 角色设定: preview.characterAppearance, 项目画风: preview.style, 画面规则: preview.rules })
            : renderAssetPrompt(prompt, { 场景名称: preview.sceneName, 场景设定: preview.sceneAppearance, 项目画风: preview.style, 画面规则: preview.rules });

    const setPrompt = (next: string) => onChange(tab === "character" ? { ...value, characterPrompt: next } : { ...value, scenePrompt: next });
    const chooseMode = (mode: DramaAssetMode) => {
        if (mode === value.mode) return;
        const target = catalog.schemes.find((item) => item.mode === mode);
        const apply = () =>
            onChange({
                ...value,
                mode,
                characterPrompt: target ? target.characterPrompt : value.characterPrompt,
                characterRatio: target ? target.ratio : value.characterRatio,
                sourceSkillId: target ? undefined : value.sourceSkillId,
                sourceSkillName: target ? undefined : value.sourceSkillName,
                sourcePath: target ? undefined : value.sourcePath,
            });
        const characterModified = scheme ? value.characterPrompt.trim() !== scheme.characterPrompt.trim() : true;
        if (target && characterModified) {
            modal.confirm({ title: t("assetScheme.switchTitle", { name: target.name }), content: t("assetScheme.switchEditedPromptWarning"), okText: t("assetScheme.switchAction"), cancelText: t("assetScheme.keepCurrentAction"), centered: true, onOk: apply });
            return;
        }
        apply();
    };
    const insertVariable = (variable: string) => {
        const element = editorRef.current?.resizableTextArea?.textArea;
        const start = element?.selectionStart ?? prompt.length;
        const end = element?.selectionEnd ?? prompt.length;
        setPrompt(prompt.slice(0, start) + variable + prompt.slice(end));
        window.requestAnimationFrame(() => {
            element?.focus();
            element?.setSelectionRange(start + variable.length, start + variable.length);
        });
    };

    const schemes: Array<{ mode: DramaAssetMode; name: string; description: string; ratio: string }> = [
        ...catalog.schemes,
        { mode: "custom", name: t("assetScheme.custom"), description: t("assetScheme.customDescription"), ratio: value.mode === "custom" ? value.characterRatio : t("assetScheme.chooseRatio") },
    ];

    return (
        <section className={cn("drama-assets", layout === "compact" && "is-compact")} aria-label={t("assetScheme.schemeGroupLabel")}>
            <div className="drama-assets-schemes" role="radiogroup" aria-label={t("assetScheme.characterSchemeGroupLabel")}>
                {schemes.map((item) => (
                    <button key={item.mode} type="button" role="radio" aria-checked={value.mode === item.mode} className="drama-assets-scheme" onClick={() => chooseMode(item.mode)}>
                        <SchemeGlyph mode={item.mode} />
                        <span className="drama-assets-scheme-copy">
                            <strong>
                                {item.name}
                                <em>{item.ratio}</em>
                            </strong>
                            <span>{item.description}</span>
                        </span>
                        {value.mode === item.mode ? (
                            <span className="drama-assets-check" aria-hidden>
                                <Check className="size-3" />
                            </span>
                        ) : null}
                    </button>
                ))}
            </div>
            {value.mode === "custom" ? (
                <div className="drama-assets-ratio">
                    <span>{t("assetScheme.characterRatioLabel")}</span>
                    <div className="drama-tabs" role="radiogroup" aria-label={t("assetScheme.characterRatioLabel")}>
                        {CUSTOM_RATIOS.map((ratio) => (
                            <button key={ratio} type="button" role="radio" className="drama-tab" aria-checked={value.characterRatio === ratio} onClick={() => onChange({ ...value, characterRatio: ratio })}>
                                {ratio}
                            </button>
                        ))}
                    </div>
                    <small>{t("assetScheme.ratioResolutionHint")}</small>
                </div>
            ) : null}

            <div className="drama-assets-editor">
                <div className="drama-assets-editor-head">
                    <div className="drama-tabs" role="tablist" aria-label={t("assetScheme.promptObjectLabel")}>
                        <button type="button" role="tab" className="drama-tab" aria-selected={tab === "character"} onClick={() => setTab("character")}>
                            {t("assetScheme.characterPromptTab")}
                        </button>
                        <button type="button" role="tab" className="drama-tab" aria-selected={tab === "scene"} onClick={() => setTab("scene")}>
                            {t("assetScheme.scenePromptTab")}
                        </button>
                    </div>
                    {modified ? <span className="drama-assets-badge">{t("assetScheme.modifiedBadge")}</span> : <span className="drama-assets-badge is-muted">{t("assetScheme.defaultBadge")}</span>}
                    <div className="ml-auto flex gap-2">
                        <Button size="small" type="text" icon={<BookMarked className="size-3.5" />} onClick={() => setImportOpen(true)}>
                            {t("assetScheme.importFromSkill")}
                        </Button>
                        <Button size="small" type="text" icon={<RotateCcw className="size-3.5" />} disabled={!modified} onClick={() => setPrompt(defaultPrompt)}>
                            {t("assetScheme.restoreDefault")}
                        </Button>
                    </div>
                </div>
                <div className="drama-assets-variables" aria-label={t("assetScheme.insertVariable")}>
                    <span>{t("assetScheme.insertVariable")}</span>
                    {variables.map((variable) => (
                        <button key={variable} type="button" onClick={() => insertVariable(variable)}>
                            {variable.slice(2, -2)}
                        </button>
                    ))}
                </div>
                <Input.TextArea
                    ref={editorRef}
                    value={prompt}
                    maxLength={PROMPT_LIMIT}
                    showCount
                    autoSize={{ minRows: layout === "compact" ? 5 : 6, maxRows: 16 }}
                    onChange={(event) => setPrompt(event.target.value)}
                    aria-label={t(tab === "character" ? "assetScheme.characterPromptField" : "assetScheme.scenePromptField")}
                    status={unknown.length ? "error" : undefined}
                />
                {unknown.length ? (
                    <p className="drama-assets-warning">
                        <TriangleAlert className="size-3.5" />
                        {t("assetScheme.unsupportedVariablesWarning", { variables: unknown.join(locale.startsWith("zh") || locale === "ja-JP" ? "、" : ", ") })}
                    </p>
                ) : null}
                {tab === "character" && value.sourceSkillName ? (
                    <p className="drama-assets-source">
                        <Sparkles className="size-3.5" />
                        {t("assetScheme.skillConstraintSource", { skillName: value.sourceSkillName })}{value.sourcePath ? ` · ${value.sourcePath}` : ""}
                    </p>
                ) : null}
                <div className="drama-assets-preview">
                    <div className="drama-assets-preview-head">
                        <Eye className="size-3.5" />
                        {t("assetScheme.sendPreview")}<span>{t("assetScheme.previewSample", { name: tab === "character" ? preview.characterName : preview.sceneName })}</span>
                    </div>
                    <p>{rendered}</p>
                    {tab === "character" && scheme ? <small>{t("assetScheme.frameLayoutHint", { hint: scheme.frameHint })}</small> : null}
                </div>
            </div>
            <SkillPromptImportModal
                open={importOpen}
                onClose={() => setImportOpen(false)}
                onImport={({ text, skillId, skillName, path }) => {
                    const next = /\{\{角色名称\}\}|\{\{角色设定\}\}/.test(text) ? text : `${text.trim()}\n\n【本角色】{{角色名称}}：{{角色设定}}。画风：{{项目画风}}。{{画面规则}}`;
                    onChange({ ...value, mode: value.mode === "custom" ? "custom" : value.mode, characterPrompt: next.slice(0, PROMPT_LIMIT), sourceSkillId: skillId, sourceSkillName: skillName, sourcePath: path });
                    setTab("character");
                    setImportOpen(false);
                }}
            />
        </section>
    );
}

/** 从已添加技能里挑一份文本，选中段落导入为角色约束提示词。 */
function SkillPromptImportModal({ open, onClose, onImport }: { open: boolean; onClose: () => void; onImport: (input: { text: string; skillId: string; skillName: string; path: string }) => void }) {
    const { message } = App.useApp();
    const { t, locale } = useInterfaceTranslation();
    const [keyword, setKeyword] = useState("");
    const [skillId, setSkillId] = useState("");
    const [path, setPath] = useState("");
    const contentRef = useRef<HTMLPreElement>(null);
    const skillsQuery = useQuery({ queryKey: ["skills", "added"], queryFn: listAddedSkills, enabled: open, staleTime: 30_000 });
    const skills = useMemo(() => (skillsQuery.data?.skills || []).filter((skill) => !keyword.trim() || `${skill.skillName} ${skill.description}`.toLowerCase().includes(keyword.trim().toLowerCase())), [keyword, skillsQuery.data]);
    const skill = skillsQuery.data?.skills.find((item) => item.skillId === skillId);
    const filesQuery = useQuery({ queryKey: ["skills", skillId, "files"], queryFn: () => listSkillFiles(skillId), enabled: open && Boolean(skillId), staleTime: 60_000 });
    const files = (filesQuery.data?.files || []).filter((file) => file.kind === "markdown" || file.kind === "text");
    const fileQuery = useQuery({ queryKey: ["skills", skillId, "file", path], queryFn: () => getSkillFile(skillId, path), enabled: open && Boolean(skillId && path), staleTime: 60_000 });
    const content = fileQuery.data?.file.content || "";

    const importText = (whole: boolean) => {
        const selection = window.getSelection();
        const selected = selection && contentRef.current && contentRef.current.contains(selection.anchorNode) ? selection.toString() : "";
        const text = whole ? content : selected;
        if (!text.trim()) {
            message.info(t("assetScheme.selectImportText"));
            return;
        }
        if (text.length > PROMPT_LIMIT) message.warning(t("assetScheme.importLimitWarning", { limit: PROMPT_LIMIT }));
        onImport({ text: text.slice(0, PROMPT_LIMIT), skillId, skillName: skill?.skillName || "", path });
    };

    return (
        <AppModal open={open} onCancel={onClose} footer={null} width={1080} flush title={null} centered>
            <div className="drama-skill-import">
                <header className="drama-skill-import-head">
                    <div>
                        <strong>{t("assetScheme.importModalTitle")}</strong>
                        <span>{t("assetScheme.importModalDescription")}</span>
                    </div>
                </header>
                <div className="drama-skill-import-body">
                    <aside>
                        <Input size="small" prefix={<Search className="size-3.5" />} allowClear placeholder={t("assetScheme.searchSkills")} value={keyword} onChange={(event) => setKeyword(event.target.value)} />
                        <div className="drama-skill-import-list thin-scrollbar">
                            {skills.map((item) => (
                                <button
                                    key={item.skillId}
                                    type="button"
                                    aria-pressed={item.skillId === skillId}
                                    onClick={() => {
                                        setSkillId(item.skillId);
                                        setPath("");
                                    }}
                                >
                                    <strong>{item.skillName}</strong>
                                    <span>{item.description || "—"}</span>
                                </button>
                            ))}
                            {!skillsQuery.isLoading && !skills.length ? <ImportEmpty>{t("assetScheme.noSkillsAdded")}</ImportEmpty> : null}
                        </div>
                    </aside>
                    <aside>
                        <div className="drama-skill-import-caption">{skill ? t("assetScheme.skillTextFileCount", { skillName: skill.skillName, count: files.length }) : t("assetScheme.fileListTitle")}</div>
                        <div className="drama-skill-import-list thin-scrollbar">
                            {files.map((file) => (
                                <button key={file.path} type="button" className="is-file" aria-pressed={file.path === path} onClick={() => setPath(file.path)}>
                                    <FileText className="size-3.5 shrink-0" />
                                    <span title={file.path}>{file.path}</span>
                                </button>
                            ))}
                            {skillId && !filesQuery.isLoading && !files.length ? <ImportEmpty>{t("assetScheme.noImportFiles")}</ImportEmpty> : null}
                            {!skillId ? <ImportEmpty>{t("assetScheme.selectSkill")}</ImportEmpty> : null}
                        </div>
                    </aside>
                    <section>
                        <div className="drama-skill-import-caption">
                            {path || t("assetScheme.originalTextLabel")}
                            {content ? <span>{t("assetScheme.characterCount", { count: content.length.toLocaleString(locale) })}</span> : null}
                        </div>
                        <pre ref={contentRef} className="drama-skill-import-content thin-scrollbar">
                            {fileQuery.isLoading ? t("assetScheme.reading") : content || t("assetScheme.selectPassageHelp")}
                        </pre>
                    </section>
                </div>
                <footer className="drama-skill-import-foot">
                    <span>
                        {t("assetScheme.addRoleInfoHint")}
                    </span>
                    <Button onClick={onClose}>{t("drama.common.cancel")}</Button>
                    <Button disabled={!content} onClick={() => importText(true)}>
                        {t("assetScheme.importWholeFile")}
                    </Button>
                    <Button type="primary" disabled={!content} onClick={() => importText(false)}>
                        {t("assetScheme.importSelectedText")}
                    </Button>
                </footer>
            </div>
        </AppModal>
    );
}

function ImportEmpty({ children }: { children: ReactNode }) {
    return <div className="drama-skill-import-empty">{children}</div>;
}
