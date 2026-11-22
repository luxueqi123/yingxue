import { interfaceTranslator, type InterfaceTranslate } from "@/lib/interface-locale";
import type { LibTVImportResult } from "@/services/api/libtv";
import type { CanvasProject } from "@/stores/canvas/use-canvas-store";
import { CanvasNodeType, type CanvasConnection, type CanvasNodeData, type ViewportTransform } from "@/types/canvas";

const defaultTranslate = interfaceTranslator("zh-CN");

const LIBTV_PROJECT_UUID_PATTERN = /^[a-f0-9]{32}$/i;
const LIBTV_RESOURCE_HOST = "libtv-res.liblib.art";
const LIBTV_PREVIEW_WIDTH = 960;
export const LIBTV_MAX_JSON_BYTES = 8 * 1024 * 1024;

export function assertLibTVImportFitsCanvas(project: Pick<CanvasProject, "nodes" | "connections"> & Partial<CanvasProject>, nodes: CanvasNodeData[], connections: CanvasConnection[], t: InterfaceTranslate = defaultTranslate) {
    const payload = JSON.stringify({ project: { ...project, nodes: [...project.nodes, ...nodes], connections: [...project.connections, ...connections] } });
    if (new TextEncoder().encode(payload).length > 5 * 1024 * 1024) {
        throw new Error(t("canvasImportSaveLimit"));
    }
}

export function getLibTVImportReport(result: LibTVImportResult, t: InterfaceTranslate = defaultTranslate) {
    return [
        ...result.warnings.map((item, index) => ({ key: `warning-${index}`, label: item.id ? `${t("canvasImportWarning")} · ${item.id}` : t("canvasImportWarning"), message: item.message })),
        ...result.skippedNodes.map((item, index) => ({ key: `node-${index}`, label: `${t("canvasImportSkippedNode")} · ${[item.name, item.id].filter(Boolean).join(" · ") || t("canvasImportUnnamedNode")}`, message: item.reason })),
        ...result.skippedConnections.map((item, index) => ({ key: `connection-${index}`, label: `${t("canvasImportSkippedConnection")} · ${item.id || t("canvasImportUnnamedConnection")}`, message: item.reason })),
    ];
}

export async function readLibTVJSONFile(file: Pick<File, "name" | "size" | "text">, t: InterfaceTranslate = defaultTranslate) {
    if (!file.name.toLowerCase().endsWith(".json")) throw new Error(t("canvasImportFileType"));
    if (file.size > LIBTV_MAX_JSON_BYTES) throw new Error(t("canvasImportFileSize"));
    const source = await file.text();
    if (new TextEncoder().encode(source).length > LIBTV_MAX_JSON_BYTES) throw new Error(t("canvasImportFileSize"));
    let document: unknown;
    try {
        document = JSON.parse(source.replace(/^\uFEFF/, ""));
    } catch {
        throw new Error(t("canvasImportInvalidJSON"));
    }
    const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === "object" && !Array.isArray(value));
    if (isRecord(document) && "code" in document) {
        if (document.code !== 0) throw new Error(t("canvasImportSourceError"));
        document = document.data;
    }
    if (!isRecord(document) || !isRecord(document.projectMeta) || !Array.isArray(document.nodeList) || !Array.isArray(document.connectionList)) {
        throw new Error(t("canvasImportStructure"));
    }
    return source;
}

export function buildLibTVCanvasNodes(result: LibTVImportResult, viewport: ViewportTransform, viewportSize: { width: number; height: number }, t: InterfaceTranslate = defaultTranslate): CanvasNodeData[] {
    if (!result.nodes.length) throw new Error(t("canvasImportEmpty"));
    const minX = Math.min(...result.nodes.map((node) => node.x));
    const minY = Math.min(...result.nodes.map((node) => node.y));
    const maxX = Math.max(...result.nodes.map((node) => node.x + node.width));
    const maxY = Math.max(...result.nodes.map((node) => node.y + node.height));
    const offsetX = (viewportSize.width / 2 - viewport.x) / viewport.k - (minX + maxX) / 2;
    const offsetY = (viewportSize.height / 2 - viewport.y) / viewport.k - (minY + maxY) / 2;
    return result.nodes.map<CanvasNodeData>((node, index) => {
        const importSource = index === 0 && result.sourceSnapshot ? { ...node.metadata, sourceSnapshot: result.sourceSnapshot } : node.metadata;
        return {
            id: node.id,
            type: node.type === "video" ? CanvasNodeType.Video : CanvasNodeType.Image,
            title: node.title,
            position: { x: node.x + offsetX, y: node.y + offsetY },
            width: node.width,
            height: node.height,
            metadata: {
                content: node.content,
                previewContent: node.type === "image" ? buildLibTVImagePreviewUrl(node.content) : undefined,
                prompt: node.prompt,
                model: node.model,
                status: node.status || "idle",
                errorDetails: node.errorDetails,
                naturalWidth: node.naturalWidth,
                naturalHeight: node.naturalHeight,
                durationMs: node.durationMs,
                mimeType: node.mimeType,
                importSource,
            },
        };
    });
}
const LIBTV_VIDEO_PREVIEW_WIDTH = 400;

export function parseLibTVProjectUUID(value: string) {
    const trimmed = value.trim();
    if (!trimmed) return "";
    let candidate = trimmed;
    try {
        const parsed = new URL(trimmed);
        candidate = parsed.searchParams.get("projectId") || parsed.searchParams.get("uuid") || parsed.pathname.split("/").filter(Boolean).at(-1) || "";
    } catch {
        candidate = trimmed;
    }
    return LIBTV_PROJECT_UUID_PATTERN.test(candidate) ? candidate.toLowerCase() : "";
}

export function formatLibTVBatchTime(value: string, t: InterfaceTranslate = defaultTranslate) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return t("canvasImportUnknown");
    const pad = (part: number) => String(part).padStart(2, "0");
    return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}${pad(date.getHours())}${pad(date.getMinutes())}`;
}

export function buildLibTVImagePreviewUrl(rawUrl: string) {
    try {
        const url = new URL(rawUrl);
        if (url.protocol !== "https:" || url.hostname !== LIBTV_RESOURCE_HOST) return rawUrl;
        if (!url.searchParams.has("x-oss-process")) {
            url.searchParams.set("x-oss-process", `image/resize,w_${LIBTV_PREVIEW_WIDTH}`);
        }
        return url.toString();
    } catch {
        return rawUrl;
    }
}

export function isLibTVImagePreview(source?: string, preview?: string) {
    return Boolean(source && preview && source !== preview && buildLibTVImagePreviewUrl(source) === preview);
}

export function buildLibTVVideoPreviewUrl(rawUrl: string) {
    try {
        const url = new URL(rawUrl);
        if (url.protocol !== "https:" || url.hostname !== LIBTV_RESOURCE_HOST) return "";
        if (!url.searchParams.has("x-oss-process")) {
            url.searchParams.set("x-oss-process", `video/snapshot,t_0,f_jpg,w_${LIBTV_VIDEO_PREVIEW_WIDTH},m_fast,ar_auto`);
        }
        return url.toString();
    } catch {
        return "";
    }
}

/**
 * Restores the playable LibTV asset URL when a snapshot transform was
 * persisted as the node's content by an older importer.  The OSS transform
 * belongs only on previewContent; VideoPlayer must receive the original MP4.
 */
export function buildLibTVVideoSourceUrl(rawUrl: string) {
    try {
        const url = new URL(rawUrl);
        if (url.protocol !== "https:" || url.hostname !== LIBTV_RESOURCE_HOST) return rawUrl;
        url.searchParams.delete("x-oss-process");
        return url.toString();
    } catch {
        return rawUrl;
    }
}
