import { AnimationClip, AnimationMixer, LoopOnce, Matrix4, Object3D, PerspectiveCamera, Quaternion, Vector3 } from "three";
import type { PrevisCamera, PrevisObject, PrevisQuat, PrevisVec3 } from "@/types/previs";

export function detachThreeboxCamera(camera: PrevisCamera): PrevisCamera {
    if (!camera.sourceCamera) return camera;
    const { sourceCamera: _sourceCamera, ...manual } = camera;
    return manual;
}

export function resolvePrevisImportedAnimations(object: Pick<PrevisObject, "modelNormalization" | "sourceAnimation">, clips: AnimationClip[]): AnimationClip[] {
    return object.modelNormalization === "preserve-source" && object.sourceAnimation?.mode !== "threebox-scene" ? [] : clips;
}

/** 源片段共享秒时钟；每次 seek 显式恢复 action，支持末帧后向前拖动。 */
export function createThreeboxAnimationRuntime(root: Object3D, clips: AnimationClip[], existingMixer?: AnimationMixer) {
    const mixer = existingMixer ?? new AnimationMixer(root);
    const actions = clips.map((clip) => {
        if (!Number.isFinite(clip.duration) || clip.duration < 0) throw new Error("源动画时长错误");
        const action = mixer.clipAction(clip);
        action.setLoop(LoopOnce, 1); action.clampWhenFinished = true; action.play();
        return action;
    });
    const cameras = new Map<string, PerspectiveCamera>();
    root.traverse((node) => {
        if ((node as PerspectiveCamera).isPerspectiveCamera && typeof node.userData.hf_id === "string") {
            if (cameras.has(node.userData.hf_id)) throw new Error("源摄影机 ID 重复");
            cameras.set(node.userData.hf_id, node as PerspectiveCamera);
        }
    });
    return {
        seek(time: number) {
            if (!Number.isFinite(time)) throw new Error("动画时间错误");
            for (const action of actions) {
                action.enabled = true; action.paused = false;
                action.time = Math.min(Math.max(0, time), action.getClip().duration);
            }
            mixer.update(0);
            root.updateWorldMatrix(true, true);
        },
        readCamera(entityId: string, cameraId: string) {
            const camera = cameras.get(entityId);
            if (!camera) throw new Error("源摄影机缺失");
            camera.updateWorldMatrix(true, false);
            const position = new Vector3(), quaternion = new Quaternion(), scale = new Vector3();
            camera.matrixWorld.decompose(position, quaternion, scale);
            const recomposed = new Matrix4().compose(position, quaternion, scale);
            if (!camera.matrixWorld.elements.every((value, i) => Math.abs(value - recomposed.elements[i]) <= 1e-5 * Math.max(1, Math.abs(value)))) throw new Error("摄影机世界变换含剪切");
            const forward = new Vector3(0, 0, -1).applyQuaternion(quaternion);
            return { cameraId, position: position.toArray() as PrevisVec3, quaternion: quaternion.toArray() as PrevisQuat,
                target: position.clone().add(forward).toArray() as PrevisVec3,
                up: new Vector3(0, 1, 0).applyQuaternion(quaternion).toArray() as PrevisVec3,
                fov: camera.fov, near: camera.near, far: camera.far, aspect: camera.aspect };
        },
        dispose() { mixer.stopAllAction(); mixer.uncacheRoot(root); },
    };
}

export type ThreeboxAnimationRuntime = ReturnType<typeof createThreeboxAnimationRuntime>;
