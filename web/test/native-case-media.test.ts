import { createHash } from "node:crypto";
import { afterEach, beforeEach, expect, mock, test } from "bun:test";
import { CanvasNodeType } from "../src/types/canvas";
import type { CanvasNodeData } from "../src/types/canvas";
import { resolveLtvRuntimeReferences } from "../src/lib/canvas/ltv-runtime-references";
import { nativeProductionRecords } from "../src/lib/production-project-registry";
import support from "../src/lib/production-case-support.json";
import type { ProductionCaseMediaAsset } from "../src/lib/production-case-media-contract";
import { ltvMaskEditMask } from "../src/lib/canvas/ltv-mask-edit";
import { canvasNodeToAsset } from "../src/lib/canvas/canvas-node-asset";
import type { PrevisScene } from "../src/types/previs";

let scope = "user-a";
let rejectUploadNumber: number | null = null;
class MockUploadError extends Error {
    constructor(readonly status: number | undefined, readonly retryAfterMs?: number, readonly permanent = false) { super("upload rejected"); }
}
let uploadErrors: MockUploadError[] = [];
const uploadKeys: (string | undefined)[] = [];
const uploaded: Array<{ id: string; kind: string; bytes: number }> = [];
const id = "native-lux-3fo4k4vy4i4j";
const imagePath = "/production-library/native-media/" + id + "/first-frame.webp";
const videoPath = "/production-library/native-media/" + id + "/reference.mp4";
const imageBytes = new TextEncoder().encode("native-image-bytes");
const videoBytes = new TextEncoder().encode("native-video-bytes");
const sha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const registeredRecord = nativeProductionRecords.find(candidate => candidate.item.id === id);
if (!registeredRecord) throw new Error("Native case test fixture is missing");
const record = registeredRecord as typeof registeredRecord & { mediaAssets?: Array<{ role: string; path: string; sourcePack: string; sourcePath: string; mimeType: string; bytes: number; sha256: string }> };
const originalMediaAssets = record.mediaAssets;

const userScopeExports = await import("../src/lib/user-scope");
mock.module("../src/lib/user-scope", () => ({ ...userScopeExports, getActiveUserScope: () => scope }));
const resourceExports = await import("../src/services/api/resources");
mock.module("../src/services/api/resources", () => ({
    ...resourceExports,
    ResourceUploadError: MockUploadError,
    uploadResourceFile: async (blob: Blob, kind: string, meta?: { idempotencyKey?: string }) => {
        uploadKeys.push(meta?.idempotencyKey);
        const queuedError = uploadErrors.shift();
        if (queuedError) throw queuedError;
        const uploadNumber = uploaded.length + 1;
        if (rejectUploadNumber === uploadNumber) throw new Error("上传失败");
        const resourceId = "owned-" + uploadNumber;
        uploaded.push({ id: resourceId, kind, bytes: blob.size });
        return { id: resourceId };
    },
    resourceStorageKey: (resourceId: string) => "resource:" + resourceId,
    resourceFileUrl: (resourceId: string) => "/api/resources/" + resourceId + "/file",
}));
const { materializeNativeCaseMedia: materializeProjectMedia } = await import("../src/services/native-case-media");
const materializeNativeCaseMedia = (...args: Parameters<typeof materializeProjectMedia>) => materializeProjectMedia(...args).then(result => result.nodes);

test("复制导演台把GLB归属于当前账号，保留场景数据和原案例", async () => {
    const previous = globalThis.fetch;
    const bytes = new TextEncoder().encode('verified-glb-bytes');
    const caseId = support.find(row => row.id.startsWith('case-'))!.id;
    const source = '/production-library/director-assets/actor.glb';
    const digest = sha256(bytes);
    const asset = {source,path:`/production-library/case-media/${caseId}/${digest}.glb`,kind:'file',mimeType:'model/gltf-binary',bytes:bytes.length,sha256:digest} as ProductionCaseMediaAsset;
    const scenes = [{id:'scene',objects:[{id:'actor',kind:'model',url:source,transform:{position:[1,2,3]}}]}] as unknown as PrevisScene[];
    const original = structuredClone(scenes);
    globalThis.fetch = (async () => response(bytes,'model/gltf-binary')) as typeof fetch;
    try {
        const result = await materializeProjectMedia(caseId,[],[asset],undefined,scenes);
        expect(result.previsScenes![0].objects[0].url).toBe('/api/resources/owned-1/file');
        expect(result.previsScenes![0].objects[0].transform).toEqual(original[0].objects[0].transform);
        expect(scenes).toEqual(original);
        expect(uploaded).toEqual([{id:'owned-1',kind:'file',bytes:bytes.length}]);
        expect(uploadKeys[0]).toContain(`native-case:user-a:`);
    } finally { globalThis.fetch = previous; }
});

test("导演台缺模型清单时在读取与上传前拒绝", async () => {
    const previous = globalThis.fetch;
    let reads = 0;
    globalThis.fetch = (async () => { reads++; throw Error('Unexpected read'); }) as typeof fetch;
    const caseId = support.find(row => row.id.startsWith('case-'))!.id;
    const scenes = [{objects:[{kind:'model',url:'/production-library/director-assets/required.glb'}]}] as unknown as PrevisScene[];
    try {
        for (const declared of [undefined,[]]) {
            await expect(materializeProjectMedia(caseId,[],declared,undefined,scenes)).rejects.toThrow('清单');
        }
        expect(reads).toBe(0);
        expect(uploaded).toHaveLength(0);
    } finally { globalThis.fetch = previous; }
});

beforeEach(() => {
    uploaded.length = 0;
    rejectUploadNumber = null;
    uploadErrors = [];
    uploadKeys.length = 0;
    record.mediaAssets = [
        { role: "reference-video", path: videoPath, sourcePack: record.provenance.sourcePack, sourcePath: id + "/reference.mp4", mimeType: "video/mp4", bytes: videoBytes.byteLength, sha256: sha256(videoBytes) },
        { role: "first-frame", path: imagePath, sourcePack: record.provenance.sourcePack, sourcePath: id + "/first-frame.webp", mimeType: "image/webp", bytes: imageBytes.byteLength, sha256: sha256(imageBytes) },
    ];
});

test("案例复制遵守限流等待后以原幂等键继续，并限制重试次数", async () => {
    const previous = globalThis.fetch;
    const timer = globalThis.setTimeout;
    const waits: number[] = [];
    globalThis.setTimeout = ((callback: () => void, delay: number) => {
        waits.push(delay);
        return timer(callback, 0);
    }) as typeof setTimeout;
    globalThis.fetch = (async () => response(imageBytes, "image/webp")) as typeof fetch;
    uploaded.length = 0;
    try {
        uploadErrors = [new MockUploadError(429, 49000)];
        const progress: unknown[] = [];
        const copied = await materializeNativeCaseMedia(id, [imageNode()], undefined, value => progress.push(value));
        expect(copied[0].metadata?.content).toBe("/api/resources/owned-1/file");
        expect(waits).toEqual([49000]);
        expect(uploadKeys).toHaveLength(2);
        expect(uploadKeys[0]).toBeTruthy();
        expect(uploadKeys[1]).toBe(uploadKeys[0]);
        expect(progress).toContainEqual({ phase: "waiting", completed: 0, total: 1, retryAfterSeconds: 49 });
        uploaded.length = 0; uploadKeys.length = 0; waits.length = 0;
        uploadErrors = Array.from({ length: 4 }, () => new MockUploadError(429, 1000));
        await expect(materializeNativeCaseMedia(id, [imageNode()])).rejects.toThrow("upload rejected");
        expect(uploadKeys).toHaveLength(3);
        expect(waits).toEqual([1000, 1000]);
        expect(uploaded).toHaveLength(0);
    } finally { globalThis.fetch = previous; globalThis.setTimeout = timer; }
});

test("限流等待期间账号切换不再上传，永久错误或无有效等待头不自动重试", async () => {
    const previous = globalThis.fetch;
    const timer = globalThis.setTimeout;
    globalThis.setTimeout = ((callback: () => void) => timer(callback, 0)) as typeof setTimeout;
    globalThis.fetch = (async () => response(imageBytes, "image/webp")) as typeof fetch;
    uploaded.length = 0;
    try {
        uploadErrors = [new MockUploadError(429, 1000)];
        await expect(materializeNativeCaseMedia(id, [imageNode()], undefined, event => {
            if (event.phase === "waiting") scope = "user-b";
        })).rejects.toThrow("账号");
        expect(uploadKeys).toHaveLength(1);
        expect(uploaded).toHaveLength(0);
        scope = "user-a";
        for (const error of [new MockUploadError(403, 1000, true), new MockUploadError(429), new MockUploadError(429, 300001)]) {
            uploadKeys.length = 0; uploadErrors = [error];
            await expect(materializeNativeCaseMedia(id, [imageNode()])).rejects.toThrow("upload rejected");
            expect(uploadKeys).toHaveLength(1);
        }
    } finally { globalThis.fetch = previous; globalThis.setTimeout = timer; scope = "user-a"; }
});

test.each([502, undefined])("上传暂时失败(%s)丢失等待头时保守等待，同键重试而不重建已完成素材", async (status) => {
    const previous = globalThis.fetch;
    const timer = globalThis.setTimeout;
    const waits: number[] = [];
    globalThis.setTimeout = ((callback: () => void, delay: number) => { waits.push(delay); return timer(callback, 0); }) as typeof setTimeout;
    globalThis.fetch = (async () => response(imageBytes, "image/webp")) as typeof fetch;
    uploaded.length = 0;
    try {
        uploadErrors = [new MockUploadError(status)];
        const events: unknown[] = [];
        const copied = await materializeNativeCaseMedia(id, [imageNode()], undefined, event => events.push(event));
        expect(copied[0].metadata?.storageKey).toBe("resource:owned-1");
        expect(waits).toEqual([60000]);
        expect(uploadKeys).toHaveLength(2);
        expect(uploadKeys[0]).toBe(uploadKeys[1]);
        expect(events).toContainEqual({ phase: "waiting", completed: 0, total: 1, retryAfterSeconds: 60, connectionRetry: true });
    } finally { globalThis.fetch = previous; globalThis.setTimeout = timer; }
});
test("上传断线持续失败最多尝试三次，等待期间切换账号立即停止", async () => {
    const previous = globalThis.fetch, timer = globalThis.setTimeout;
    const waits: number[] = [];
    globalThis.setTimeout = ((callback: () => void, delay: number) => { waits.push(delay); return timer(callback, 0); }) as typeof setTimeout;
    globalThis.fetch = (async () => response(imageBytes, "image/webp")) as typeof fetch;
    try {
        uploadErrors = Array.from({ length: 3 }, () => new MockUploadError(undefined));
        await expect(materializeNativeCaseMedia(id, [imageNode()])).rejects.toThrow("upload rejected");
        expect(uploadKeys).toHaveLength(3);
        expect(new Set(uploadKeys).size).toBe(1);
        expect(waits).toEqual([60000, 60000]);
        expect(uploaded).toHaveLength(0);
        uploadKeys.length = 0;
        uploadErrors = [new MockUploadError(undefined)];
        await expect(materializeNativeCaseMedia(id, [imageNode()], undefined, event => {
            if (event.phase === "waiting") scope = "user-b";
        })).rejects.toThrow("账号");
        expect(uploadKeys).toHaveLength(1);
        expect(uploaded).toHaveLength(0);
    } finally { globalThis.fetch = previous; globalThis.setTimeout = timer; scope = "user-a"; }
});
afterEach(() => { record.mediaAssets = originalMediaAssets; });

const imageNode = (content = imagePath) => ({ id: "image", type: CanvasNodeType.Image, title: "首帧", width: 320, height: 320, position: { x: 0, y: 0 }, metadata: { content, previewContent: "stale", naturalWidth: 640, naturalHeight: 640 } });

test("复制素材保留已校验的 MIME 与字节数，图库不把非 PNG 图片标成 PNG", async () => {
    const previous = globalThis.fetch;
    const node = imageNode();
    const original = structuredClone(node);
    globalThis.fetch = (async () => response(imageBytes, "image/webp")) as typeof fetch;
    try {
        const [copied] = await materializeNativeCaseMedia(id, [node]);
        const asset = canvasNodeToAsset(copied, { canvasId: "copied-project", source: "canvas-generation" });
        expect(asset?.kind).toBe("image");
        if (asset?.kind !== "image") throw new Error("Expected the copied image asset");
        expect(asset.data.mimeType).toBe("image/webp");
        expect(asset.data.bytes).toBe(imageBytes.byteLength);
        expect(asset.data.storageKey).toBe("resource:owned-1");
        expect(node).toEqual(original);
    } finally { globalThis.fetch = previous; }
});
const videoNode = (content = videoPath) => ({ id: "video", type: CanvasNodeType.Video, title: "演示视频", width: 320, height: 320, position: { x: 0, y: 0 }, metadata: { content, naturalWidth: 640, naturalHeight: 640 } });
const response = (bytes: Uint8Array, contentType: string) => new Response(bytes, { headers: { "Content-Type": contentType } });

test.each(["request", "body"])("大素材二次读取的%s传输中断只重读当前原件，已上传素材不重建", async (failure) => {
    const previous = globalThis.fetch, timer = globalThis.setTimeout;
    const large = new Uint8Array(33 * 1024 * 1024);
    Object.assign(record.mediaAssets!.find(asset => asset.path === videoPath)!, { bytes: large.byteLength, sha256: sha256(large) });
    const waits: number[] = [];
    let videoReads = 0;
    uploaded.length = 0;
    globalThis.setTimeout = ((callback: () => void, delay: number) => { waits.push(delay); return timer(callback, 0); }) as typeof setTimeout;
    globalThis.fetch = (async (input: RequestInfo | URL) => {
        if (String(input) === imagePath) return response(imageBytes, "image/webp");
        videoReads++;
        if (videoReads === 2) {
            expect(uploaded.map(asset => asset.kind)).toEqual(["image"]);
            if (failure === "request") throw new TypeError("Failed to fetch");
            const interrupted = response(videoBytes, "video/mp4");
            interrupted.blob = async () => { throw new TypeError("Failed to fetch body"); };
            return interrupted;
        }
        return response(large, "video/mp4");
    }) as typeof fetch;
    try {
        const copied = await materializeNativeCaseMedia(id, [imageNode(), videoNode()]);
        expect(copied.map(node => node.metadata?.storageKey)).toEqual(["resource:owned-1", "resource:owned-2"]);
        expect(uploaded.map(asset => asset.bytes)).toEqual([imageBytes.byteLength, large.byteLength]);
        expect(videoReads).toBe(3);
        expect(waits).toEqual([1000]);
    } finally { globalThis.fetch = previous; globalThis.setTimeout = timer; }
});

test("源素材持续传输失败有界停止，等待期间切换账号立即停止重读", async () => {
    const previous = globalThis.fetch, timer = globalThis.setTimeout;
    const waits: number[] = [];
    let reads = 0, changeAccount = false;
    uploaded.length = 0;
    globalThis.fetch = (async () => { reads++; throw new TypeError("Failed to fetch"); }) as typeof fetch;
    globalThis.setTimeout = ((callback: () => void, delay: number) => {
        waits.push(delay);
        return timer(() => { if (changeAccount) scope = "user-b"; callback(); }, 0);
    }) as typeof setTimeout;
    try {
        await expect(materializeNativeCaseMedia(id, [imageNode()])).rejects.toThrow("Failed to fetch");
        expect(reads).toBe(3);
        expect(waits).toEqual([1000, 2000]);
        expect(uploaded).toHaveLength(0);
        reads = 0; waits.length = 0; changeAccount = true;
        await expect(materializeNativeCaseMedia(id, [imageNode()])).rejects.toThrow("账号");
        expect(reads).toBe(1);
        expect(uploaded).toHaveLength(0);
    } finally { globalThis.fetch = previous; globalThis.setTimeout = timer; scope = "user-a"; }
});

test("传输恢复后仍校验原件SHA，不重试或放行损坏内容", async () => {
    const previous = globalThis.fetch, timer = globalThis.setTimeout;
    let reads = 0;
    uploaded.length = 0;
    globalThis.setTimeout = ((callback: () => void) => timer(callback, 0)) as typeof setTimeout;
    globalThis.fetch = (async () => {
        if (++reads === 1) throw new TypeError("Failed to fetch");
        return response(new Uint8Array(imageBytes.byteLength).fill(0x78), "image/webp");
    }) as typeof fetch;
    try {
        await expect(materializeNativeCaseMedia(id, [imageNode()])).rejects.toThrow("SHA-256");
        expect(reads).toBe(2);
        expect(uploaded).toHaveLength(0);
    } finally { globalThis.fetch = previous; globalThis.setTimeout = timer; }
});

test("旧案例复用核验与上传链，重复原图只上传一次并同步固定参考", async () => {
    const previous = globalThis.fetch;
    const legacyId = support[0].id;
    const source = "https://media.example/original.webp";
    const asset: ProductionCaseMediaAsset = {source, kind:"image", mimeType:"image/webp", bytes:imageBytes.byteLength, sha256:sha256(imageBytes), path:`/production-library/case-media/${legacyId}/${sha256(imageBytes)}.webp`};
    const nodes: CanvasNodeData[] = [imageNode(source), {...imageNode(source),id:"duplicate"}, {...imageNode(""),id:"target",metadata:{ltvReferencePlan:{prompt:"@图片1",references:[{nodeId:"image",kind:"image",url:source}]}}}];
    const before = JSON.stringify(nodes);
    const reads: string[] = [];
    uploaded.length = 0;
    globalThis.fetch = (async (input: RequestInfo | URL) => { reads.push(String(input)); return response(imageBytes,"image/webp"); }) as typeof fetch;
    try {
        const progress: unknown[]=[];
        const copied = await materializeNativeCaseMedia(legacyId,nodes,[asset], event=>progress.push(event));
        expect(progress).toEqual([{phase:"verifying",completed:0,total:1},{phase:"verifying",completed:1,total:1},{phase:"uploading",completed:0,total:1},{phase:"uploading",completed:1,total:1}]);
        expect(reads).toEqual([asset.path]);
        expect(uploaded).toHaveLength(1);
        expect(copied[0].metadata?.content).toBe("/api/resources/owned-1/file");
        expect(copied[1].metadata?.storageKey).toBe("resource:owned-1");
        expect(copied[2].metadata?.ltvReferencePlan?.references[0].url).toBe(copied[0].metadata?.content);
        expect(JSON.stringify(nodes)).toBe(before);
        uploaded.length=0; reads.length=0;
        await expect(materializeNativeCaseMedia(legacyId,nodes,[])).rejects.toThrow("清单");
        expect(reads).toHaveLength(0);
        expect(uploaded).toHaveLength(0);
        const invalid = structuredClone(nodes);
        invalid[2].metadata!.ltvReferencePlan!.references[0].nodeId="missing";
        await expect(materializeNativeCaseMedia(legacyId,invalid,[asset])).rejects.toThrow("不一致");
        expect(uploaded).toHaveLength(0);
    } finally {globalThis.fetch=previous;}
});

test("确认复制后原生参考图转成当前用户资源，源工程不变", async () => {
    const previous = globalThis.fetch;
    const nodes = [imageNode()];
    const before = JSON.stringify(nodes);
    uploaded.length = 0;
    globalThis.fetch = (async () => response(imageBytes, "image/webp")) as typeof fetch;
    try {
        const copied = await materializeNativeCaseMedia(id, nodes);
        expect(copied[0].metadata?.storageKey).toBe("resource:owned-1");
        expect(copied[0].metadata?.content).toBe("/api/resources/owned-1/file");
        expect(copied[0].metadata?.previewContent).toBeUndefined();
        expect(JSON.stringify(nodes)).toBe(before);
        expect(uploaded).toHaveLength(1);
    } finally { globalThis.fetch = previous; }
});

test("旧案例原图、透明蒙版和音频一起迁移，旧账号素材标识不沿用", async () => {
    const previous=globalThis.fetch;
    const legacyId=support[0].id;
    const source="https://media.example/image.png", mask="https://media.example/mask.png", audio="https://media.example/audio.mp3";
    const maskBytes=new TextEncoder().encode("separate-mask-bytes"), audioBytes=new TextEncoder().encode("audio-bytes");
    const definitions=[{source,kind:"image",mimeType:"image/png",bytes:imageBytes,extension:"png"},{source:mask,kind:"image",mimeType:"image/png",bytes:maskBytes,extension:"png"},{source:audio,kind:"audio",mimeType:"audio/mpeg",bytes:audioBytes,extension:"mp3"}] as const;
    const assets:ProductionCaseMediaAsset[]=definitions.map(d=>({source:d.source,kind:d.kind,mimeType:d.mimeType,bytes:d.bytes.byteLength,sha256:sha256(d.bytes),path:`/production-library/case-media/${legacyId}/${sha256(d.bytes)}.${d.extension}`}));
    const nodes:CanvasNodeData[]=[{...imageNode(source),metadata:{...imageNode(source).metadata,assetId:"old-user-asset"}}, {...imageNode(""),id:"edit",metadata:{ltvMaskEdit:{sourceUrl:source,maskUrl:mask,scene:"redraw",sourceQuality:"2K",outputSize:"2048x2048"},ltvReferencePlan:{prompt:"@图片1",references:[{kind:"image",nodeId:"image",url:source}]}}},{...imageNode(audio),id:"audio",type:CanvasNodeType.Audio}];
    uploaded.length=0;
    globalThis.fetch=(async (input:RequestInfo|URL)=>{const i=assets.findIndex(asset=>asset.path===String(input));expect(i).toBeGreaterThanOrEqual(0);return response(definitions[i].bytes,definitions[i].mimeType);}) as typeof fetch;
    try {
        const copied=await materializeNativeCaseMedia(legacyId,nodes,assets);
        expect(uploaded.map(a=>a.kind)).toEqual(["image","image","audio"]);
        expect(copied[0].metadata?.assetId).toBeUndefined();
        expect(copied[1].metadata?.ltvMaskEdit?.sourceUrl).toBe(copied[0].metadata?.content);
        expect(copied[1].metadata?.ltvMaskEdit?.maskUrl).toBe("/api/resources/owned-2/file");
        expect(copied[2].metadata?.storageKey).toBe("resource:owned-3");
        expect(ltvMaskEditMask(copied[1].metadata,[{id:"image",name:"original",type:"image/png",dataUrl:"",url:copied[0].metadata!.content}],copied)?.url).toBe("/api/resources/owned-2/file");
        expect(nodes[0].metadata?.assetId).toBe("old-user-asset");
    } finally {globalThis.fetch=previous;}
});

test("实际素材复制服务同步固定参考地址，生成仍引用同一原图", async () => {
    const previous = globalThis.fetch;
    const nodes: CanvasNodeData[] = [imageNode(), { ...videoNode(), metadata: { ...videoNode().metadata,
        prompt: "@图片1 原图动作", ltvReferencePlan: { prompt: "@图片1 原图动作", references: [{ nodeId: "image", kind: "image", url: imagePath }] },
    } }];
    const before = JSON.stringify(nodes);
    uploaded.length = 0;
    globalThis.fetch = (async (input: RequestInfo | URL) => String(input) === imagePath
        ? response(imageBytes, "image/webp") : response(videoBytes, "video/mp4")) as typeof fetch;
    try {
        const copied = await materializeNativeCaseMedia(id, nodes);
        const plan = copied[1].metadata!.ltvReferencePlan!;
        expect(plan.references[0].url).toBe(copied[0].metadata!.content);
        expect(resolveLtvRuntimeReferences(plan, copied, plan.prompt).map(node => node.id)).toEqual(["image"]);
        expect(copied[1].metadata!.storageKey).toBe("resource:owned-2");
        expect(JSON.stringify(nodes)).toBe(before);
        expect(uploaded).toHaveLength(2);
    } finally { globalThis.fetch = previous; }
});

test("所有原生媒体先完整读取并核验SHA-256，第二个文件损坏时零上传", async () => {
    const previous = globalThis.fetch;
    uploaded.length = 0;
    globalThis.fetch = (async (input: RequestInfo | URL) => String(input) === imagePath
        ? response(imageBytes, "image/webp")
        : response(new Uint8Array(videoBytes.byteLength).fill(0x78), "video/mp4")) as typeof fetch;
    try {
        await expect(materializeNativeCaseMedia(id, [imageNode(), videoNode()])).rejects.toThrow("SHA-256");
        expect(uploaded).toHaveLength(0);
    } finally { globalThis.fetch = previous; }
});

test("MIME或字节数不符时不上传，账号在预读期间变化也不上传", async () => {
    const previous = globalThis.fetch;
    uploaded.length = 0;
    globalThis.fetch = (async () => response(imageBytes, "image/png")) as typeof fetch;
    try {
        await expect(materializeNativeCaseMedia(id, [imageNode()])).rejects.toThrow("MIME");
        expect(uploaded).toHaveLength(0);
        globalThis.fetch = (async () => response(new TextEncoder().encode("wrong-size"), "image/webp")) as typeof fetch;
        await expect(materializeNativeCaseMedia(id, [imageNode()])).rejects.toThrow("字节数");
        expect(uploaded).toHaveLength(0);
        globalThis.fetch = (async () => { scope = "user-b"; return response(imageBytes, "image/webp"); }) as typeof fetch;
        await expect(materializeNativeCaseMedia(id, [imageNode()])).rejects.toThrow("账号");
        expect(uploaded).toHaveLength(0);
    } finally { globalThis.fetch = previous; scope = "user-a"; }
});

test("上传后续文件失败时保留已创建资源，不执行不安全的回滚删除", async () => {
    const previous = globalThis.fetch;
    uploaded.length = 0;
    rejectUploadNumber = 2;
    globalThis.fetch = (async (input: RequestInfo | URL) => String(input) === imagePath
        ? response(imageBytes, "image/webp")
        : response(videoBytes, "video/mp4")) as typeof fetch;
    try {
        await expect(materializeNativeCaseMedia(id, [imageNode(), videoNode()])).rejects.toThrow("上传失败");
        expect(uploaded).toEqual([{ id: "owned-1", kind: "image", bytes: imageBytes.byteLength }]);
    } finally { globalThis.fetch = previous; rejectUploadNumber = null; }
});

test("外部或错配媒体拒绝上传，旧案例不走新媒体复制流程", async () => {
    uploaded.length = 0;
    const wrong = imageNode("/production-library/native-media/native-lux-other/first-frame.webp");
    await expect(materializeNativeCaseMedia(id, [wrong])).rejects.toThrow("对应");
    expect(await materializeNativeCaseMedia("legacy-case", [wrong])).toEqual([wrong]);
    expect(uploaded).toHaveLength(0);
});

test("大案例预校验缓存限制为32MiB，超出部分重读并再次校验后才上传", async () => {
    const previous=globalThis.fetch;
    const legacyId=support[0].id;
    const payloads=[new Uint8Array(20*1024*1024).fill(61),new Uint8Array(20*1024*1024).fill(62)];
    const assets:ProductionCaseMediaAsset[]=payloads.map((bytes,index)=>({source:`https://media.example/${index}.png`,kind:"image",mimeType:"image/png",bytes:bytes.length,sha256:sha256(bytes),path:`/production-library/case-media/${legacyId}/${sha256(bytes)}.png`}));
    const nodes=assets.map((asset,index)=>({...imageNode(asset.source),id:String(index)}));
    const reads:Array<{index:number;uploads:number}>=[];
    uploaded.length=0;
    globalThis.fetch=(async (input:RequestInfo|URL,init?:RequestInit)=>{
        expect(init?.cache).toBe("no-store");
        const index=assets.findIndex(asset=>asset.path===String(input));
        reads.push({index,uploads:uploaded.length});
        return response(payloads[index],"image/png");
    }) as typeof fetch;
    try {
        await materializeNativeCaseMedia(legacyId,nodes,assets);
        expect(reads).toEqual([{index:0,uploads:0},{index:1,uploads:0},{index:1,uploads:1}]);
        expect(uploaded).toHaveLength(2);
        reads.length=0; uploaded.length=0;
        globalThis.fetch=(async (input:RequestInfo|URL)=>{
            const index=assets.findIndex(asset=>asset.path===String(input));
            const repeat=reads.some(row=>row.index===index);
            reads.push({index,uploads:uploaded.length});
            return response(repeat?payloads[0]:payloads[index],"image/png");
        }) as typeof fetch;
        await expect(materializeNativeCaseMedia(legacyId,nodes,assets)).rejects.toThrow("SHA-256");
        expect(uploaded).toHaveLength(1);
    } finally {globalThis.fetch=previous;}
});
