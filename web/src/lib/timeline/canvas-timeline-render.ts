import type { CanvasNodeData } from "@/types/canvas";
import type { TimelineProject } from "@/types/timeline";
import { interfaceTranslator, type InterfaceLocale } from "@/lib/interface-locale";

export function prepareCanvasTimelineRender(timeline: TimelineProject, nodes: CanvasNodeData[], locale: InterfaceLocale = "zh-CN"): TimelineProject {
    const t = interfaceTranslator(locale);
    const byId = new Map(nodes.map(node => [node.id, node]));
    const hidden = new Set(timeline.tracks.filter(track => track.visible === false).map(track => track.id));
    return { ...timeline, clips: timeline.clips.map(clip => {
        if (hidden.has(clip.trackId) || !["video", "audio", "image"].includes(clip.kind)) return clip;
        const node = byId.get(clip.nodeId);
        const media = clip.directMedia ?? (node && node.type === clip.kind ? {
            id: node.id, kind: clip.kind as "video" | "audio" | "image", title: node.title,
            storageKey: node.metadata?.storageKey,
        } : undefined);
        // 服务端只消费资源键；缺失引用会被旧渲染器当作黑场，提交前必须拒绝。
        if (!media || media.kind !== clip.kind || !/^resource:[^\s/:]+$/.test(media.storageKey ?? "")) {
            throw new Error(t("timelineServerSourceRequired", { name: clip.title || clip.nodeId }));
        }
        return { ...clip, directMedia: { ...media } };
    }) };
}
