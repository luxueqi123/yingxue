import { useInterfaceTranslation } from "@/stores/use-interface-locale-store";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { App, Button } from "antd";
import { AntTooltip as Tooltip } from "@/components/ui/base/tooltip/ant-tooltip";
import { AlertTriangle, ArrowDownToLine, ArrowUpToLine, BookOpen, BookOpenText, CheckCircle2, Clapperboard, PanelRightClose, PanelRightOpen, Pencil, PenLine, Quote, ScanSearch, Trash2 } from "lucide-react";

import { averageShotSeconds, normalizeStoryboard, segmentLimits } from "@/lib/drama/storyboard";
import type { InterfaceMessageKey, InterfaceTranslate } from "@/lib/interface-locale";
import { segmentRuleLabel } from "../storyboard-rules";
import { getDramaChapter, type DramaDialogueCheck, type DramaEpisodeDetail, type DramaShot, type DramaShotPatch, type DramaStoryboardSettings } from "@/services/api/drama";

import { formatCount, SOURCE_FORMAT_LABEL, sourceFormatOf } from "../drama-shared";
import { SourceEditModal } from "./episode-source";
import { JobDetailModal } from "./job-detail";
import { ShotEditor } from "./segment-dialog";
import type { EpisodeEmpty } from "./storyboard";

function storyboardSummary(value: DramaStoryboardSettings, t: InterfaceTranslate) {
    const rules = normalizeStoryboard(value);
    const pacing = { rapid: "drama.storyboardRules.pacingRapid", fast: "drama.storyboardRules.pacingFast", standard: "drama.storyboardRules.pacingStandard", relaxed: "drama.storyboardRules.pacingRelaxed", slow: "drama.storyboardRules.pacingSlow" } as const;
    const dialogue = { dense: "coverageUi.082", standard: "drama.storyboardRules.pacingStandard", sparse: "coverageUi.083", custom: "dramaUi.dialogueCustom" } as const;
    const transition: Record<DramaStoryboardSettings["transition"], InterfaceMessageKey> = { auto: "drama.storyboardRules.segmentAutoLabel", cut: "dramaUi.transitionCut", fadeblack: "dramaUi.transitionBlack", fadewhite: "dramaUi.transitionWhite" };
    return t("dramaUi.storyboardSummary", { pacing: t(pacing[rules.pacing]), seconds: averageShotSeconds(rules), dialogue: t(dialogue[rules.dialogue]), segments: segmentRuleLabel(segmentLimits(rules), t), transition: t(transition[rules.transition]) });
}

type SceneGroup = { key: string; scene: string; shots: DramaShot[] };

function groupScenes(shots: DramaShot[]): SceneGroup[] {
    const groups: SceneGroup[] = [];
    for (const shot of shots) {
        const last = groups[groups.length - 1];
        if (last && last.scene === shot.scene) last.shots.push(shot);
        else groups.push({ key: shot.id, scene: shot.scene, shots: [shot] });
    }
    return groups;
}

/** 在原文里定位镜头出处；整句找不到时退回前 16 个字，仍找不到就不标注。 */
function locateQuote(text: string, quote: string) {
    const needle = quote.trim().replace(/^[「“"]+|[」”"]+$/g, "");
    if (!needle) return -1;
    const index = text.indexOf(needle);
    if (index >= 0 || needle.length <= 16) return index >= 0 ? index : -1;
    return text.indexOf(needle.slice(0, 16));
}

export function ScriptView({
    projectId,
    detail,
    storyboard,
    currentId,
    busy,
    onCurrent,
    onRescript,
    onPatchShot,
    onInsertShot,
    onDeleteShot,
    onSourceSaved,
    empty,
}: {
    projectId: string;
    detail: DramaEpisodeDetail;
    storyboard: DramaStoryboardSettings;
    currentId: string;
    busy: boolean;
    onCurrent: (id: string) => void;
    onRescript: () => void;
    onPatchShot: (shot: DramaShot, patch: DramaShotPatch) => void;
    onInsertShot: (shot: DramaShot, position: "before" | "after") => void;
    onDeleteShot: (shot: DramaShot) => void;
    /** 原文已保存；rescript=true 时需要按新原文重新改编。 */
    onSourceSaved: (rescript: boolean) => void;
    empty: EpisodeEmpty;
}) {
    const { t } = useInterfaceTranslation();
    const [processOpen, setProcessOpen] = useState(false);
    const [editingChapterId, setEditingChapterId] = useState("");
    const { modal } = App.useApp();
    const { episode, shots, chapters } = detail;
    const format = sourceFormatOf(episode.sourceFormat);
    const [sourceOpen, setSourceOpen] = useState(true);
    const current = shots.find((shot) => shot.id === currentId);
    const scenes = useMemo(() => groupScenes(shots), [shots]);
    const segmentSizes = useMemo(() => {
        const sizes = new Map<number, number>();
        for (const shot of shots) sizes.set(shot.segmentIndex, (sizes.get(shot.segmentIndex) || 0) + 1);
        return sizes;
    }, [shots]);
    const confirmDelete = (shot: DramaShot) =>
        modal.confirm({
            title: t("coverageUi.234", { value0: String(shot.position + 1).padStart(2, "0") }),
            content: shot.dialogue ? `这个镜头的台词“${shot.dialogue}”会一起删除，本段视频提示词与视频标记过期。` : "本段视频提示词与视频会标记过期，需要重新撰写和生成。",
            okText: t("canvasLibraryDelete"),
            okButtonProps: { danger: true },
            cancelText: t("timelineCancel"),
            centered: true,
            onOk: () => onDeleteShot(shot),
        });
    const confirmRescript = () =>
        modal.confirm({
            title: t("coverageUi.235", { value0: episode.number }),
            content: "会基于原文重新生成剧本、镜头与剧情段，各段视频提示词与视频都需要重新生成；已生成的段视频保留在版本记录中。",
            okText: t("coverageUi.239"),
            cancelText: t("timelineCancel"),
            centered: true,
            onOk: onRescript,
        });

    return (
        <div className={`drama-scriptv ${sourceOpen ? "" : "is-source-hidden"}`}>
            <div className="drama-scriptv-main thin-scrollbar">
                <section className="drama-scriptv-brief">
                    <div className="drama-scriptv-brief-head">
                        <span className="drama-eyebrow">{t("coverageUi.236")}</span>
                        <span className="drama-scriptv-format" title={t(SOURCE_FORMAT_LABEL[format].detail)}>
                            {t("coverageUi.237")}{t(SOURCE_FORMAT_LABEL[format].title)}
                        </span>
                        <div className="ml-auto flex items-center gap-2">
                            {detail.scriptJob ? (
                                <Button size="small" type="text" icon={<ScanSearch className="size-3.5" />} onClick={() => setProcessOpen(true)}>
                                    {t("coverageUi.238")}
                                </Button>
                            ) : null}
                            <Button size="small" type="text" icon={<PenLine className="size-3.5" />} disabled={busy} onClick={confirmRescript}>
                                {t("coverageUi.239")}
                            </Button>
                            <Tooltip title={sourceOpen ? t("coverageUi.240") : t("coverageUi.241")}>
                                <Button
                                    size="small"
                                    type="text"
                                    icon={sourceOpen ? <PanelRightClose className="size-3.5" /> : <PanelRightOpen className="size-3.5" />}
                                    aria-pressed={sourceOpen}
                                    aria-label={sourceOpen ? t("coverageUi.240") : t("coverageUi.241")}
                                    onClick={() => setSourceOpen((open) => !open)}
                                />
                            </Tooltip>
                        </div>
                    </div>
                    <p className="drama-scriptv-synopsis">{episode.synopsis || t("coverageUi.242")}</p>
                    <div className="drama-scriptv-beats">
                        <div>
                            <span>{t("coverageUi.243")}</span>
                            <p>{episode.hook || "—"}</p>
                        </div>
                        <div>
                            <span>{t("coverageUi.244")}</span>
                            <p>{episode.cliffhanger || "—"}</p>
                        </div>
                    </div>
                    <div className="drama-scriptv-rules">
                        <span>{t("drama.create.storyboardRulesTitle")}</span>
                        <b>{storyboardSummary(storyboard, t)}</b>
                        <span>
                            · {t("dramaUi.shots", { count: shots.length })} · {(shots.reduce((sum, shot) => sum + shot.durationMs, 0) / 1000).toFixed(0)} {t("createUiSecondUnit")}
                        </span>
                    </div>
                    {detail.dialogueCheck ? <DialogueCheckNotice check={detail.dialogueCheck} busy={busy} onRescript={confirmRescript} /> : null}
                </section>

                {shots.length ? (
                    <div className="drama-screenplay">
                        {scenes.map((group, sceneIndex) => (
                            <section key={group.key} className="drama-screenplay-scene">
                                <header>
                                    <span className="drama-screenplay-scene-no">{t("dramaUi.sceneNumber", { number: sceneIndex + 1 })}</span>
                                    <strong>{group.scene || t("coverageUi.248")}</strong>
                                    <span className="drama-screenplay-scene-meta">
                                        {t("dramaUi.shots", { count: group.shots.length })} · {(group.shots.reduce((sum, shot) => sum + shot.durationMs, 0) / 1000).toFixed(0)} {t("createUiSecondUnit")}
                                    </span>
                                </header>
                                {group.shots.map((shot) => (
                                    <div
                                        key={shot.id}
                                        className="drama-screenplay-shot"
                                        role="button"
                                        tabIndex={0}
                                        aria-current={shot.id === currentId}
                                        onClick={() => {
                                            if (shot.id !== currentId) onCurrent(shot.id);
                                        }}
                                        onKeyDown={(event) => {
                                            if (event.key === "Enter" && event.target === event.currentTarget) onCurrent(shot.id);
                                        }}
                                    >
                                        <span className="drama-screenplay-index">{String(shot.position + 1).padStart(2, "0")}</span>
                                        <div className="min-w-0">
                                            {shot.id === currentId ? null : (
                                                <span className="drama-screenplay-edit" aria-hidden>
                                                    <Pencil className="size-3.5" />
                                                </span>
                                            )}
                                            <div className="drama-screenplay-tags">
                                                {shot.shotSize ? <span>{shot.shotSize}</span> : null}
                                                {shot.camera && shot.camera !== "固定" ? <span>{shot.camera}</span> : null}
                                                <span>{(shot.durationMs / 1000).toFixed(1)}s</span>
                                                {shot.transition && shot.transition !== "cut" ? <span className="is-transition">{t(shot.transition === "fadeblack" ? "dramaUi.transitionBlack" : "dramaUi.transitionWhite")}</span> : null}
                                                {shot.sourceQuote ? (
                                                    <span className="is-source">
                                                        <Quote className="size-3" />
                                                        {t("coverageUi.249")}
                                                    </span>
                                                ) : null}
                                            </div>
                                            {shot.id === currentId ? (
                                                // 选中的镜头直接在剧本里改：失焦保存，改动只让本段提示词与视频过期。
                                                <div className="drama-screenplay-editor" onClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()}>
                                                    <ShotEditor shot={shot} onPatch={(patch) => onPatchShot(shot, patch)} />
                                                    <div className="drama-screenplay-editor-actions">
                                                        <Button size="small" icon={<ArrowUpToLine className="size-3.5" />} disabled={busy} onClick={() => onInsertShot(shot, "before")}>
                                                            {t("coverageUi.250")}
                                                        </Button>
                                                        <Button size="small" icon={<ArrowDownToLine className="size-3.5" />} disabled={busy} onClick={() => onInsertShot(shot, "after")}>
                                                            {t("coverageUi.251")}
                                                        </Button>
                                                        <span className="flex-1" />
                                                        <Tooltip title={(segmentSizes.get(shot.segmentIndex) || 0) <= 1 ? t("coverageUi.252") : ""}>
                                                            <Button size="small" danger type="text" icon={<Trash2 className="size-3.5" />} disabled={busy || (segmentSizes.get(shot.segmentIndex) || 0) <= 1} onClick={() => confirmDelete(shot)}>
                                                                {t("projectUi.deleteShot")}
                                                            </Button>
                                                        </Tooltip>
                                                    </div>
                                                </div>
                                            ) : (
                                                <>
                                                    {shot.action ? <p className="drama-screenplay-action">{shot.action}</p> : null}
                                                    {shot.dialogue ? (
                                                        <div className="drama-screenplay-line">
                                                            <b>{shot.speaker || t("coverageUi.253")}</b>
                                                            <p>{shot.dialogue}</p>
                                                        </div>
                                                    ) : null}
                                                    {!shot.action && !shot.dialogue ? <p className="drama-screenplay-action is-empty">{t("coverageUi.254")}</p> : null}
                                                </>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </section>
                        ))}
                    </div>
                ) : (
                    <div className="drama-scriptv-pending">
                        <Clapperboard className="size-7" />
                        <strong>{empty.title}</strong>
                        <span>{empty.text} {t("coverageUi.255")}</span>
                        {empty.action}
                    </div>
                )}
            </div>
            <JobDetailModal projectId={projectId} job={processOpen ? detail.scriptJob : undefined} onClose={() => setProcessOpen(false)} onLocate={() => undefined} />
            {sourceOpen ? <SourcePane projectId={projectId} chapters={chapters} quote={current?.sourceQuote || ""} onEdit={setEditingChapterId} /> : null}
            <SourceEditModal
                open={Boolean(editingChapterId)}
                projectId={projectId}
                episodeId={episode.id}
                episodeFormat={format}
                chapter={chapters.find((chapter) => chapter.id === editingChapterId)}
                onClose={() => setEditingChapterId("")}
                onSaved={(rescript) => {
                    setEditingChapterId("");
                    onSourceSaved(rescript);
                }}
            />
        </div>
    );
}

/** 原文台词逐句核对：列出没有逐字出现在镜头台词里的原文台词（被删或被改写）。 */
function DialogueCheckNotice({ check, busy, onRescript }: { check: DramaDialogueCheck; busy: boolean; onRescript: () => void }) {
    const { t } = useInterfaceTranslation();
    const [expanded, setExpanded] = useState(false);
    if (!check.sourceLines) return null;
    if (!check.missingCount) {
        return (
            <div className="drama-dialogue-check is-ok">
                <CheckCircle2 className="size-3.5 shrink-0" />
                {t("dramaUi.allDialogueKept", { count: check.sourceLines })}
            </div>
        );
    }
    const shown = expanded ? check.missing : check.missing.slice(0, 3);
    return (
        <div className="drama-dialogue-check" role="status">
            <div className="drama-dialogue-check-head">
                <AlertTriangle className="size-4 shrink-0" />
                <strong>
                    {t("dramaUi.missingDialogue", { total: check.sourceLines, count: check.missingCount })}
                </strong>
                <span className="flex-1" />
                <Button size="small" disabled={busy} onClick={onRescript}>
                    {t("coverageUi.239")}
                </Button>
            </div>
            <span className="drama-dialogue-check-hint">{t("coverageUi.259")}</span>
            <ul>
                {shown.map((line) => (
                    <li key={line}>「{line}」</li>
                ))}
            </ul>
            {check.missing.length > 3 ? (
                <button type="button" className="drama-link" onClick={() => setExpanded((value) => !value)}>
                    {expanded ? t("workspaceCollapse") : t("coverageUi.260", { value0: check.missingCount > check.missing.length ? t("coverageUi.261", { value0: check.missing.length }) : "" })}
                </button>
            ) : null}
        </div>
    );
}

function SourcePane({ projectId, chapters, quote, onEdit }: { projectId: string; chapters: DramaEpisodeDetail["chapters"]; quote: string; onEdit: (chapterId: string) => void }) {
    const { t } = useInterfaceTranslation();
    const [chapterId, setChapterId] = useState(chapters[0]?.id || "");
    const activeId = chapters.some((chapter) => chapter.id === chapterId) ? chapterId : chapters[0]?.id || "";
    const query = useQuery({ queryKey: ["drama", projectId, "chapter", activeId], queryFn: ({ signal }) => getDramaChapter(projectId, activeId, signal), enabled: Boolean(activeId), staleTime: 300_000 });
    const text = query.data?.chapter.sourceText || "";
    const hit = text && quote ? locateQuote(text, quote) : -1;
    const markRef = useRef<HTMLElement>(null);
    const needleLength = hit >= 0 ? Math.min(quote.trim().length, text.length - hit) : 0;

    useEffect(() => {
        markRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
    }, [hit, activeId]);

    if (!chapters.length) {
        return (
            <aside className="drama-source">
                <div className="drama-source-empty">
                    <BookOpenText className="size-6" />
                    {t("coverageUi.262")}
                </div>
            </aside>
        );
    }
    return (
        <aside className="drama-source" aria-label={t("drama.sourceFormat.novelTitle")}>
            <header className="drama-source-head">
                <div className="drama-source-title">
                    <span className="drama-eyebrow">
                        <BookOpen className="size-3.5" />
                        {t("coverageUi.263")}
                    </span>
                    {activeId ? (
                        <Button size="small" type="text" icon={<Pencil className="size-3.5" />} onClick={() => onEdit(activeId)}>
                            {t("coverageUi.125")}
                        </Button>
                    ) : null}
                </div>
                <div className="drama-source-tabs thin-scrollbar" role="tablist" aria-label={t("coverageUi.264")}>
                    {chapters.map((chapter) => (
                        <button key={chapter.id} type="button" role="tab" aria-selected={chapter.id === activeId} onClick={() => setChapterId(chapter.id)}>
                            {chapter.title}
                            <span>{formatCount(chapter.wordCount)} {t("canvasSubtitleUi019")}</span>
                        </button>
                    ))}
                </div>
            </header>
            <div className="drama-source-text thin-scrollbar">
                {query.isLoading ? (
                    <div className="drama-source-empty">{t("coverageUi.117")}</div>
                ) : hit >= 0 ? (
                    <>
                        {text.slice(0, hit)}
                        <mark ref={markRef}>{text.slice(hit, hit + needleLength)}</mark>
                        {text.slice(hit + needleLength)}
                    </>
                ) : (
                    text
                )}
            </div>
            {quote && hit < 0 && text ? (
                <footer className="drama-source-foot">{t("coverageUi.265")}</footer>
            ) : quote ? (
                <footer className="drama-source-foot is-hit">{t("coverageUi.266")}</footer>
            ) : (
                <footer className="drama-source-foot">{t("coverageUi.267")}</footer>
            )}
        </aside>
    );
}
