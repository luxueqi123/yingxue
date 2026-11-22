import { Matrix4, PerspectiveCamera, Vector3 } from "three";
import type { PrevisCamera, PrevisLtvCameraMotion, PrevisTransform, PrevisVec3 } from "@/types/previs";

type Anchor = PrevisLtvCameraMotion["path"]["bezierPoints"][number];
type Sample = { segment: number; alpha: number; distance: number };
type Compiled = { samples: Sample[]; matrix: Matrix4; displayPoints?: PrevisVec3[] };
const compiled = new WeakMap<PrevisLtvCameraMotion, Compiled>();
const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const vector = (value: unknown): value is PrevisVec3 => Array.isArray(value) && value.length === 3 && value.every(finite);
const plain = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === "object" && !Array.isArray(value));
const only = (value: Record<string, unknown>, keys: string[]) => Object.keys(value).every(key => keys.includes(key));
const invalid = () => new Error("源机位运动格式错误或包含尚未接入的时序字段。");

/** Accept the verified zero-start, untimed Bezier contract; never guess another clock. */
function validateMotionShape(value: unknown): asserts value is PrevisLtvCameraMotion {
    if (!plain(value) || !only(value, ["version", "duration", "baseY", "matrix", "path", "sourceTrack"]) || value.version !== 1
        || !finite(value.duration) || value.duration <= 0 || !finite(value.baseY)
        || !Array.isArray(value.matrix) || value.matrix.length !== 16 || !value.matrix.every(finite)) throw invalid();
    const matrix = new Matrix4().fromArray(value.matrix);
    if (value.matrix[3] !== 0 || value.matrix[7] !== 0 || value.matrix[11] !== 0 || value.matrix[15] !== 1 || !finite(matrix.determinant()) || Math.abs(matrix.determinant()) < 1e-12) throw invalid();
    const path = value.path;
    if (!plain(path) || !only(path, ["start", "end", "points", "bezierPoints", "offset"]) || path.start !== 0
        || !finite(path.end) || path.end <= 0 || path.end > value.duration || !vector(path.offset)
        || !Array.isArray(path.points) || path.points.length < 2 || path.points.length > 120 || !path.points.every(vector)
        || !Array.isArray(path.bezierPoints) || path.bezierPoints.length < 2 || path.bezierPoints.length > 120) throw invalid();
    for (const anchor of path.bezierPoints) {
        if (!plain(anchor) || !only(anchor, ["anchor", "in", "out", "handleMode"]) || !vector(anchor.anchor)
            || anchor.in !== undefined && !vector(anchor.in) || anchor.out !== undefined && !vector(anchor.out)
            || anchor.handleMode !== undefined && !["vertex", "symmetric", "asymmetric"].includes(String(anchor.handleMode))) throw invalid();
    }
    if (value.sourceTrack !== undefined) {
        const source = value.sourceTrack;
        if (!plain(source) || !only(source, ["id", "name", "targetId", "interpolation", "pathId", "pathName", "orientToPath", "keyframes"])
            || ![source.id, source.targetId, source.pathId].every(item => typeof item === "string" && item.trim())
            || typeof source.name !== "string" || typeof source.pathName !== "string" || typeof source.orientToPath !== "boolean"
            || !["linear", "catmullRom"].includes(String(source.interpolation)) || !Array.isArray(source.keyframes)
            || source.keyframes.length < 2 || source.keyframes.length > 120) throw invalid();
        let previous = -1;
        for (const frame of source.keyframes) {
            if (!plain(frame) || !only(frame, ["time", "position", "lookAt", "fov"]) || !finite(frame.time)
                || frame.time < 0 || frame.time > value.duration || frame.time <= previous || !vector(frame.position)
                || frame.lookAt !== undefined && !vector(frame.lookAt)
                || frame.fov !== undefined && (!finite(frame.fov) || frame.fov <= 0 || frame.fov >= 180)) throw invalid();
            previous = frame.time;
        }
    }
}

function lerp(left: PrevisVec3, right: PrevisVec3, alpha: number): PrevisVec3 {
    return [left[0] + (right[0] - left[0]) * alpha, left[1] + (right[1] - left[1]) * alpha, left[2] + (right[2] - left[2]) * alpha];
}
function bezier(left: Anchor, right: Anchor, alpha: number) {
    const a = lerp(left.anchor, left.out ?? left.anchor, alpha);
    const b = lerp(left.out ?? left.anchor, right.in ?? right.anchor, alpha);
    const c = lerp(right.in ?? right.anchor, right.anchor, alpha);
    return lerp(lerp(a, b, alpha), lerp(b, c, alpha), alpha);
}
function compile(motion: PrevisLtvCameraMotion): Compiled {
    validateMotionShape(motion);
    const anchors = motion.path.bezierPoints;
    const samples: Sample[] = [];
    let distance = 0;
    for (let segment = 0; segment < anchors.length - 1; segment++) {
        let previous = anchors[segment].anchor;
        if (!samples.length) samples.push({ segment, alpha: 0, distance: 0 });
        // Matches source eC: sum every step, but record only movement above 1e-5.
        for (let step = 1; step <= 96; step++) {
            const alpha = step / 96, next = bezier(anchors[segment], anchors[segment + 1], alpha);
            const delta = Math.hypot(next[0] - previous[0], next[1] - previous[1], next[2] - previous[2]);
            distance += delta;
            if (delta > 1e-5) samples.push({ segment, alpha, distance });
            previous = next;
        }
    }
    if (samples.length < 2 || !finite(distance) || distance <= 1e-8) throw invalid();
    const result = { samples, matrix: new Matrix4().fromArray(motion.matrix) };
    compiled.set(motion, result);
    return result;
}

export function validateLtvPrevisCameraMotion(value: unknown): asserts value is PrevisLtvCameraMotion {
    validateMotionShape(value);
    // Import/copy admission must reject an unusable curve before it reaches CAM.
    compile(value);
}

/** Immutable motion identity owns the bounded arc-length cache; nothing is persisted in the cache. */
export function sampleLtvPrevisCameraPosition(motion: PrevisLtvCameraMotion, time: number): PrevisVec3 {
    const { samples, matrix } = compiled.get(motion) ?? compile(motion);
    const clock = Math.max(0, Math.min(motion.duration, finite(time) ? time : 0));
    const progress = Math.min(1, (Math.min(clock, motion.path.end) - motion.path.start) / Math.max(motion.path.end - motion.path.start, 1e-6));
    const desired = progress * samples[samples.length - 1].distance;
    let low = 0, high = samples.length - 1;
    while (low < high) {
        const middle = Math.floor((low + high) / 2);
        if (samples[middle].distance < desired) low = middle + 1;
        else high = middle;
    }
    const next = samples[low], previous = samples[Math.max(0, low - 1)];
    const alpha = Math.max(0, Math.min(1, (desired - previous.distance) / Math.max(next.distance - previous.distance, 1e-8)));
    // Source eS crosses a segment boundary at the next sample, not through a fictitious control span.
    const local = next.segment === previous.segment ? previous.alpha + (next.alpha - previous.alpha) * alpha : next.alpha;
    const position = bezier(motion.path.bezierPoints[next.segment], motion.path.bezierPoints[next.segment + 1], local);
    const offset = motion.path.offset;
    const world = new Vector3(position[0] + offset[0], position[1] + offset[1] + motion.baseY, position[2] + offset[2]).applyMatrix4(matrix).toArray() as PrevisVec3;
    if (!vector(world)) throw invalid();
    return world;
}

/** A bounded display polyline, not a new linear movement or replacement keyframe track. */
export function resolveLtvPrevisCameraMotionPath(motion: PrevisLtvCameraMotion, time: number): { points: PrevisVec3[]; current: PrevisVec3 } {
    const data = compiled.get(motion) ?? compile(motion);
    data.displayPoints ??= Array.from({ length: 193 }, (_, index) => sampleLtvPrevisCameraPosition(motion, motion.path.end * index / 192));
    return { points: data.displayPoints, current: sampleLtvPrevisCameraPosition(motion, time) };
}

export type LtvPrevisCameraMotionEdit =
    | { kind: "anchor" | "in" | "out"; index: number; value: PrevisVec3 }
    | { kind: "offset"; value: PrevisVec3 }
    | { kind: "end"; value: number };

/** Editing replaces the immutable motion identity, so CAM and its display cache cannot retain an old path. */
export function editLtvPrevisCameraMotion(motion: PrevisLtvCameraMotion, edit: LtvPrevisCameraMotionEdit): PrevisLtvCameraMotion {
    validateLtvPrevisCameraMotion(motion);
    const next = structuredClone(motion);
    if (edit.kind === "end") next.path.end = edit.value;
    else if (edit.kind === "offset") next.path.offset = [...edit.value];
    else {
        if (!Number.isSafeInteger(edit.index) || edit.index < 0 || edit.index >= next.path.bezierPoints.length) throw invalid();
        next.path.bezierPoints[edit.index][edit.kind] = [...edit.value];
    }
    validateLtvPrevisCameraMotion(next);
    return next;
}

export function resolveLtvPrevisCameraTransform(camera: Pick<PrevisCamera, "target" | "ltvCameraMotion" | "sourceCamera" | "keyframes">, time: number): PrevisTransform | undefined {
    if (camera.ltvCameraMotion === undefined) return;
    if (camera.sourceCamera || camera.keyframes.length || !vector(camera.target)) throw invalid();
    const position = sampleLtvPrevisCameraPosition(camera.ltvCameraMotion, time);
    if (!vector(position) || new Vector3(...position).distanceToSquared(new Vector3(...camera.target)) < 1e-12) throw invalid();
    const view = new PerspectiveCamera();
    view.position.fromArray(position); view.lookAt(...camera.target);
    return { position, rotation: [view.rotation.x, view.rotation.y, view.rotation.z], scale: [1, 1, 1] };
}
