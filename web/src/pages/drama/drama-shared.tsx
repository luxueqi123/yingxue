import type { InterfaceMessageKey, InterfaceTranslate } from "@/lib/interface-locale";
import { useEffect, useState, type CSSProperties, type ReactNode } from "react";

import { CachedResourceImage } from "@/components/cached-resource-image";
import { getResourceAccess, resolveResourceAccessURL, resourceFileUrl, type ResourceAccessVariant } from "@/services/api/resources";
import type { DramaCastKind, DramaEpisodeRow, DramaEpisodeStage, DramaMediaMode, DramaMediaStatus, DramaSourceFormat, DramaStatus } from "@/services/api/drama";
import { useInterfaceTranslation } from "@/stores/use-interface-locale-store";

export const PIPELINE_STEPS: Array<{ key: Exclude<DramaEpisodeStage, "queued" | "review" | "done">; label: InterfaceMessageKey }> = [
    { key: "script", label: "previewScripts" },
    { key: "prompts", label: "coverageUi.054" },
    { key: "video", label: "contextVideo" },
    { key: "render", label: "previewFilms" },
];

const STAGE_INDEX: Record<DramaEpisodeStage, number> = { queued: -1, script: 0, prompts: 1, review: 2, video: 2, render: 3, done: 4 };

export const STAGE_LABEL: Record<DramaEpisodeStage, InterfaceMessageKey> = {
    queued: "tasksUi.statusQueued",
    script: "dramaUi.adaptScript",
    prompts: "dramaUi.writeSegmentPrompts",
    review: "dramaUi.awaitReview",
    video: "entryGenerateVideo",
    render: "drama.create.stepAssembleFinal",
    done: "agentChromeStatusCompleted",
};

export const STATUS_LABEL: Record<DramaStatus, InterfaceMessageKey> = {
    draft: "canvasCompleteUi.notStarted",
    running: "projectUi.summaryStageInProduction",
    paused: "coverageUi.058",
    completed: "agentChromeStatusCompleted",
};

export const CAST_KIND_LABEL: Record<DramaCastKind | "image", InterfaceMessageKey> = { character: "contextCharacterCategory", prop: "contextPropCategory", scene: "contextEnvironmentCategory", image: "createUiImage" };

/** 生成节奏的文案：新建页与设置页共用。 */
export const MEDIA_MODE_LABEL: Record<DramaMediaMode, { title: InterfaceMessageKey; detail: InterfaceMessageKey }> = {
    manual: { title: "drama.create.mediaManualTitle", detail: "drama.create.mediaManualDetail" },
    auto: { title: "drama.create.mediaAutoTitle", detail: "drama.create.mediaAutoDetail" },
};

/** 素材类型文案：新建页、追加单集与原文编辑共用。placeholder 是粘贴框的格式提示。 */
export const SOURCE_FORMAT_LABEL: Record<DramaSourceFormat, { title: InterfaceMessageKey; detail: InterfaceMessageKey; placeholder: InterfaceMessageKey; guide: InterfaceMessageKey[] }> = {
    novel: {
        title: "drama.sourceFormat.novelTitle",
        detail: "drama.sourceFormat.novelDetail",
        placeholder: "coverageUi.055",
        guide: ["dramaUi.novelGuideDialogue", "dramaUi.novelGuideAction", "dramaUi.novelGuideNarration"],
    },
    script: {
        title: "previewScripts",
        detail: "drama.sourceFormat.scriptDetail",
        placeholder: "dramaUi.scriptExample",
        guide: ["dramaUi.scriptGuideLines", "dramaUi.scriptGuideAction", "dramaUi.scriptGuideNarration"],
    },
    storyboard: {
        title: "settingsMemoryCategoryStoryboard",
        detail: "drama.sourceFormat.storyboardDetail",
        placeholder: "dramaUi.storyboardExample",
        guide: ["dramaUi.storyboardGuideColumns", "dramaUi.storyboardGuideImport", "dramaUi.storyboardGuideLines"],
    },
};

export const SOURCE_FORMAT_MESSAGE_KEYS = {
    novel: { title: "drama.sourceFormat.novelTitle", detail: "drama.sourceFormat.novelDetail" },
    script: { title: "drama.sourceFormat.scriptTitle", detail: "drama.sourceFormat.scriptDetail" },
    storyboard: { title: "drama.sourceFormat.storyboardTitle", detail: "drama.sourceFormat.storyboardDetail" },
} as const satisfies Record<DramaSourceFormat, { title: string; detail: string }>;

export function sourceFormatOf(value: string | undefined): DramaSourceFormat {
    return value === "script" || value === "storyboard" ? value : "novel";
}

export function SourceFormatPicker({ value, onChange, disabled, row }: { value: DramaSourceFormat; onChange: (value: DramaSourceFormat) => void; disabled?: boolean; row?: boolean }) {
    const { t } = useInterfaceTranslation();
    return (
        <div className={`drama-media-modes ${row ? "is-row" : ""}`} role="radiogroup" aria-label={t("drama.sourceFormat.pickerAria")}>
            {(Object.keys(SOURCE_FORMAT_LABEL) as DramaSourceFormat[]).map((format) => (
                <button key={format} type="button" role="radio" aria-checked={value === format} className="drama-media-mode" disabled={disabled} onClick={() => onChange(format)}>
                    <span className="drama-radio" />
                    <span>
                        <strong>{t(SOURCE_FORMAT_MESSAGE_KEYS[format].title)}</strong>
                        <span>{t(SOURCE_FORMAT_MESSAGE_KEYS[format].detail)}</span>
                    </span>
                </button>
            ))}
        </div>
    );
}

export type EpisodeTone = "done" | "active" | "review" | "error" | "idle" | "ready";

export function episodeTone(episode: DramaEpisodeRow): EpisodeTone {
    if (episode.error || episode.stats.failed > 0) return "error";
    if (episode.awaitingMedia) return "ready";
    if (episode.stage === "review") return "review";
    if (episode.stage === "done" && !episode.finalStale) return "done";
    if (episode.stage === "queued") return "idle";
    return "active";
}

export function episodeStatusText(episode: DramaEpisodeRow, t: InterfaceTranslate) {
    if (episode.error) return t("projectUi.needsAttention");
    if (episode.awaitingMedia) return t("dramaUi.episodeStatusShots", { count: episode.shotCount });
    if (episode.stage === "done" && episode.finalStale) return t("dramaUi.episodeStatusStale");
    const { stats } = episode;
    switch (episode.stage) {
        case "prompts":
            return stats.segments ? t("coverageUi.358", { value0: stats.promptReady, value1: stats.segments }) : t(STAGE_LABEL.prompts);
        case "video":
            return stats.segments ? t("coverageUi.359", { value0: stats.videoReady, value1: stats.segments }) : t(STAGE_LABEL.video);
        case "done":
            return t("dramaUi.episodeStatusDone", { duration: formatDuration(episode.durationMs) });
    }
    return t(STAGE_LABEL[episode.stage]);
}

/** 每个流水线步骤的完成度：0 未开始、0-1 进行中、1 完成。 */
export function stepProgress(episode: DramaEpisodeRow, step: (typeof PIPELINE_STEPS)[number]["key"]) {
    const current = STAGE_INDEX[episode.stage];
    const index = PIPELINE_STEPS.findIndex((item) => item.key === step);
    if (episode.stage === "done" && !episode.finalStale) return 1;
    if (current > index) return 1;
    if (current < index) return 0;
    const total = Math.max(episode.stats.segments, 1);
    if (step === "prompts") return Math.max(0.08, episode.stats.promptReady / total);
    if (step === "video") return Math.max(0.08, episode.stats.videoReady / total);
    return 0.35;
}

export function StagePips({ episode, size = "sm" }: { episode: DramaEpisodeRow; size?: "sm" | "md" }) {
    const { t } = useInterfaceTranslation();
    const tone = episodeTone(episode);
    return (
        <span className={`drama-pips is-${size} is-${tone}`} aria-hidden>
            {PIPELINE_STEPS.map((step) => {
                const progress = stepProgress(episode, step.key);
                return (
                    <span key={step.key} className="drama-pip" title={step.label}>
                        <span className="drama-pip-fill" style={{ "--pip": progress } as CSSProperties} />
                    </span>
                );
            })}
        </span>
    );
}

export function formatDuration(ms: number) {
    const seconds = Math.max(0, Math.round(ms / 1000));
    const minutes = Math.floor(seconds / 60);
    return minutes ? `${minutes}分${String(seconds % 60).padStart(2, "0")}秒` : `${seconds}秒`;
}

export function formatClock(ms: number) {
    const seconds = Math.max(0, ms / 1000);
    return `${Math.floor(seconds / 60)}:${(seconds % 60).toFixed(1).padStart(4, "0")}`;
}

export function formatCredits(microcredits: number) {
    const credits = microcredits / 1_000_000;
    if (credits >= 10_000) return `${(credits / 10_000).toFixed(credits >= 100_000 ? 0 : 1)}万`;
    return credits.toLocaleString("zh-CN", { maximumFractionDigits: credits >= 100 ? 0 : 2 });
}

export function formatCount(value: number) {
    if (value >= 10_000) return `${(value / 10_000).toFixed(value >= 100_000 ? 0 : 1)}万`;
    return value.toLocaleString("zh-CN");
}

export function aspectRatioValue(aspect: string) {
    const [width, height] = aspect.split(":").map(Number);
    return width && height ? `${width} / ${height}` : "9 / 16";
}

export function resourceUrl(id?: string) {
    return id ? resourceFileUrl(id) : "";
}

/** 加载失败后的自动重试间隔：访问地址过期、缩略图尚未生成或解码排队超时多是暂时的。 */
const THUMB_RETRY_DELAYS_MS = [1500, 5000];

/**
 * 资源缩略图。加载失败会自动重试两次，之后显示 failed（缺省为 fallback）；
 * loading 是加载中的占位（缺省为 fallback）。
 */
export function MediaThumb({ resourceId, alt, className, fallback, loading, failed }: { resourceId?: string; alt: string; className?: string; fallback?: ReactNode; loading?: ReactNode; failed?: ReactNode }) {
    const [retry, setRetry] = useState({ resourceId, attempt: 0 });
    const attempt = retry.resourceId === resourceId ? retry.attempt : 0;
    if (!resourceId) return <>{fallback ?? null}</>;
    const pending = loading ?? fallback ?? null;
    const delay = THUMB_RETRY_DELAYS_MS[attempt];
    const failure =
        delay === undefined ? (
            (failed ?? fallback ?? null)
        ) : (
            <ThumbRetry delayMs={delay} onRetry={() => setRetry({ resourceId, attempt: attempt + 1 })}>
                {pending}
            </ThumbRetry>
        );
    return <CachedResourceImage key={`${resourceId}:${attempt}`} storageKey={`resource:${resourceId}`} alt={alt} className={className} variant="thumbnail" fallback={failure} loadingFallback={pending} draggable={false} />;
}

function ThumbRetry({ delayMs, onRetry, children }: { delayMs: number; onRetry: () => void; children: ReactNode }) {
    const [handler] = useState(() => onRetry);
    useEffect(() => {
        const timer = window.setTimeout(handler, delayMs);
        return () => window.clearTimeout(timer);
    }, [delayMs, handler]);
    return <>{children}</>;
}

export function mediaBusy(status: DramaMediaStatus) {
    return status === "queued" || status === "running";
}

export function parseList(raw: string | undefined): string[] {
    try {
        const value: unknown = JSON.parse(raw || "[]");
        return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
    } catch {
        return [];
    }
}

/** 把 SRT 转成浏览器 <track> 需要的 WebVTT。 */
export function srtToVtt(srt: string) {
    return `WEBVTT\n\n${srt.replace(/\r/g, "").replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, "$1.$2")}`;
}

/** 解析资源的授权播放地址；视频优先使用浏览器兼容的播放副本。 */
export function useResourceMediaUrl(resourceId: string | undefined, variant: ResourceAccessVariant = "original") {
    const [url, setUrl] = useState("");
    useEffect(() => {
        setUrl("");
        if (!resourceId) return;
        let active = true;
        void getResourceAccess(`resource:${resourceId}`, "display", variant)
            .catch(() => getResourceAccess(`resource:${resourceId}`, "display", "original"))
            .then((access) => {
                if (active) setUrl(resolveResourceAccessURL(access.url));
            })
            .catch(() => {
                if (active) setUrl(resourceUrl(resourceId));
            });
        return () => {
            active = false;
        };
    }, [resourceId, variant]);
    return url;
}

export async function downloadResource(resourceId: string, fileName: string) {
    const access = await getResourceAccess(`resource:${resourceId}`, "download", "original", fileName);
    const anchor = document.createElement("a");
    anchor.href = resolveResourceAccessURL(access.url);
    anchor.download = fileName;
    anchor.rel = "noopener";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
}

export function downloadText(content: string, fileName: string, mime = "text/plain") {
    const url = URL.createObjectURL(new Blob([content], { type: `${mime};charset=utf-8` }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = fileName;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
