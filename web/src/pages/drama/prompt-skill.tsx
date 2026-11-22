import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button, Input } from "antd";
import { BookMarked, FileText, Search, X } from "lucide-react";

import { AppModal } from "@/components/ui/product/app-modal";
import type { DramaSkillRef } from "@/services/api/drama";
import { getSkillFile, listAddedSkills, listSkillFiles } from "@/services/api/skills";
import { useInterfaceTranslation } from "@/stores/use-interface-locale-store";

/**
 * 剧情段视频提示词的写作技能：选一个已添加技能里的文本文件，撰写时把全文交给文本模型作为写作方法。
 * 保存的是技能与文件引用，技能更新后下一次撰写会读到新内容。
 */
export function PromptSkillField({ value, onChange }: { value?: DramaSkillRef; onChange: (value?: DramaSkillRef) => void }) {
    const { t } = useInterfaceTranslation();
    const [open, setOpen] = useState(false);
    return (
        <div className="drama-pskill">
            {value ? (
                <div className="drama-pskill-current">
                    <BookMarked className="size-4 shrink-0 text-[var(--workspace-accent)]" aria-hidden />
                    <div className="min-w-0">
                        <strong>{value.skillName || value.skillId}</strong>
                        <span title={value.path}>{value.path}</span>
                    </div>
                    <Button size="small" onClick={() => setOpen(true)}>
                        {t("drama.promptSkill.change")}
                    </Button>
                    <Button size="small" type="text" icon={<X className="size-3.5" />} aria-label={t("drama.promptSkill.remove")} onClick={() => onChange(undefined)} />
                </div>
            ) : (
                <div className="drama-pskill-current is-empty">
                    <span>{t("drama.promptSkill.emptySummary")}</span>
                    <Button size="small" icon={<BookMarked className="size-3.5" />} onClick={() => setOpen(true)}>
                        {t("drama.promptSkill.select")}
                    </Button>
                </div>
            )}
            <PromptSkillModal
                open={open}
                initial={value}
                onClose={() => setOpen(false)}
                onPick={(ref) => {
                    onChange(ref);
                    setOpen(false);
                }}
            />
        </div>
    );
}

function PromptSkillModal({ open, initial, onClose, onPick }: { open: boolean; initial?: DramaSkillRef; onClose: () => void; onPick: (value: DramaSkillRef) => void }) {
    const { locale, t } = useInterfaceTranslation();
    const [keyword, setKeyword] = useState("");
    const [skillId, setSkillId] = useState(initial?.skillId || "");
    const [path, setPath] = useState(initial?.path || "");
    useEffect(() => {
        if (!open) return;
        setSkillId(initial?.skillId || "");
        setPath(initial?.path || "");
    }, [initial, open]);
    const skillsQuery = useQuery({ queryKey: ["skills", "added"], queryFn: listAddedSkills, enabled: open, staleTime: 30_000 });
    const skills = useMemo(() => (skillsQuery.data?.skills || []).filter((skill) => !keyword.trim() || `${skill.skillName} ${skill.description}`.toLowerCase().includes(keyword.trim().toLowerCase())), [keyword, skillsQuery.data]);
    const skill = skillsQuery.data?.skills.find((item) => item.skillId === skillId);
    const filesQuery = useQuery({ queryKey: ["skills", skillId, "files"], queryFn: () => listSkillFiles(skillId), enabled: open && Boolean(skillId), staleTime: 60_000 });
    const files = (filesQuery.data?.files || []).filter((file) => file.kind === "markdown" || file.kind === "text");
    // 选中技能后默认定位到 SKILL.md，这是技能的主说明。
    useEffect(() => {
        if (!skillId || path || !files.length) return;
        setPath((files.find((file) => file.path.toLowerCase() === "skill.md") || files[0]).path);
    }, [files, path, skillId]);
    const fileQuery = useQuery({ queryKey: ["skills", skillId, "file", path], queryFn: () => getSkillFile(skillId, path), enabled: open && Boolean(skillId && path), staleTime: 60_000 });
    const content = fileQuery.data?.file.content || "";
    return (
        <AppModal open={open} onCancel={onClose} footer={null} width={1080} flush title={null} centered>
            <div className="drama-skill-import">
                <header className="drama-skill-import-head">
                    <div>
                        <strong>{t("drama.promptSkill.modalTitle")}</strong>
                        <span>{t("drama.promptSkill.modalDescription")}</span>
                    </div>
                </header>
                <div className="drama-skill-import-body">
                    <aside>
                        <Input size="small" prefix={<Search className="size-3.5" />} allowClear placeholder={t("drama.promptSkill.searchSkills")} value={keyword} onChange={(event) => setKeyword(event.target.value)} />
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
                            {!skillsQuery.isLoading && !skills.length ? <div className="drama-skill-import-empty">{t("drama.promptSkill.noSkills")}</div> : null}
                        </div>
                    </aside>
                    <aside>
                        <div className="drama-skill-import-caption">{skill ? t("drama.promptSkill.fileCount", { skillName: skill.skillName, count: files.length }) : t("studioUi.filesLabel")}</div>
                        <div className="drama-skill-import-list thin-scrollbar">
                            {files.map((file) => (
                                <button key={file.path} type="button" className="is-file" aria-pressed={file.path === path} onClick={() => setPath(file.path)}>
                                    <FileText className="size-3.5 shrink-0" />
                                    <span title={file.path}>{file.path}</span>
                                </button>
                            ))}
                            {skillId && !filesQuery.isLoading && !files.length ? <div className="drama-skill-import-empty">{t("drama.promptSkill.noTextFiles")}</div> : null}
                            {!skillId ? <div className="drama-skill-import-empty">{t("drama.promptSkill.selectSkillFirst")}</div> : null}
                        </div>
                    </aside>
                    <section>
                        <div className="drama-skill-import-caption">
                            {path || t("assetScheme.originalTextLabel")}
                            {content ? (
                                <span>
                                    {t("assetScheme.characterCount", { count: content.length.toLocaleString(locale) })}{content.length > 16000 ? t("drama.promptSkill.overLimitNotice") : ""}
                                </span>
                            ) : null}
                        </div>
                        <pre className="drama-skill-import-content thin-scrollbar">{fileQuery.isLoading ? t("assetScheme.reading") : content || t("drama.promptSkill.previewFilePrompt")}</pre>
                    </section>
                </div>
                <footer className="drama-skill-import-foot">
                    <span>{t("drama.promptSkill.effectNote")}</span>
                    <Button onClick={onClose}>{t("drama.common.cancel")}</Button>
                    <Button type="primary" disabled={!skill || !path || !content} onClick={() => skill && onPick({ skillId: skill.skillId, skillName: skill.skillName, path })}>
                        {t("drama.promptSkill.useFile")}
                    </Button>
                </footer>
            </div>
        </AppModal>
    );
}
