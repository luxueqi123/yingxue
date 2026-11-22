import { Mesh, SkinnedMesh, type Object3D } from "three";
import { SkeletonUtils } from "three-stdlib";
import type { PrevisScene } from "@/types/previs";
import { prepareLtvPrevisActorModel } from "./ltv-director-actor";
import { convertLtvPrevisCamera } from "./ltv-director-camera";
import { prepareLtvPrevisEnvironment } from "./ltv-director-environment";
import { applyLtvPrevisSceneTransform, prepareLtvPrevisProp } from "./ltv-director-prop";
import { planLtvPrevisCameraAnimation, type LtvPrevisCameraAnimationPlan } from "./ltv-director-camera-animation";
import { prepareLtvPrevisEmpty } from "./ltv-director-empty";
import { ltvPrevisOutputFrame } from "./director-output-frame";

type RecordValue = Record<string, unknown>;
function record(value: unknown): RecordValue {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("源导演台场景格式错误");
    return value as RecordValue;
}
function objects(value: unknown): RecordValue[] {
    if (!Array.isArray(value)) throw new Error("源导演台对象列表错误");
    return value.map(record);
}
function sourceId(value: unknown): string {
    if (typeof value !== "string" || !value.trim()) throw new Error("源导演台对象 ID 缺失");
    return value;
}

export type PreparedLtvPrevisStaticScene = {
    scene: PrevisScene;
    assets: Array<{ objectId: string; sourceId?: string; model: Object3D }>;
    /** Retained outside the scene until source screenshots are migrated as actual resources. */
    screenshots: Array<{ cameraId: string; source: RecordValue }>;
    /** Release prepared resources only, never shared source geometry or textures. Idempotent. */
    dispose: () => void;
};

/** No uploads or native-project writes. The caller owns assets and must persist every GLB before binding. */
export function prepareLtvPrevisStaticScene(composition: unknown, identity: { id: string; title: string; now: string }, models: ReadonlyMap<string, Object3D>): PreparedLtvPrevisStaticScene {
    return prepareLtvPrevisScene(composition, identity, models);
}

export function prepareLtvPrevisCameraAnimatedScene(composition: unknown, identity: { id: string; title: string; now: string }, models: ReadonlyMap<string, Object3D>): PreparedLtvPrevisStaticScene {
    const plan = planLtvPrevisCameraAnimation(composition);
    return prepareLtvPrevisScene(composition, identity, models, plan);
}

function prepareLtvPrevisScene(composition: unknown, identity: { id: string; title: string; now: string }, models: ReadonlyMap<string, Object3D>, animation?: LtvPrevisCameraAnimationPlan): PreparedLtvPrevisStaticScene {
    const source = record(composition), environment = record(source.environment);
    if (!identity.id.trim() || !identity.title.trim() || !Number.isFinite(Date.parse(identity.now))) throw new Error("原生场景身份或时间错误");
    if (!animation && source.animation !== undefined && source.animation !== null) throw new Error("源动画需完整接入，不得压成静态场景");
    if (objects(source.characterGroups ?? []).length) throw new Error("源分组需独立接入，不得丢弃");
    const empties = objects(source.emptyObjects ?? []);
    // Source grounding uses a world AABB. Rotated scene roots need grounding in
    // that parent space; until that path is implemented do not silently flatten it.
    const sceneRotation = record(environment.sceneRotation ?? { x: 0, y: 0, z: 0 });
    if ([sceneRotation.x, sceneRotation.y, sceneRotation.z].some((v) => v !== 0)) throw new Error("旋转场景的角色落地需按父级空间接入");
    const characters = objects(source.characters), props = objects(source.props), cameras = objects(source.cameras);
    if (!cameras.length) throw new Error("源导演台没有摄影机");
    const ids = [...characters, ...props, ...cameras, ...empties].map((item) => sourceId(item.id));
    if (new Set(ids).size !== ids.length) throw new Error("源导演台对象 ID 重复");
    if ([...characters, ...props, ...cameras].some((item) => item.locked === true)) throw new Error("源锁定状态尚需原生编辑权限承接");
    const names = (item: RecordValue, fallback: string) => typeof item.label === "string" && item.label.trim() ? item.label : fallback;
    const prefix = `${identity.id}:`;
    if (cameras.some(camera => empties.some(empty => empty.id === camera.lookAtTarget || empty.id === camera.followTargetId))) throw new Error("空对象机位目标需动态引用绑定，不得静态替代");
    const shared = new Set<unknown>();
    for (const model of models.values()) model.traverse((child) => {
        if (!(child instanceof Mesh)) return;
        shared.add(child.geometry);
        for (const material of Array.isArray(child.material) ? child.material : [child.material]) shared.add(material);
        if (child instanceof SkinnedMesh) shared.add(child.skeleton);
    });
    const owned: Object3D[] = [];
    let disposed = false;
    const dispose = () => {
        if (disposed) return;
        disposed = true;
        const released = new Set<unknown>();
        const release = (resource: { dispose(): void }) => {
            if (!shared.has(resource) && !released.has(resource)) { released.add(resource); resource.dispose(); }
        };
        for (const model of owned) model.traverse((child) => {
            if (!(child instanceof Mesh)) return;
            release(child.geometry);
            for (const material of Array.isArray(child.material) ? child.material : [child.material]) release(material);
            if (child instanceof SkinnedMesh) release(child.skeleton);
        });
    };
    try {
        const env = prepareLtvPrevisEnvironment(environment, `${prefix}environment`);
        owned.push(env.ground.model);
        const scene: PrevisScene = { id: identity.id, version: 1, title: identity.title, ...env.settings, outputFrame: ltvPrevisOutputFrame(), objects: [], cameras: [], shots: [], activeShotId: "", createdAt: identity.now, updatedAt: identity.now };
        const assets: PreparedLtvPrevisStaticScene["assets"] = [];
        const screenshots: PreparedLtvPrevisStaticScene["screenshots"] = [];
        for (const actor of characters) {
            const id = sourceId(actor.id);
            if (typeof actor.modelUrl !== "string" || !models.has(actor.modelUrl)) throw new Error(`源角色模型未补齐：${id}`);
            const clone = SkeletonUtils.clone(models.get(actor.modelUrl)!);
            owned.push(clone);
            const prepared = prepareLtvPrevisActorModel(clone, actor, { id: `${prefix}actor:${id}`, name: names(actor, "角色") });
            prepared.object.transform = applyLtvPrevisSceneTransform(prepared.object.transform, environment);
            scene.objects.push(prepared.object);
            assets.push({ objectId: prepared.object.id, sourceId: id, model: prepared.model });
        }
        for (const prop of props) {
            const id = sourceId(prop.id), prepared = prepareLtvPrevisProp(prop, environment, { id: `${prefix}prop:${id}`, name: names(prop, "道具") });
            owned.push(prepared.model);
            scene.objects.push(prepared.object);
            assets.push({ objectId: prepared.object.id, sourceId: id, model: prepared.model });
        }
        scene.objects.push(env.ground.object);
        assets.push({ objectId: env.ground.object.id, model: env.ground.model });
        for (const empty of empties) {
            const prepared = prepareLtvPrevisEmpty(empty, environment, prefix);
            owned.push(prepared.model);
            scene.objects.push(prepared.object);
            assets.push({ objectId: prepared.object.id, sourceId: sourceId(empty.id), model: prepared.model });
        }
        for (const camera of cameras) {
            const id = sourceId(camera.id), nativeId = `${prefix}camera:${id}`;
            const native = convertLtvPrevisCamera(camera, source, { id: nativeId, name: names(camera, "机位") });
            const motion = animation?.motions.get(id);
            if (motion) native.ltvCameraMotion = structuredClone(motion);
            const emptyTrack = animation?.emptyTracks.get(id);
            if (emptyTrack) native.ltvEmptyCameraTrack = structuredClone(emptyTrack);
            scene.cameras.push(native);
            scene.shots.push({ id: `${prefix}shot:${id}`, name: names(camera, "镜头"), cameraId: nativeId, duration: animation?.duration ?? 5, fps: 24, shotSize: "medium", cameraMove: "static", prompt: "" });
            for (const screenshot of objects(camera.screenshots ?? [])) screenshots.push({ cameraId: nativeId, source: structuredClone(screenshot) });
        }
        scene.activeShotId = animation ? `${prefix}shot:${animation.activeCameraId}` : scene.shots[0].id;
        return { scene, assets, screenshots, dispose };
    } catch (error) {
        dispose();
        throw error;
    }
}

/** Binding requires stable resource addresses. Merely preparing a GLB is not persistence. */
export function bindLtvPrevisSceneAssets(scene: PrevisScene, resources: ReadonlyMap<string, { url: string; storageKey?: string; assetId?: string }>): PrevisScene {
    const result = structuredClone(scene);
    for (const object of result.objects) {
        const resource = resources.get(object.id);
        if (!resource) throw new Error(`导演台模型尚未保存：${object.id}`);
        let valid = false;
        if (typeof resource.url !== "string" || /[\s\\\u0000-\u001f\u007f]/.test(resource.url)) throw new Error("导演台资源地址包含非法字符");
        try { const url = new URL(resource.url); valid = url.protocol === "https:" && !url.username && !url.password; } catch { valid = /^\/(?!\/)[^\s\\]+$/.test(resource.url); }
        if (!valid) throw new Error("导演台模型需持久化 HTTPS 或站内资源地址");
        for (const field of ["storageKey", "assetId"] as const) {
            const value = resource[field];
            if (value !== undefined && (typeof value !== "string" || !value.trim())) throw new Error("导演台资源标识格式错误");
        }
        // Resource responses must not overwrite scene identities or transforms.
        object.url = resource.url;
        object.storageKey = resource.storageKey;
        object.assetId = resource.assetId;
        object.mimeType = "model/gltf-binary";
    }
    return result;
}
