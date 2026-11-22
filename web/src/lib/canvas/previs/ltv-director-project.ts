import { canonicalize } from "json-canonicalize";
import { CanvasNodeType, type CanvasNodeData, type CanvasConnection } from "@/types/canvas";
import type { PrevisScene } from "@/types/previs";
import { copyProductionCasePreviss } from "./production-case-director";
import { planLtvPrevisCameraAnimation } from "./ltv-director-camera-animation";
import { convertLtvPrevisCamera } from "./ltv-director-camera";
import { prepareLtvPrevisEmpty } from "./ltv-director-empty";
import { ltvPrevisOutputFrame } from "./director-output-frame";

export type LtvPrevisProjectImport = {
    /** Exact source composition used to prepare the models; never published in the native project. */
    sourceComposition: unknown;
    scene: PrevisScene;
    screenshots: Array<{ sourceCameraId: string; sourceScreenshotId: string; url: string; width: number; height: number }>;
    /** Node preview is independent of camera capture history; never infer its camera/time. */
    preview?: { sourceUrl: string; url: string; width: number; height: number };
};
type Fields = Record<string, unknown>;
function fail(message: string): never { throw new Error(message); }
function record(value: unknown): Fields {
    return value && typeof value === "object" && !Array.isArray(value) ? value as Fields : fail("源导演台字段格式错误");
}
function records(value: unknown): Fields[] {
    return Array.isArray(value) ? value.map(record) : fail("源导演台对象列表错误");
}
function id(value: unknown): string {
    return typeof value === "string" && value.trim() ? value : fail("源导演台对象标识缺失");
}
const key = (camera: string, screenshot: string) => JSON.stringify([camera, screenshot]);
function resource(value: { url: string; width: number; height: number }) {
    if (!Number.isSafeInteger(value.width) || !Number.isSafeInteger(value.height) || value.width <= 0 || value.height <= 0
        || typeof value.url !== "string" || /[\s\\\u0000-\u001f\u007f]/.test(value.url)) fail("导演台预览或截图资源错误");
    let valid = false;
    try { const url = new URL(value.url); valid = url.protocol === "https:" && !url.username && !url.password; }
    catch { valid = /^\/(?!\/)[^\s\\]+$/.test(value.url); }
    if (!valid) fail("导演台预览或截图需稳定资源地址");
}

/** Converts a source node only when its complete prepared scene and every screenshot are supplied. */
export function buildLtvPrevisProjectNode(original: unknown, input: LtvPrevisProjectImport, layout: { position: { x: number; y: number }; width: number; height: number; parentId?: string }) {
    const source = record(original), data = record(source.data), composition = record(data.compositionData);
    const nodeId = id(source.id);
    if (source.type !== "director-console-3d" || data.action !== "director_console_panorama_input") fail("源导演台操作尚未接入");
    if (data.previewImageUrl) {
        if (!input.preview || typeof data.previewImageUrl !== "string" || input.preview.sourceUrl !== data.previewImageUrl) fail("节点独立预览图尚需同源资源迁移，不得丢弃");
        resource(input.preview);
    } else if (input.preview !== undefined) fail("源节点没有对应独立预览图");
    if (canonicalize(composition) !== canonicalize(input.sourceComposition)) fail("导演台转换产物与当前源场景不一致");
    const animation = composition.animation !== undefined && composition.animation !== null ? planLtvPrevisCameraAnimation(composition) : undefined;
    if (records(composition.characterGroups ?? []).length) fail("源导演台分组尚需接入");
    const empties = records(composition.emptyObjects ?? []);
    const characters = records(composition.characters), props = records(composition.props), cameras = records(composition.cameras);
    if (cameras.some(camera => empties.some(empty => empty.id === camera.lookAtTarget || empty.id === camera.followTargetId))) fail("空对象机位目标需动态引用绑定");
    const scene = structuredClone(input.scene), prefix = `${id(scene.id)}:`;
    const expectedOutput = ltvPrevisOutputFrame();
    if (!scene.outputFrame || scene.outputFrame.width !== expectedOutput.width || scene.outputFrame.height !== expectedOutput.height || scene.outputFrame.aspect !== expectedOutput.aspect) fail("源导演台输出画幅未完整接入");
    if (animation) {
        if (scene.activeShotId !== `${prefix}shot:${animation.activeCameraId}`) fail("源活动动画机位不一致");
        for (const camera of cameras) {
            const native = scene.cameras.find(item => item.id === `${prefix}camera:${id(camera.id)}`);
            const expected = animation.motions.get(id(camera.id));
            const expectedEmptyTrack = animation.emptyTracks.get(id(camera.id));
            const original = convertLtvPrevisCamera(camera, composition, { id: "verify", name: "verify" });
            if (canonicalize(native?.ltvCameraMotion ?? null) !== canonicalize(expected ?? null)
                || canonicalize(native?.ltvEmptyCameraTrack ?? null) !== canonicalize(expectedEmptyTrack ?? null)
                || expectedEmptyTrack && (native?.keyframes.length !== 0 || canonicalize(native?.transform) !== canonicalize(original.transform))
                || canonicalize(native?.target) !== canonicalize(original.target) || native?.fov !== original.fov || native?.near !== original.near || native?.far !== original.far
                || scene.shots.find(item => item.cameraId === native?.id)?.duration !== animation.duration) fail("源机位动画未完整对应，拒绝静态或错时钟产物");
        }
    } else if (scene.cameras.some(camera => camera.ltvCameraMotion !== undefined || camera.ltvEmptyCameraTrack !== undefined)) fail("静态源场景不得混入额外机位动画");
    const expectedObjects = [...characters.map(a => `${prefix}actor:${id(a.id)}`), ...props.map(p => `${prefix}prop:${id(p.id)}`), `${prefix}environment-ground`, ...empties.map(empty => `${prefix}empty:${id(empty.id)}`)];
    for (const empty of empties) {
        const expected = prepareLtvPrevisEmpty(empty, composition.environment, prefix).object;
        const actual = scene.objects.find(object => object.id === expected.id);
        if (!actual || actual.name !== expected.name || actual.kind !== "model" || actual.modelNormalization !== "preserve-source"
            || canonicalize(actual.transform) !== canonicalize(expected.transform)) fail("源空对象没有完整保留");
    }
    if (scene.objects.length !== expectedObjects.length || expectedObjects.some(expected => !scene.objects.some(o => o.id === expected))) fail("导演台模型清单未完整覆盖源角色、道具与地面");
    if (scene.cameras.length !== cameras.length || scene.shots.length !== cameras.length || cameras.some(camera => !scene.cameras.some(c => c.id === `${prefix}camera:${id(camera.id)}`)
        || !scene.shots.some(shot => shot.id === `${prefix}shot:${id(camera.id)}` && shot.cameraId === `${prefix}camera:${id(camera.id)}`))) fail("导演台摄影机或镜头未完整对应源场景");
    if ([...characters, ...props, ...cameras].some(item => item.locked === true)) fail("源锁定状态尚需接入");
    const screenshotMap = new Map(input.screenshots.map(item => [key(id(item.sourceCameraId), id(item.sourceScreenshotId)), item]));
    if (screenshotMap.size !== input.screenshots.length) fail("导演台截图资源重复");
    const nodes: CanvasNodeData[] = [], connections: CanvasConnection[] = [];
    const sourceKeys = new Set<string>();
    for (const camera of cameras) {
        const cameraId = id(camera.id), shot = scene.shots.find(s => s.cameraId === `${prefix}camera:${cameraId}`)!;
        const captures: string[] = [];
        for (const screenshot of records(camera.screenshots ?? [])) {
            if (Object.keys(screenshot).some(k => !["id", "label", "imageUrl", "createdAt", "cameraId", "hasPanorama", "panoramaSource"].includes(k))
                || screenshot.cameraId !== undefined && screenshot.cameraId !== cameraId
                || screenshot.hasPanorama !== undefined && screenshot.hasPanorama !== false
                || screenshot.panoramaSource !== undefined && screenshot.panoramaSource !== "none") fail("源截图附加状态尚需接入");
            const captureSource = {
                ...(screenshot.cameraId !== undefined ? { cameraId } : {}),
                ...(screenshot.hasPanorama !== undefined ? { hasPanorama: false as const } : {}),
                ...(screenshot.panoramaSource !== undefined ? { panoramaSource: "none" as const } : {}),
            };
            const screenshotId = id(screenshot.id), identity = key(cameraId, screenshotId), resource = screenshotMap.get(identity);
            if (sourceKeys.has(identity)) fail("源截图标识重复");
            sourceKeys.add(identity);
            if (!resource || !Number.isSafeInteger(resource.width) || !Number.isSafeInteger(resource.height) || resource.width <= 0 || resource.height <= 0) fail("导演台截图尚未完整持久化");
            if (typeof resource.url !== "string" || /[\s\\\u0000-\u001f\u007f]/.test(resource.url)) fail("导演台截图资源地址错误");
            let valid = false;
            try { const url = new URL(resource.url); valid = url.protocol === "https:" && !url.username && !url.password; }
            catch { valid = /^\/(?!\/)[^\s\\]+$/.test(resource.url); }
            if (!valid) fail("导演台截图需稳定资源地址");
            const createdAt = screenshot.createdAt;
            if (createdAt !== undefined && (typeof createdAt !== "number" || !Number.isFinite(createdAt) || !Number.isFinite(new Date(createdAt).getTime()))) fail("源截图时间格式错误");
            const captureId = `${prefix}capture:${cameraId}:${screenshotId}`;
            const width = 320, height = width * resource.height / resource.width;
            nodes.push({ id: captureId, type: CanvasNodeType.Image, title: typeof screenshot.label === "string" && screenshot.label.trim() ? screenshot.label : "机位截图",
                ...(typeof createdAt === "number" ? { createdAt: new Date(createdAt).toISOString() } : {}),
                position: { x: layout.position.x - 360, y: layout.position.y + nodes.length * (height + 32) }, width, height,
                ...(layout.parentId ? { parentId: layout.parentId } : {}), metadata: { content: resource.url, status: "success", naturalWidth: resource.width, naturalHeight: resource.height,
                    previsSceneId: scene.id, previsShotId: shot.id,
                    ...(Object.keys(captureSource).length ? { previsCaptureSource: captureSource } : {}) } });
            captures.push(captureId);
        }
        // Source capture appends to this history. Native import selects the newest
        // capture for its initial preview; it does not claim a saved source UI selection.
        shot.previewNodeId = captures.at(-1);
    }
    if (sourceKeys.size !== screenshotMap.size) fail("导演台截图清单包含不属于当前源场景的资源");
    const activeShot = scene.shots.find(shot => shot.id === scene.activeShotId);
    if (!activeShot) fail("导演台活动镜头不存在");
    const previewId = input.preview ? `${prefix}node-preview` : activeShot.previewNodeId;
    if (input.preview) {
        const width = 320, height = width * input.preview.height / input.preview.width;
        nodes.push({ id: previewId!, type: CanvasNodeType.Image, title: "原导演台预览", position: { x: layout.position.x + layout.width + 40, y: layout.position.y }, width, height,
            ...(layout.parentId ? { parentId: layout.parentId } : {}),
            metadata: { content: input.preview.url, status: "success", naturalWidth: input.preview.width, naturalHeight: input.preview.height } });
    }
    const title = typeof data.name === "string" && data.name.trim() ? data.name : "3D 导演台";
    const owner: CanvasNodeData = { id: nodeId, type: CanvasNodeType.Video, title, ...layout, metadata: {
        workflowKind: "shot", workflowTitle: title, generationMode: "video", videoEditOperation: "text_to_video", status: "idle", composerContent: "",
        previsSceneId: scene.id, previsShotId: activeShot.id, previsPreviewNodeId: previewId,
        ...(previewId ? { referenceAssetNodeIds: [previewId] } : {}),
    } };
    if (previewId) connections.push({ id: `${prefix}preview-edge`, fromNodeId: previewId, toNodeId: nodeId });
    const all = [owner, ...nodes];
    const ids = new Map(all.map(node => [node.id, node.id]));
    if (ids.size !== all.length) fail("导演台节点标识冲突");
    copyProductionCasePreviss([scene], all, ids, true);
    return { scene, nodes: all, connections };
}
