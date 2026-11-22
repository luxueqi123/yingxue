import { describe, expect, test } from "bun:test";

import { assertLibTVImportFitsCanvas, buildLibTVCanvasNodes, buildLibTVImagePreviewUrl, buildLibTVVideoPreviewUrl, buildLibTVVideoSourceUrl, formatLibTVBatchTime, getLibTVImportReport, LIBTV_MAX_JSON_BYTES, parseLibTVProjectUUID, readLibTVJSONFile } from "../src/lib/canvas/libtv-import";
import { importLibTVCanvas, importLibTVCanvasJSON, type LibTVImportResult } from "../src/services/api/libtv";
import { apiClient } from "../src/services/api/request";

describe("LibTV canvas import helpers", () => {
    test("keeps online UUID requests and sends local JSON intact through the authenticated client", async () => {
        const originalAdapter = apiClient.defaults.adapter;
        const calls: Array<{ url?: string; data: unknown; credentials?: boolean }> = [];
        apiClient.defaults.adapter = async (config) => {
            calls.push({ url: config.url, data: config.data, credentials: config.withCredentials });
            return { data: { code: 0, data: sampleImportResult(), msg: "ok" }, status: 200, statusText: "OK", headers: {}, config };
        };
        try {
            await importLibTVCanvas("canvas/one", "292a69d540774a9ab9872d8337c9fd0b");
            const source = '{"nodeList":[],"seed":9007199254740993}';
            await importLibTVCanvasJSON("canvas/one", source);
            expect(calls[0].url).toBe("/canvas-projects/canvas%2Fone/import/libtv");
            expect(JSON.parse(calls[0].data as string)).toEqual({ uuid: "292a69d540774a9ab9872d8337c9fd0b" });
            expect(calls[1].url).toBe("/canvas-projects/canvas%2Fone/import/libtv/json");
            expect(calls[1].data).toBe(source);
            expect(calls.every((call) => call.credentials)).toBe(true);
        } finally {
            apiClient.defaults.adapter = originalAdapter;
        }
    });
    test("refuses a combined canvas above the save limit without trimming its source", () => {
        const project = { id: "canvas-1", nodes: [], connections: [], originalText: "x".repeat(5 * 1024 * 1024) };
        expect(() => assertLibTVImportFitsCanvas(project, [], [])).toThrow("5 MiB");
        expect(project.originalText.length).toBe(5 * 1024 * 1024);
        const smallProject = { ...project, originalText: "small" };
        expect(() => assertLibTVImportFitsCanvas(smallProject, [], [])).not.toThrow();
    });
    test("reports every skipped item with its original reason", () => {
        const result = { ...sampleImportResult(), warnings: [{ id: "image-1", message: "尺寸无效，使用默认值" }], skippedNodes: [{ id: "duplicate", name: "Repeated", reason: "节点 nodeKey 重复" }, { id: "invalid-position", reason: "节点坐标无效" }], skippedConnections: [{ id: "missing-edge", reason: "连接端点节点未导入" }] };
        const items = getLibTVImportReport(result);
        expect(items.map((item: { message: string }) => item.message)).toEqual(["尺寸无效，使用默认值", "节点 nodeKey 重复", "节点坐标无效", "连接端点节点未导入"]);
        expect(items.map((item: { label: string }) => item.label).join(" ")).toContain("Repeated");
    });
    test("persists one source snapshot while retaining existing relative positions", () => {
        const result = sampleImportResult();
        const nodes = JSON.parse(JSON.stringify(buildLibTVCanvasNodes(result, { x: 0, y: 0, k: 1 }, { width: 1000, height: 800 })));
        expect(nodes[1].position.x - nodes[0].position.x).toBe(500);
        expect(nodes[0].metadata.importSource.sourceSnapshot).toEqual(result.sourceSnapshot);
        expect(nodes[0].metadata.importSource.sourceSnapshot.detailJson).toContain("9007199254740993");
        expect(nodes[1].metadata.importSource.sourceSnapshot).toBeUndefined();
        expect(nodes[0].metadata.prompt).toBe("original prompt");
    });
    test("reads a local detail JSON without replacing its original number values", async () => {
        const source = '{"projectMeta":{"uuid":"292a69d540774a9ab9872d8337c9fd0b"},"nodeList":[{"nodeKey":"image-1","data":{"type":"image","params":{"seed":9007199254740993}}}],"connectionList":[]}';
        expect(await readLibTVJSONFile(new File([source], "original.json", { type: "application/json" }))).toBe(source);
    });

    test("rejects ZIP, arbitrary node JSON, error envelopes and oversized files", async () => {
        for (const file of [new File(["{}"], "source.zip"), new File(['{"nodes":[],"edges":[]}'], "source.json"), new File(['{"code":403,"data":{}}'], "source.json"), new File(["{"], "source.json")]) {
            await expect(readLibTVJSONFile(file)).rejects.toThrow();
        }
        let read = false;
        await expect(readLibTVJSONFile({ name: "huge.json", size: LIBTV_MAX_JSON_BYTES + 1, text: async () => { read = true; return "{}"; } })).rejects.toThrow("8 MiB");
        expect(read).toBe(false);
    });

    test("accepts an official JSON envelope while preserving the selected file", async () => {
        const source = '\uFEFF{"code":0,"data":{"projectMeta":{},"nodeList":[],"connectionList":[]}}';
        expect(await readLibTVJSONFile(new File([source], "source.JSON"))).toBe(source.replace(/^\uFEFF/, ""));
    });
    test("extracts projectId from LibTV share links", () => {
        expect(parseLibTVProjectUUID("https://www.liblib.tv/canvas/share?spaceId=5858202&projectId=dda7684b670b4e57b6027f1334fe6056")).toBe("dda7684b670b4e57b6027f1334fe6056");
    });

    test("accepts direct UUIDs and rejects unrelated links", () => {
        expect(parseLibTVProjectUUID("292A69D540774A9AB9872D8337C9FD0B")).toBe("292a69d540774a9ab9872d8337c9fd0b");
        expect(parseLibTVProjectUUID("https://api.liblib.tv/api/canvas/project/detail?uuid=292a69d540774a9ab9872d8337c9fd0b")).toBe("292a69d540774a9ab9872d8337c9fd0b");
        expect(parseLibTVProjectUUID("https://example.com/not-a-canvas")).toBe("");
    });

    test("formats the readable batch label to local yyyyMMddHHmm", () => {
        const localTime = new Date(2026, 7, 19, 5, 2);
        expect(formatLibTVBatchTime(localTime.toISOString())).toBe("202608190502");
    });

    test("uses a LibTV CDN thumbnail without changing the original media contract", () => {
        const original = "https://libtv-res.liblib.art/path/example.png";
        expect(buildLibTVImagePreviewUrl(original)).toBe("https://libtv-res.liblib.art/path/example.png?x-oss-process=image%2Fresize%2Cw_960");
        expect(buildLibTVImagePreviewUrl("https://example.com/path/example.png")).toBe("https://example.com/path/example.png");
    });

    test("builds a 400px OSS snapshot for LibTV videos only", () => {
        const original = "https://libtv-res.liblib.art/path/example.mp4";
        expect(buildLibTVVideoPreviewUrl(original)).toBe("https://libtv-res.liblib.art/path/example.mp4?x-oss-process=video%2Fsnapshot%2Ct_0%2Cf_jpg%2Cw_400%2Cm_fast%2Car_auto");
        expect(buildLibTVVideoPreviewUrl("https://example.com/path/example.mp4")).toBe("");
        expect(buildLibTVVideoPreviewUrl("not-a-url")).toBe("");
    });

    test("removes a persisted OSS snapshot transform before video playback", () => {
        const snapshot = "https://libtv-res.liblib.art/path/example.mp4?x-oss-process=video%2Fsnapshot%2Ct_0%2Cf_jpg%2Cw_400";
        expect(buildLibTVVideoSourceUrl(snapshot)).toBe("https://libtv-res.liblib.art/path/example.mp4");
        expect(buildLibTVVideoSourceUrl("https://example.com/path/example.mp4?x-oss-process=video%2Fsnapshot")).toBe("https://example.com/path/example.mp4?x-oss-process=video%2Fsnapshot");
    });
});

function sampleImportResult(): LibTVImportResult {
    const node = { id: "import-1", type: "image" as const, title: "Image", x: 0, y: 0, width: 200, height: 100, content: "https://example.com/image.png", prompt: "original prompt", metadata: { provider: "libtv" as const, projectUuid: "292a69d540774a9ab9872d8337c9fd0b", nodeKey: "image-1", batchId: "batch-1" } };
    return {
        batchId: "batch-1", batchCreatedAt: "2026-09-12T00:00:00Z", projectUuid: node.metadata.projectUuid, projectName: "Source", nodes: [node, { ...node, id: "import-2", x: 500 }], connections: [], importedNodeCount: 2, importedConnectionCount: 0,
        skippedNodes: [], skippedConnections: [], warnings: [], multiResultNodeCount: 0, staleNodeCount: 0, reusedFailedNodeCount: 0, placeholderNodeCount: 0, convertedSpecialCount: 0,
        sourceSnapshot: { version: 1, redactedFields: 0, detailJson: '{"projectMeta":{"uuid":"292a69d540774a9ab9872d8337c9fd0b"},"nodeList":[{"nodeKey":"unsupported","data":{"type":"text","params":{"custom":"original","seed":9007199254740993}}}],"connectionList":[]}' },
    };
}
