import { Euler, Matrix4, PerspectiveCamera, Quaternion, Vector3 } from "three";
import type { PrevisCamera, PrevisVec3 } from "@/types/previs";

function record(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("源导演台对象格式错误");
    return value as Record<string, unknown>;
}
function vector(value: unknown): Vector3 {
    const v = record(value);
    if ([v.x, v.y, v.z].some((n) => typeof n !== "number" || !Number.isFinite(n))) throw new Error("源导演台坐标格式错误");
    return new Vector3(v.x as number, v.y as number, v.z as number);
}

export function ltvPrevisSceneMatrix(environment: unknown): Matrix4 {
    const env = record(environment), scale = env.sceneScale ?? 3;
    if (typeof scale !== "number" || !Number.isFinite(scale)) throw new Error("源场景缩放错误");
    const position = vector(env.sceneTranslation ?? { x: 0, y: 0, z: 0 });
    const rotation = vector(env.sceneRotation ?? { x: 0, y: 0, z: 0 }).multiplyScalar(Math.PI / 180);
    // The source scene control clamps, rather than rejecting, its saved scale.
    return new Matrix4().compose(position, new Quaternion().setFromEuler(new Euler(rotation.x, rotation.y, rotation.z)), new Vector3().setScalar(Math.max(0.1, Math.min(10, scale))));
}

/** Static capture camera only; animated following is not flattened into this entry. */
export function convertLtvPrevisCamera(source: unknown, composition: unknown, identity: { id: string; name: string }): PrevisCamera {
    const camera = record(source), scene = record(composition);
    if (!identity.id.trim() || !identity.name.trim()) throw new Error("原生机位身份缺失");
    if (camera.followTargetId) throw new Error("跟随摄影机需接入跟随求值，不能静态替代");
    const position = vector(camera.position), world = ltvPrevisSceneMatrix(scene.environment);
    const targetId = camera.lookAtTarget;
    if (typeof targetId !== "string") throw new Error("源机位目标格式错误");
    let target: Vector3;
    if (targetId === "__none__") {
        const rotation = vector(camera.cameraRotation ?? { x: 0, y: 0, z: 0 }).multiplyScalar(Math.PI / 180);
        target = position.clone().addScaledVector(new Vector3(Math.sin(rotation.y), -Math.sin(rotation.x) * Math.cos(rotation.y), Math.cos(rotation.x) * Math.cos(rotation.y)), 10);
    } else if (targetId) {
        const find = (items: unknown) => Array.isArray(items) ? items.map(record).filter((item) => item.id === targetId) : [];
        const actors = find(scene.characters), empty = find(scene.emptyObjects);
        if (actors.length + empty.length !== 1) throw new Error("源机位目标缺失、重复或尚未接入");
        target = vector((actors[0] ?? empty[0]).position);
        if (actors.length) target.y += 1.2;
    } else target = vector(camera.lookAt);
    position.applyMatrix4(world); target.applyMatrix4(world);
    const fov = camera.fov, zoom = camera.zoom ?? 1;
    if (typeof fov !== "number" || !Number.isFinite(fov) || fov <= 0 || fov >= 180 || typeof zoom !== "number" || !Number.isFinite(zoom) || zoom <= 0) throw new Error("源机位投影参数错误");
    const native = new PerspectiveCamera(fov, 1, 0.1, 2000);
    native.position.copy(position); native.zoom = zoom;
    if (camera.cameraQuaternion !== undefined) {
        const q = camera.cameraQuaternion;
        if (!Array.isArray(q) || q.length !== 4 || q.some((v) => typeof v !== "number" || !Number.isFinite(v)) || new Quaternion(...q).lengthSq() < 1e-12) throw new Error("源机位四元数错误");
        native.quaternion.fromArray(q).normalize();
        target = position.clone().addScaledVector(new Vector3(0, 0, -1).applyQuaternion(native.quaternion), 10);
    } else {
        if (position.distanceToSquared(target) < 1e-12) throw new Error("源机位位置与目标重合");
        native.lookAt(target);
        if (targetId === "__none__") native.rotateZ(vector(camera.cameraRotation ?? { x: 0, y: 0, z: 0 }).z * Math.PI / 180);
    }
    const effectiveFov = native.getEffectiveFOV();
    return {
        ...identity, transform: { position: position.toArray() as PrevisVec3, rotation: [native.rotation.x, native.rotation.y, native.rotation.z], scale: [1, 1, 1] },
        target: target.toArray() as PrevisVec3, fov: effectiveFov,
        focalLength: 18 / Math.tan(effectiveFov * Math.PI / 360), aperture: 2.8, focusDistance: position.distanceTo(target), near: 0.1, far: 2000, keyframes: [],
    };
}
