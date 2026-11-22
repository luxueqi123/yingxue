import { useInterfaceTranslation } from "@/stores/use-interface-locale-store";
import { Typography } from "antd";
import { useState } from "react";
import { MediaPreview } from "@/components/media-preview";
import { normalizeBackendText } from "@/lib/generation-result";
import { resourceFileUrl, resourceIdFromStorageKey } from "@/services/api/resources";
import type { TimelineRenderResult } from "@/services/api/timeline-tasks";

export function TaskResultMedia({ value, taskType }: { value?: string; taskType: string }) {
    const { t } = useInterfaceTranslation();
    if (taskType === "timeline_render") {
        const result = timelineRenderResult(value);
        if (!result) return null;
        const fileName = result.fileName || "timeline.mp4";
        const url = resourceFileUrl(result.resourceId);
        return <div>
            <Typography.Text strong>{t("creationPageGeneratedResultAlt")}</Typography.Text>
            <MediaPreview src={url} kind="video" alt={t("tasksUi.timelineVideoAlt")} controls
                className="task-result-media is-video" fallbackClassName="task-result-media is-video" />
            <div className="mt-2 flex flex-wrap gap-3">
                <a href={url} download={fileName}>{t("tasksUi.downloadFile", { format: "MP4" })}</a>
                {result.subtitleSrt ? <a href={`data:application/x-subrip;charset=utf-8,${encodeURIComponent(result.subtitleSrt)}`}
                    download={`${fileName.replace(/\.[^.]+$/, "")}.srt`}>{t("tasksUi.downloadFile", { format: "SRT" })}</a> : null}
            </div>
            {result.subtitleSrt ? <p className="mt-2 text-xs text-foreground/60">{t("tasksUi.subtitleSeparateFileNote")}</p> : null}
        </div>;
    }
    const media = taskResultMedia(value, taskType);
    if (!media.length) return null;
    return (
        <div>
            <Typography.Text strong>{t("creationPageGeneratedResultAlt")}</Typography.Text>
            <div className="mt-2 grid max-h-[360px] grid-cols-2 gap-2 overflow-auto rounded-lg bg-stone-950 p-2 md:grid-cols-3">
                {media.map(({ url, kind }, index) => {
                    if (kind === "audio") return <TaskResultAudio key={url} url={url} label={t("tasksUi.generatedResultNumber", { count: index + 1 })} />;
                    const isVideo = kind === "video";
                    return <MediaPreview key={`${url}-${index}`} src={url} kind={isVideo ? "video" : "image"}
                        alt={t("tasksUi.generatedResultNumber", { count: index + 1 })} controls={isVideo}
                        className={isVideo ? "task-result-media is-video" : "task-result-media"}
                        fallbackClassName={isVideo ? "task-result-media is-video" : "task-result-media"} />;
                })}
            </div>
        </div>
    );
}

function timelineRenderResult(value?: string): TimelineRenderResult | null {
    if (!value) return null;
    try {
        const result: unknown = JSON.parse(value);
        if (!result || typeof result !== "object" || Array.isArray(result)) return null;
        const fields = result as Record<string, unknown>;
        if (typeof fields.resourceId !== "string" || !fields.resourceId.trim()
            || (fields.fileName !== undefined && typeof fields.fileName !== "string")
            || (fields.subtitleSrt !== undefined && typeof fields.subtitleSrt !== "string")) return null;
        return { resourceId: fields.resourceId, fileName: fields.fileName, subtitleSrt: fields.subtitleSrt };
    } catch {
        return null;
    }
}

function parseResult(value?: string): unknown {
    if (!value) return undefined;
    try { return JSON.parse(value); } catch { return undefined; }
}

export function taskResultText(value?: string): string | undefined {
    const parsed = parseResult(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? normalizeBackendText((parsed as Record<string, unknown>).text) : undefined;
}

export type TaskMediaResult = { url: string; kind: "image" | "video" | "audio" };

export function taskResultMedia(value: string | undefined, taskType: string): TaskMediaResult[] {
    if (/text|timeline_render/.test(taskType)) return [];
    const media: TaskMediaResult[] = [];
    const seen = new Set<string>();
    const defaultKind = taskType.includes("audio") ? "audio" : taskType.includes("video") ? "video" : "image";
    const visit = (item: unknown, kind: TaskMediaResult["kind"]) => {
        if (Array.isArray(item)) return item.forEach(entry => visit(entry, kind));
        if (item && typeof item === "object") {
            const fields = item as Record<string, unknown>;
            const declaredKind = typeof fields.mimeType === "string" ? fields.mimeType.toLowerCase().split("/")[0] : fields.mode ?? fields.kind;
            const outputKind = declaredKind === "image" || declaredKind === "video" || declaredKind === "audio" ? declaredKind : kind;
            const resourceId = (typeof fields.storageKey === "string" ? resourceIdFromStorageKey(fields.storageKey) : "")
                || (typeof fields.resourceId === "string" ? fields.resourceId.trim() : "");
            if (resourceId) return visit(resourceFileUrl(resourceId), outputKind);
            for (const key of ["dataUrl", "url", "output", "result", "data", "images", "image", "videos", "video", "audios", "audio"]) {
                if (key in fields) visit(fields[key], /audios?/.test(key) ? "audio" : /videos?/.test(key) ? "video" : /images?/.test(key) ? "image" : outputKind);
            }
            return;
        }
        if (typeof item !== "string" || !/^(https?:\/\/|blob:|data:(image|video|audio)\/|\/api\/resources\/)/i.test(item)) return;
        const actualKind = /^data:audio\/|\.(mp3|wav|ogg|m4a|aac|flac)(?:$|[?#])/i.test(item) ? "audio"
            : /^data:video\/|\.(mp4|webm|mov)(?:$|[?#])/i.test(item) ? "video" : kind;
        if (!seen.has(item)) {
            seen.add(item);
            media.push({ url: item, kind: actualKind });
        }
    };
    visit(parseResult(value) ?? value, defaultKind);
    return media;
}

export function TaskResultAudio({ url, label }: { url: string; label: string }) {
    const { t } = useInterfaceTranslation();
    const [failed, setFailed] = useState(false);
    return failed ? <div role="status" className="task-detail-empty">{t("library.tasks.row.previewUnavailable")}</div>
        : <audio src={url} controls preload="metadata" aria-label={label} className="w-full" onError={() => setFailed(true)} />;
}
