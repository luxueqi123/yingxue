import { Box3, Color, Group, Mesh, Quaternion, SkinnedMesh, Vector3, type Object3D } from "three";
import type { PrevisHumanoidBone, PrevisObject, PrevisTransform, PrevisVec3 } from "@/types/previs";
import { convertLtvPrevisPose } from "./ltv-director-pose";

function record(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === "object" && !Array.isArray(value);
}

function vector(value: unknown, label: string): PrevisVec3 {
    if (!record(value) || [value.x, value.y, value.z].some((v) => typeof v !== "number" || !Number.isFinite(v))) throw new Error(`源角色${label}格式错误`);
    return [value.x, value.y, value.z] as PrevisVec3;
}

/**
 * Prepares an owned pristine GLB for native preserve-source import/export.
 * Mutates the supplied model; callers must clone shared models first. Cameras,
 * scene transforms, animation and asset persistence belong to the scene importer.
 */
export function prepareLtvPrevisActorModel(model: Object3D, source: unknown, identity: { id: string; name: string }): { model: Object3D; object: PrevisObject } {
    if (!record(source) || !identity.id.trim() || !identity.name.trim()) throw new Error("源角色或目标身份格式错误");
    if (model.parent) throw new Error("源角色模型必须脱离场景后再准备");
    if (source.samSkinnedMesh || source.poseSkeleton || source.useMannequin || source.animalType) throw new Error("此入口只接入原 GLB 角色，不替代 SAM、程序人偶或动物");
    if (!record(source.jointAngles)) throw new Error("源角色缺少明确的关节姿态");
    if (source.skipNormalize !== undefined && typeof source.skipNormalize !== "boolean") throw new Error("源角色规范化参数错误");
    if (typeof source.color !== "string" || !/^#[0-9a-f]{6}$/i.test(source.color)) throw new Error("源角色颜色格式错误");
    if (typeof source.visible !== "boolean" || typeof source.shadowEnabled !== "boolean") throw new Error("源角色可见性或阴影参数错误");
    const scale = vector(source.scale, "缩放"), uniform = source.uniformScale ?? 1;
    if (typeof uniform !== "number" || !Number.isFinite(uniform) || Math.abs(uniform) < 1e-10 || scale.some((v) => Math.abs(v) < 1e-10)) throw new Error("源角色缩放退化");
    const rotation = typeof source.rotation === "number" ? vector({ x: 0, y: source.rotation, z: 0 }, "旋转") : vector(source.rotation, "旋转");
    const transform: PrevisTransform = {
        position: vector(source.position, "位置"),
        rotation: rotation.map((v) => v * Math.PI / 180) as PrevisVec3,
        scale: scale.map((v) => v * uniform) as PrevisVec3,
    };
    const pose = convertLtvPrevisPose(model, source.jointAngles);
    model.updateMatrixWorld(true);
    const height = new Box3().setFromObject(model).getSize(new Vector3()).y;
    if (!Number.isFinite(height) || height <= 0) throw new Error("源角色网格高度错误");
    if (!source.skipNormalize) model.scale.multiplyScalar(1.75 / height);
    model.updateMatrixWorld(true);
    const bounds = new Box3().setFromObject(model), center = bounds.getCenter(new Vector3());
    model.position.x -= center.x;
    model.position.z -= center.z;
    model.position.y -= bounds.min.y;
    model.rotation.y = -Math.PI / 2;
    for (const [bone, rotation] of Object.entries(pose.boneOverrides!)) {
        const name = pose.rig!.boneMap[bone as PrevisHumanoidBone]!;
        model.getObjectByName(name)!.quaternion.copy(new Quaternion(...rotation));
    }
    const wrapper = new Group();
    wrapper.position.fromArray(transform.position);
    wrapper.rotation.set(...transform.rotation);
    wrapper.scale.fromArray(transform.scale);
    wrapper.add(model);
    wrapper.updateMatrixWorld(true);
    const inverse = wrapper.matrixWorld.clone().invert(), posedBounds = new Box3();
    // Source grounds the posed AABB after world -> actor-local conversion. A
    // direct local vertex minimum differs for tilted/non-uniformly scaled actors.
    model.traverse((child) => {
        if (!(child instanceof Mesh)) return;
        let box: Box3;
        if (child instanceof SkinnedMesh) {
            child.skeleton.update();
            child.computeBoundingBox();
            box = child.boundingBox!.clone().applyMatrix4(child.matrixWorld);
        } else box = new Box3().setFromObject(child);
        posedBounds.union(box.applyMatrix4(inverse));
    });
    if (posedBounds.isEmpty() || !Number.isFinite(posedBounds.min.y)) {
        wrapper.remove(model);
        throw new Error("源角色变形包围盒错误");
    }
    const lift = -posedBounds.min.y;
    if (Math.abs(lift) >= 5e-4) model.position.y += lift;
    wrapper.remove(model);
    model.updateMatrixWorld(true);
    const color = new Color(source.color);
    model.traverse((child) => {
        if (!(child instanceof Mesh)) return;
        const materials = (Array.isArray(child.material) ? child.material : [child.material]).map((material) => {
            const copy = material.clone();
            if ("color" in copy && copy.color instanceof Color) { copy.color.copy(color); copy.needsUpdate = true; }
            return copy;
        });
        child.material = Array.isArray(child.material) ? materials : materials[0];
        child.castShadow = source.shadowEnabled as boolean;
        child.receiveShadow = false;
    });
    return { model, object: {
        ...identity, ...pose, kind: "model", role: "actor", modelNormalization: "preserve-source", transform,
        color: source.color, visible: source.visible, castShadow: source.shadowEnabled, receiveShadow: false, keyframes: [],
    } };
}
