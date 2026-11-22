import type { PrevisLtvCameraMotion, PrevisLtvEmptyCameraTrack, PrevisVec3 } from "@/types/previs";
import { ltvPrevisSceneMatrix } from "./ltv-director-camera";
import { validateLtvPrevisCameraMotion } from "./ltv-director-camera-motion";

type Fields = Record<string, unknown>;
const fail = (): never => { throw new Error("源机位动画包含未接入的轨道、时序或朝向参数，不以静态场景替代。"); };
const record = (value: unknown): Fields => value && typeof value === "object" && !Array.isArray(value) ? value as Fields : fail();
const fields = (value: Fields, keys: string[]) => { if (Object.keys(value).some(key => !keys.includes(key))) fail(); };
const list = (value: unknown): unknown[] => Array.isArray(value) ? value : fail();
const id = (value: unknown): string => typeof value === "string" && value.trim() ? value : fail();
const name = (value: unknown): string => typeof value === "string" ? value : fail();
const finite = (value: unknown): number => typeof value === "number" && Number.isFinite(value) ? value : fail();
function vector(value: unknown): PrevisVec3 {
    const v = record(value); fields(v, ["x", "y", "z"]);
    return [finite(v.x), finite(v.y), finite(v.z)];
}

export type LtvPrevisCameraAnimationPlan = {
    duration: number;
    activeCameraId: string;
    motions: ReadonlyMap<string, PrevisLtvCameraMotion>;
    emptyTracks: ReadonlyMap<string, PrevisLtvEmptyCameraTrack>;
};

export function validateLtvPrevisEmptyCameraTrack(value: unknown): asserts value is PrevisLtvEmptyCameraTrack {
    const track = record(value);
    fields(track, ["id", "name", "targetId", "keyframes", "interpolation"]);
    id(track.id); id(track.targetId); name(track.name);
    if (list(track.keyframes).length || track.interpolation !== "linear" && track.interpolation !== "catmullRom") fail();
}

/** Camera-only, zero-start untimed Bezier source owner. Unknown features are rejected, never stripped. */
export function planLtvPrevisCameraAnimation(composition: unknown): LtvPrevisCameraAnimationPlan {
    const source = record(composition), animation = record(source.animation);
    fields(animation, ["version", "duration", "motionPaths", "characterTracks", "propTracks", "cameraTracks", "groupTracks", "activeCameraTrackId"]);
    const duration = finite(animation.duration);
    if (animation.version !== 1 || duration <= 0 || ["motionPaths", "characterTracks", "propTracks", "groupTracks"].some(key => list(animation[key]).length)) fail();
    const cameras = list(source.cameras).map(record);
    if (new Set(cameras.map(camera => id(camera.id))).size !== cameras.length) fail();
    const tracks = list(animation.cameraTracks).map(record), motions = new Map<string, PrevisLtvCameraMotion>();
    const emptyTracks = new Map<string, PrevisLtvEmptyCameraTrack>();
    const trackIds = new Set<string>();
    const targetIds = new Set<string>();
    let activeCameraId = "";
    for (const track of tracks) {
        fields(track, ["id", "name", "targetId", "keyframes", "interpolation", "motionPath"]);
        const trackId = id(track.id), targetId = id(track.targetId);
        if (trackIds.has(trackId) || targetIds.has(targetId)) fail();
        trackIds.add(trackId);
        targetIds.add(targetId);
        const camera = record(cameras.find(item => item.id === targetId));
        if (camera.followTargetId || camera.cameraQuaternion !== undefined || camera.lookAtTarget === "__none__") fail();
        if (!list(track.keyframes).length && track.motionPath === undefined) {
            validateLtvPrevisEmptyCameraTrack(track);
            emptyTracks.set(targetId, structuredClone(track));
            if (animation.activeCameraTrackId === trackId) activeCameraId = targetId;
            continue;
        }
        const path = record(track.motionPath);
        fields(path, ["id", "name", "enabled", "start", "end", "points", "bezierPoints", "offset", "orientToPath"]);
        if (path.enabled !== true || path.start !== 0 || typeof path.orientToPath !== "boolean"
            || track.interpolation !== "linear" && track.interpolation !== "catmullRom") fail();
        const frames = list(track.keyframes).map(item => {
            const frame = record(item); fields(frame, ["time", "position", "lookAt", "fov"]);
            if (frame.fov !== undefined && frame.fov !== camera.fov) fail();
            return { time: finite(frame.time), position: vector(frame.position),
                ...(frame.lookAt !== undefined ? { lookAt: vector(frame.lookAt) } : {}),
                ...(frame.fov !== undefined ? { fov: finite(frame.fov) } : {}) };
        });
        const anchors = list(path.bezierPoints).map(item => {
            const point = record(item); fields(point, ["anchor", "in", "out", "handleMode"]);
            if (point.handleMode !== undefined && !["vertex", "symmetric", "asymmetric"].includes(String(point.handleMode))) fail();
            return { anchor: vector(point.anchor), ...(point.in !== undefined ? { in: vector(point.in) } : {}),
                ...(point.out !== undefined ? { out: vector(point.out) } : {}),
                ...(point.handleMode !== undefined ? { handleMode: point.handleMode as "vertex" | "symmetric" | "asymmetric" } : {}) };
        });
        if (!frames.length || !anchors.length) fail();
        const offset = path.offset === undefined ? [0, 0, 0] as PrevisVec3 : vector(path.offset);
        const motion: PrevisLtvCameraMotion = {
            version: 1, duration, baseY: frames[0].position[1] - anchors[0].anchor[1] - offset[1],
            matrix: ltvPrevisSceneMatrix(source.environment).toArray(),
            path: { start: finite(path.start), end: finite(path.end), points: list(path.points).map(vector), bezierPoints: anchors, offset },
            sourceTrack: { id: trackId, name: name(track.name), targetId, interpolation: track.interpolation as "linear" | "catmullRom",
                pathId: id(path.id), pathName: name(path.name), orientToPath: path.orientToPath as boolean, keyframes: frames },
        };
        validateLtvPrevisCameraMotion(motion);
        motions.set(targetId, motion);
        if (animation.activeCameraTrackId === trackId) activeCameraId = targetId;
    }
    if (!tracks.length || !activeCameraId) fail();
    return { duration, activeCameraId, motions, emptyTracks };
}
