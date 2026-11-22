import { BoxGeometry, CylinderGeometry, Euler, Group, Matrix4, Mesh, MeshStandardMaterial, Quaternion, TorusGeometry, Vector3 } from "three";
import type { PrevisObject, PrevisTransform, PrevisVec3 } from "@/types/previs";
import { ltvPrevisSceneMatrix } from "./ltv-director-camera";

function record(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("源道具格式错误");
    return value as Record<string, unknown>;
}
function vector(value: unknown): Vector3 {
    const p = record(value);
    if ([p.x, p.y, p.z].some((v) => typeof v !== "number" || !Number.isFinite(v))) throw new Error("源道具变换错误");
    return new Vector3(p.x as number, p.y as number, p.z as number);
}

/** Applies the source contentRoot matrix once, without fitting or recentring assets. */
export function applyLtvPrevisSceneTransform(transform: PrevisTransform, environment: unknown): PrevisTransform {
    if ([...transform.position, ...transform.rotation, ...transform.scale].some((n) => !Number.isFinite(n)) || transform.scale.some((n) => Math.abs(n) < 1e-10)) throw new Error("源对象变换退化");
    const local = new Matrix4().compose(new Vector3(...transform.position), new Quaternion().setFromEuler(new Euler(...transform.rotation)), new Vector3(...transform.scale));
    const world = ltvPrevisSceneMatrix(environment).multiply(local);
    const position = new Vector3(), quaternion = new Quaternion(), scale = new Vector3();
    world.decompose(position, quaternion, scale);
    const rotation = new Euler().setFromQuaternion(quaternion, "XYZ");
    return { position: position.toArray() as PrevisVec3, rotation: [rotation.x, rotation.y, rotation.z], scale: scale.toArray() as PrevisVec3 };
}

/** Source constructor dimensions and materials; unknown assets must not become cubes. */
export function prepareLtvPrevisProp(source: unknown, environment: unknown, identity: { id: string; name: string }): { model: Group; object: PrevisObject } {
    const input = record(source);
    if (!identity.id.trim() || !identity.name.trim()) throw new Error("源道具目标身份缺失");
    if (!["mesh_cylinder", "mesh_torus", "mesh_cube", "chair", "wall_3m"].includes(String(input.assetId))) throw new Error("源道具几何尚未接入");
    if (input.modelUrl || input.imageUrl) throw new Error("源道具媒体变体需独立接入");
    if (typeof input.visible !== "boolean") throw new Error("源道具可见性错误");
    const color = input.color ?? "#d7e7ff";
    if (typeof color !== "string" || !/^#[0-9a-f]{6}$/i.test(color)) throw new Error("源道具颜色错误");
    const uniform = input.uniformScale ?? 1;
    if (typeof uniform !== "number" || !Number.isFinite(uniform) || Math.abs(uniform) < 1e-10) throw new Error("源道具统一缩放错误");
    const position = vector(input.position), rotation = vector(input.rotation).multiplyScalar(Math.PI / 180), scale = vector(input.scale).multiplyScalar(uniform);
    const transform = applyLtvPrevisSceneTransform({ position: position.toArray() as PrevisVec3, rotation: rotation.toArray() as PrevisVec3, scale: scale.toArray() as PrevisVec3 }, environment);
    const furniture = input.assetId === "chair" || input.assetId === "wall_3m";
    const material = new MeshStandardMaterial({ color, roughness: furniture ? 0.7 : 0.62, metalness: furniture ? 0.1 : 0.04 });
    const model = new Group();
    if (furniture) {
        const addBox = (dimensions: PrevisVec3, position: PrevisVec3) => {
            const mesh = new Mesh(new BoxGeometry(...dimensions), material);
            mesh.position.fromArray(position); model.add(mesh);
        };
        if (input.assetId === "chair") {
            for (const [x, z] of [[-0.18, -0.16], [0.18, -0.16], [-0.18, 0.16], [0.18, 0.16]]) addBox([0.04, 0.48, 0.04], [x, 0.24, z]);
            addBox([0.44, 0.04, 0.42], [0, 0.48, 0]);
            addBox([0.44, 0.4, 0.04], [0, 0.68, -0.2]);
        } else addBox([3, 2.4, 0.15], [0, 1.2, 0]);
    } else {
        const cylinder = input.assetId === "mesh_cylinder", cube = input.assetId === "mesh_cube";
        const geometry = cylinder ? new CylinderGeometry(0.42, 0.42, 0.9, 32) : cube ? new BoxGeometry(0.8, 0.8, 0.8) : new TorusGeometry(0.34, 0.12, 20, 48);
        const mesh = new Mesh(geometry, material);
        mesh.position.y = cylinder ? 0.45 : cube ? 0.4 : 0.46;
        model.add(mesh);
    }
    return { model, object: { ...identity, kind: "model", modelNormalization: "preserve-source", transform, color, visible: input.visible, castShadow: false, receiveShadow: false, keyframes: [] } };
}
