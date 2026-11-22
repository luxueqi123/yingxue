import type { InterfaceTranslate } from "@/lib/interface-locale";
import { useInterfaceTranslation } from "@/stores/use-interface-locale-store";
import { AntTooltip as Tooltip } from "@/components/ui/base/tooltip/ant-tooltip";
import { AlertCircle, Check, Film, Loader2 } from "lucide-react";

import type { DramaCast, DramaSegment } from "@/services/api/drama";

import { aspectRatioValue, CAST_KIND_LABEL, mediaBusy, MediaThumb, useResourceMediaUrl } from "../drama-shared";

// 剧情段的共用展示：状态、视频、生成依据（首帧 + 参考图）。分镜卡片与镜头弹窗共用，保证两处说法一致。

export function secondsLabel(ms: number) {
    const seconds = Math.round(ms / 100) / 10;
    return `${Number.isInteger(seconds) ? seconds : seconds.toFixed(1)}s`;
}

export type SegmentTone = "idle" | "busy" | "ready" | "stale" | "failed" | "blocked";

/** 等待原因的短标签：取冒号或括号前的部分，完整原因放在提示里。 */
export function videoWaitLabel(wait: string) {
    return wait.split(/[：（]/)[0] || wait;
}

/** 剧情段当前处于哪一步，以及用户下一步该做什么。detail 是需要悬停查看的完整原因。 */
export function segmentState(segment: DramaSegment, t: InterfaceTranslate): { tone: SegmentTone; label: string; detail?: string } {
    const writing = segment.promptStatus === "queued" || segment.promptStatus === "running";
    if (segment.promptStatus === "failed") return { tone: "failed", label: t("coverageUi.319") };
    // 视频已入库但尾帧等后处理失败：视频本身可看，重试只重新处理已有视频。
    if (segment.videoStatus === "failed") return segment.videoReprocessable ? { tone: "failed", label: t("coverageUi.320") } : { tone: "failed", label: t("coverageUi.272") };
    if (writing) return { tone: "busy", label: t("coverageUi.321") };
    if (segment.promptStatus === "none") return { tone: "idle", label: t("coverageUi.322") };
    if (segment.promptStatus === "stale" && !segment.custom) return { tone: "stale", label: t("coverageUi.323") };
    // 已请求但调度还没提交：显示真实的等待原因，不冒充“生成中”。
    if (segment.videoStatus === "queued" && segment.videoWait) return { tone: "blocked", label: videoWaitLabel(segment.videoWait), detail: segment.videoWait };
    if (segment.videoStatus === "queued" && segment.videoJob?.status !== "running") return { tone: "busy", label: t("coverageUi.324") };
    if (mediaBusy(segment.videoStatus)) return segment.request.firstFramePending ? { tone: "blocked", label: t("coverageUi.325") } : { tone: "busy", label: t("coverageUi.326") };
    if (segment.videoStatus === "ready") return { tone: "ready", label: t("coverageUi.327") };
    if (segment.videoStatus === "stale") return { tone: "stale", label: t("coverageUi.328") };
    return { tone: "idle", label: t("coverageUi.329") };
}

export function promptReady(segment: DramaSegment) {
    return segment.custom || segment.promptStatus === "ready";
}

export function SegmentStatus({ segment }: { segment: DramaSegment }) {
    const { t } = useInterfaceTranslation();
    const state = segmentState(segment, t);
    return (
        <span className={`drama-sg-status is-${state.tone}`} title={state.detail}>
            {state.tone === "busy" ? (
                <Loader2 className="size-3 animate-spin" aria-hidden />
            ) : state.tone === "failed" ? (
                <AlertCircle className="size-3" aria-hidden />
            ) : state.tone === "ready" ? (
                <Check className="size-3" aria-hidden />
            ) : (
                <i aria-hidden />
            )}
            {state.label}
        </span>
    );
}

export function SegmentVideo({ segment, aspectRatio, className = "" }: { segment: DramaSegment; aspectRatio: string; className?: string }) {
    const { t } = useInterfaceTranslation();
    const viewable = segment.videoStatus === "ready" || segment.videoStatus === "stale" || segment.videoStatus === "failed";
    const url = useResourceMediaUrl(viewable ? segment.videoResourceId : undefined, "playback");
    const state = segmentState(segment, t);
    return (
        <div className={`drama-sg-video ${className}`} style={{ aspectRatio: aspectRatioValue(aspectRatio) }}>
            {url ? (
                <video key={url} src={url} controls playsInline preload="metadata" />
            ) : (
                <span className={`drama-sg-video-empty ${state.tone === "busy" ? "is-busy" : ""}`}>
                    <Film className="size-5" aria-hidden />
                    <span>{state.label}</span>
                    <small>{secondsLabel(segment.durationMs)} {t("coverageUi.330")}</small>
                </span>
            )}
        </div>
    );
}

/**
 * 生成依据：首帧（第 2 段起是上一段视频的最后一帧）和随请求发送的参考图。
 * 参考图编号与提示词里的“参考图N”一致；未附图的设定说明原因。
 */
/** 参考图未随请求发送的原因；与后端 prepareDramaSegment 的判断一致。 */
export function referenceMissingReason(segment: DramaSegment, cast: DramaCast | undefined, t: InterfaceTranslate) {
    if (cast?.imageStatus === "failed") return t("coverageUi.169");
    if (mediaBusy(cast?.imageStatus || "")) return t("helperUi.referenceGenerating");
    if (!cast?.imageResourceId || cast.imageStatus !== "ready") return t("helperUi.referenceNotReady");
    if (segment.request.operation === "text_to_video") return t("helperUi.textOnlyReferences");
    return t(segment.request.referenceLimited ? "helperUi.segmentReferenceLimit" : "helperUi.modelReferenceLimit");
}

export function SegmentInputs({ segment, castById, compact = false, frameOnly = false, onOpenCast }: { segment: DramaSegment; castById: Map<string, DramaCast>; compact?: boolean; frameOnly?: boolean; onOpenCast?: (id: string) => void }) {
    const { t } = useInterfaceTranslation();
    const { request } = segment;
    const first = segment.index === 0 && !request.firstFrameResourceId && !request.firstFramePending;
    return (
        <div className={`drama-sg-inputs ${compact ? "is-compact" : ""}`}>
            <Tooltip title={t("coverageUi.331", { value0: first ? t("coverageUi.332") : request.firstFrameResourceId ? t("coverageUi.333", { value0: segment.index }) : t("coverageUi.334", { value0: segment.index }) })} mouseEnterDelay={0.3}>
                <div className="drama-sg-input is-frame">
                    <span className="drama-sg-thumb is-frame">
                        {request.firstFrameResourceId ? <MediaThumb resourceId={request.firstFrameResourceId} alt={t("coverageUi.335")} /> : <span className="drama-sg-thumb-empty">{first ? t("coverageUi.336") : t("projectUi.generationStatusWaiting")}</span>}
                        <em>{t("workbenchUi.firstFrame")}</em>
                    </span>
                    {compact ? null : (
                        <span className="drama-sg-input-text">
                            <b>{t("workbenchUi.firstFrame")}</b>
                            <small>{first ? t("coverageUi.337") : request.firstFrameResourceId ? t("coverageUi.338", { value0: segment.index }) : t("coverageUi.339", { value0: segment.index })}</small>
                        </span>
                    )}
                </div>
            </Tooltip>
            {(frameOnly ? [] : request.references).map((ref) => {
                const cast = castById.get(ref.castId);
                const reason = ref.sent ? "" : referenceMissingReason(segment, cast, t);
                const body = (
                    <>
                        <span className={`drama-sg-thumb is-wide ${ref.sent ? "" : "is-missing"}`}>
                            {cast?.imageResourceId ? <MediaThumb resourceId={cast.imageResourceId} alt={ref.name} /> : <span className="drama-sg-thumb-empty">{t(CAST_KIND_LABEL[ref.kind])}</span>}
                            <em>{ref.label.replace("参考图", "图")}</em>
                        </span>
                        {compact ? null : (
                            <span className="drama-sg-input-text">
                                <b>{ref.name}</b>
                                <small>
                                    {t(CAST_KIND_LABEL[ref.kind])} · {ref.sent ? t("coverageUi.287") : t("coverageUi.288", { value0: reason })}
                                </small>
                            </span>
                        )}
                    </>
                );
                return (
                    <Tooltip key={ref.castId} title={`${ref.label} · ${t(CAST_KIND_LABEL[ref.kind])} · ${ref.name}${ref.sent ? "" : t("coverageUi.341", { value0: reason })}`} mouseEnterDelay={0.3}>
                        {onOpenCast ? (
                            <button type="button" className={`drama-sg-input ${ref.sent ? "" : "is-missing"}`} onClick={() => onOpenCast(ref.castId)}>
                                {body}
                            </button>
                        ) : (
                            <span className={`drama-sg-input ${ref.sent ? "" : "is-missing"}`}>{body}</span>
                        )}
                    </Tooltip>
                );
            })}
        </div>
    );
}
