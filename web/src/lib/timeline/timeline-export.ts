// 时间线导出复用原生编码与元数据重试，保留媒体探测、串行执行及字幕完整性校验。
import { fetchFile } from "@ffmpeg/util";
import { interfaceTranslator, loadInterfaceLocale, type InterfaceLocale, type InterfaceTranslate } from "@/lib/interface-locale";
import { currentLocale } from "@/i18n";

import { withFFmpeg } from "@/lib/canvas/canvas-video-merge";
import { getMediaBlob } from "@/services/file-storage";
import type { TimelineProject } from "@/types/timeline";
import { execTimelineOutput, type TimelineExportProgress, type TimelineExportResult } from "./timeline-export-runner";
import { buildTimelineRenderPlan, type TimelineRenderContext, type TimelineRenderSource, SUBTITLE_FILE, SUBTITLE_FONT_FILE, TIMELINE_STEP_MESSAGE_KEYS, buildSubtitleSrt, getOrderedSubtitleClips } from "./timeline-to-ffmpeg";
import { parseTimelineMediaProbe } from "./timeline-media-probe";

export type { TimelineExportProgress, TimelineExportResult } from "./timeline-export-runner";

export type TimelineExportOptions = {
    onProgress?: (progress: TimelineExportProgress) => void;
    context?: Partial<TimelineRenderContext>;
    locale?: InterfaceLocale;
};

async function fetchSourceBlob(source: TimelineRenderSource, t: InterfaceTranslate): Promise<Blob> {
    if (source.storageKey) {
        const stored = await getMediaBlob(source.storageKey);
        if (stored) return stored;
    }
    if (source.url) {
        const response = await fetch(source.url);
        if (!response.ok) throw new Error(t("exportMediaFailed", { status: response.status }));
        return response.blob();
    }
    throw new Error(t("exportMediaMissing", { name: source.nodeId }));
}

/** 导出时间线为 MP4：写媒体 → 按计划逐步执行 → 返回成片与降级提示（下载由调用方处理） */
export async function exportTimelineToMp4(timeline: TimelineProject, sources: TimelineRenderSource[], options: TimelineExportOptions = {}): Promise<TimelineExportResult> {
    const { onProgress, context } = options;
    const locale = options.locale ?? currentLocale();
    await loadInterfaceLocale(locale);
    const t = interfaceTranslator(locale);
    onProgress?.({ phase: "loading", percent: 0, detail: t("exportLoading") });
    let plan = buildTimelineRenderPlan(timeline, sources, context);
    if (!plan.concatEntries.length) throw new Error(t("exportEmpty"));
    return withFFmpeg(
        async (ffmpeg) => {
            const writtenFiles = new Set<string>();
            const warnings: string[] = [];

            try {
                if (plan.steps.some(step => step.kind === "burn")) {
                    onProgress?.({ phase: "reading", percent: 2, detail: t("exportLoadingFont") });
                    const fontResponse = await fetch(`${import.meta.env.BASE_URL || "/"}fonts/subtitles/${SUBTITLE_FONT_FILE}`, { cache: "force-cache" });
                    if (!fontResponse.ok) throw new Error(t("exportFontFailed", { status: fontResponse.status }));
                    const fontBytes = new Uint8Array(await fontResponse.arrayBuffer());
                    if (fontBytes.length < 4 || String.fromCharCode(...fontBytes.subarray(0, 4)) !== "OTTO") throw new Error(t("exportFontInvalid"));
                    writtenFiles.add(SUBTITLE_FONT_FILE);
                    await ffmpeg.writeFile(SUBTITLE_FONT_FILE, fontBytes);
                }
                const probedSources: TimelineRenderSource[] = [];
                for (const source of sources) {
                    onProgress?.({ phase: "reading", percent: 5, detail: t("exportReadingFile", { name: source.fileName }) });
                    const blob = await fetchSourceBlob(source, t);
                    await ffmpeg.writeFile(source.fileName, await fetchFile(blob));
                    writtenFiles.add(source.fileName);
                    const probeFile = `probe-${probedSources.length}.json`;
                    writtenFiles.add(probeFile);
                    // Remove stale output before probing; a failed run must never reuse old evidence.
                    await ffmpeg.deleteFile(probeFile).catch(() => undefined);
                    const probeCode = await ffmpeg.ffprobe(["-v", "error", "-show_error", "-show_entries", "stream=index,codec_type:format=format_name,nb_streams", "-of", "json", source.fileName, "-o", probeFile]);
                    if (probeCode !== 0 && probeCode !== -1) throw new Error(t("exportProbeFailed", { name: source.nodeId }));
                    const probeData = await ffmpeg.readFile(probeFile).catch(() => { throw new Error(t("exportProbeMissing", { name: source.nodeId })); });
                    const hasAudio = parseTimelineMediaProbe(probeCode, typeof probeData === "string" ? probeData : new TextDecoder().decode(probeData));
                    probedSources.push({ ...source, hasAudio });
                }
                plan = buildTimelineRenderPlan(timeline, probedSources, context);

                const executableSteps = plan.steps.filter((step) => step.kind !== "subtitle");
                let stepIndex = 0;
                for (const step of plan.steps) {
                    // 编码失败也可能留下部分输出，必须纳入 finally 清理。
                    writtenFiles.add(step.output);
                    if (step.kind === "subtitle") {
                        const srt = buildSubtitleSrt(getOrderedSubtitleClips(timeline));
                        if (srt) {
                            await ffmpeg.writeFile(SUBTITLE_FILE, new TextEncoder().encode(srt));
                            writtenFiles.add(SUBTITLE_FILE);
                        }
                        continue;
                    }
                    if (step.args.includes("concat.txt")) {
                        const content = plan.concatEntries.map((file) => "file '" + file + "'").join("\n");
                        await ffmpeg.writeFile("concat.txt", new TextEncoder().encode(content));
                        writtenFiles.add("concat.txt");
                    }
                    onProgress?.({ phase: "encoding", percent: Math.round(10 + (stepIndex / Math.max(1, executableSteps.length)) * 75), detail: t(TIMELINE_STEP_MESSAGE_KEYS[step.kind]) });

                    if (step.kind === "burn") {
                        try {
                            const result = await execTimelineOutput(ffmpeg, step.args, step.argsWithoutMetadata, warnings);
                            if (result.exitCode !== 0) throw new Error("burn exit " + result.exitCode);
                        } catch (cause) {
                            throw new Error(t("exportBurnFailed"), { cause });
                        }
                    } else {
                        const result = await execTimelineOutput(ffmpeg, step.args, step.argsWithoutMetadata, warnings);
                        if (result.exitCode !== 0) throw new Error(t("exportStepFailed", { step: t(TIMELINE_STEP_MESSAGE_KEYS[step.kind]) }));
                    }
                    writtenFiles.add(step.output);
                    stepIndex += 1;
                }

                const output = await ffmpeg.readFile(plan.finalOutput);
                onProgress?.({ phase: "encoding", percent: 100, detail: t("exportComplete") });
                return { blob: new Blob([output as BlobPart], { type: "video/mp4" }), subtitlesBurned: plan.steps.some(step => step.kind === "burn"), warnings };
            } finally {
                await Promise.all([...writtenFiles, "concat.txt", plan.finalOutput].map((file) => ffmpeg.deleteFile(file).catch(() => undefined)));
            }
        },
        ({ phase, progress }) => onProgress?.({ phase: phase === "loading" ? "loading" : "reading", percent: progress, detail: t(phase === "loading" ? "exportLoading" : "exportReading") }),
    );
}
