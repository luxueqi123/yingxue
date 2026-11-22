import { nanoid } from "nanoid";
import type { CanvasNodeData, CanvasNodeMetadata } from "@/types/canvas";
import type { PrevisScene, PrevisTransform } from "@/types/previs";
import { validateLtvPrevisCameraMotion } from "./ltv-director-camera-motion";
import { validateLtvPrevisEmptyCameraTrack } from "./ltv-director-camera-animation";
import { validatePrevisOutputFrame } from "./director-output-frame";

const invalid = () => new Error("案例导演台场景或引用不完整，未创建画布。");
const identifier = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;
const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const vector = (value: unknown) => Array.isArray(value) && value.length === 3 && value.every(finite);
function transform(value: PrevisTransform) {
    if (!value || !vector(value.position) || !vector(value.rotation) || !vector(value.scale) || value.scale.some(n => Math.abs(n) < 1e-10)) throw invalid();
}
function identities(items: { id: string }[], preview: boolean): Map<string, string> {
    if (!Array.isArray(items)) throw invalid();
    const result = new Map<string, string>();
    for (const item of items) {
        if (!item || !identifier(item.id) || result.has(item.id)) throw invalid();
        result.set(item.id, preview ? item.id : nanoid());
    }
    return result;
}
function mapped(id: string, ids: ReadonlyMap<string, string>): string {
    if (!identifier(id) || !ids.has(id)) throw invalid();
    return ids.get(id)!;
}
function optionalReference(id: string | undefined, ids: ReadonlyMap<string, string>) {
    return id === undefined ? undefined : mapped(id, ids);
}
function stableUrl(value: unknown) {
    if (typeof value !== "string" || !value || /[\s\\\u0000-\u001f\u007f]/.test(value)) return false;
    try { const url = new URL(value); return url.protocol === "https:" && !url.username && !url.password; }
    catch { return /^\/(?!\/)[^\s\\]+$/.test(value); }
}

/** Copies editable director data, not a rendered stand-in. No fetches or user-resource writes. */
export function copyProductionCasePreviss(source: PrevisScene[] | undefined, nodes: CanvasNodeData[], nodeIds: ReadonlyMap<string, string>, preview: boolean) {
    if (source !== undefined && !Array.isArray(source)) throw invalid();
    const scenes = structuredClone(source ?? []);
    const sceneIds = identities(scenes, preview);
    const shotsByScene = new Map<string, Map<string, string>>();
    for (const scene of scenes) {
        if (scene.outputFrame !== undefined) validatePrevisOutputFrame(scene.outputFrame);
        if (scene.version !== 1 || typeof scene.title !== "string" || typeof scene.background !== "string" || !finite(scene.environmentIntensity) || scene.environmentIntensity < 0
            || typeof scene.gridVisible !== "boolean" || !Number.isFinite(Date.parse(scene.createdAt)) || !Number.isFinite(Date.parse(scene.updatedAt))) throw invalid();
        const objects = identities(scene.objects, preview), cameras = identities(scene.cameras, preview), lights = identities(scene.lights, preview), shots = identities(scene.shots, preview);
        if (!shots.size || !cameras.size) throw invalid();
        shotsByScene.set(scene.id, shots);
        scene.activeShotId = mapped(scene.activeShotId, shots);
        for (const object of scene.objects) {
            transform(object.transform);
            if (!["primitive", "model", "actor", "billboard"].includes(object.kind) || [object.visible, object.castShadow, object.receiveShadow].some(v => typeof v !== "boolean")) throw invalid();
            if ((object.kind === "model" || object.kind === "billboard") && !stableUrl(object.url)) throw invalid();
            object.sourceNodeId = optionalReference(object.sourceNodeId, nodeIds);
            object.id = mapped(object.id, objects);
            const frames = identities(object.keyframes, preview);
            for (const frame of object.keyframes) {
                if (!finite(frame.time) || frame.time < 0) throw invalid();
                transform(frame.transform); frame.id = mapped(frame.id, frames);
            }
            if (object.motionClips !== undefined) {
                const clips = identities(object.motionClips, preview);
                object.activeMotionClipId = optionalReference(object.activeMotionClipId, clips);
                for (const clip of object.motionClips) clip.id = mapped(clip.id, clips);
            } else if (object.activeMotionClipId !== undefined) throw invalid();
            if (object.boneTracks !== undefined) {
                if (!Array.isArray(object.boneTracks)) throw invalid();
                for (const track of object.boneTracks) {
                    const keys = identities(track.keyframes, preview);
                    for (const key of track.keyframes) key.id = mapped(key.id, keys);
                }
            }
        }
        for (const camera of scene.cameras) {
            transform(camera.transform);
            if (camera.ltvEmptyCameraTrack !== undefined) {
                validateLtvPrevisEmptyCameraTrack(camera.ltvEmptyCameraTrack);
                if (camera.ltvCameraMotion || camera.sourceCamera) throw invalid();
            }
            if (camera.ltvCameraMotion !== undefined) {
                validateLtvPrevisCameraMotion(camera.ltvCameraMotion);
                if (camera.sourceCamera || camera.keyframes.length) throw invalid();
            }
            if (!vector(camera.target) || !finite(camera.fov) || camera.fov <= 0 || camera.fov >= 180 || !finite(camera.near) || !finite(camera.far) || camera.near <= 0 || camera.far <= camera.near) throw invalid();
            camera.id = mapped(camera.id, cameras);
            if (camera.sourceCamera) {
                if (!identifier(camera.sourceCamera.entityId)) throw invalid();
                camera.sourceCamera.objectId = mapped(camera.sourceCamera.objectId, objects);
            }
            const frames = identities(camera.keyframes, preview);
            for (const frame of camera.keyframes) {
                if (!finite(frame.time) || frame.time < 0) throw invalid();
                transform(frame.transform); frame.id = mapped(frame.id, frames);
            }
        }
        for (const light of scene.lights) {
            transform(light.transform);
            if (!finite(light.intensity) || light.intensity < 0) throw invalid();
            light.id = mapped(light.id, lights);
        }
        for (const shot of scene.shots) {
            if (!finite(shot.duration) || shot.duration <= 0 || ![24, 25, 30].includes(shot.fps)) throw invalid();
            shot.id = mapped(shot.id, shots);
            shot.cameraId = mapped(shot.cameraId, cameras);
            for (const key of ["previewNodeId", "depthNodeId", "normalNodeId"] as const) shot[key] = optionalReference(shot[key], nodeIds);
        }
        scene.id = mapped(scene.id, sceneIds);
    }
    const metadata = new Map<string, Partial<CanvasNodeMetadata>>();
    for (const node of nodes) {
        const value = node.metadata;
        const outputKeys = ["previsPreviewNodeId", "previsDepthNodeId", "previsNormalNodeId", "previsClayVideoNodeId"] as const;
        if (!value || (value.previsSceneId === undefined && value.previsShotId === undefined && outputKeys.every(key => value[key] === undefined))) continue;
        const sceneId = mapped(value.previsSceneId!, sceneIds);
        const shotId = mapped(value.previsShotId!, shotsByScene.get(value.previsSceneId!)!);
        const patch: Partial<CanvasNodeMetadata> = { previsSceneId: sceneId, previsShotId: shotId };
        for (const key of outputKeys) patch[key] = optionalReference(value[key], nodeIds);
        if (value.referenceAssetNodeIds !== undefined) patch.referenceAssetNodeIds = value.referenceAssetNodeIds.map(id => mapped(id, nodeIds));
        metadata.set(node.id, patch);
    }
    return { previsScenes: source === undefined ? undefined : scenes, metadata };
}
