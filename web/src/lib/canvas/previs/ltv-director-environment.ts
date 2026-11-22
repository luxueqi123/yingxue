import { Group, Mesh, MeshStandardMaterial, PlaneGeometry } from "three";
import type { PrevisLight, PrevisObject, PrevisScene, PrevisVec3 } from "@/types/previs";
import { applyLtvPrevisSceneTransform } from "./ltv-director-prop";

export function prepareLtvPrevisEnvironment(source: unknown, prefix: string): {
    settings: Pick<PrevisScene, "background" | "environmentIntensity" | "gridVisible" | "groundVisible" | "toneMapping" | "lights">;
    ground: { model: Group; object: PrevisObject };
} {
    if (!source || typeof source !== "object" || Array.isArray(source) || !prefix.trim()) throw new Error("源导演台环境格式错误");
    const env = source as Record<string, unknown>;
    if (env.panoramaUrl || env.gaussianSplatUrl) throw new Error("全景或高斯环境需完整媒体接入，不能用天空色替代");
    if (typeof env.skyColor !== "string" || !/^#[0-9a-f]{6}$/i.test(env.skyColor)) throw new Error("源天空颜色错误");
    if (typeof env.groundVisible !== "boolean" || typeof env.groundOpacity !== "number" || !Number.isFinite(env.groundOpacity) || env.groundOpacity < 0 || env.groundOpacity > 1 || typeof env.groundHeight !== "number" || !Number.isFinite(env.groundHeight)) throw new Error("源地面参数错误");
    const rawScale = env.sceneScale ?? 3;
    if (typeof rawScale !== "number" || !Number.isFinite(rawScale)) throw new Error("源场景缩放错误");
    const scale = Math.max(0.1, Math.min(10, rawScale));
    const transform = applyLtvPrevisSceneTransform({ position: [0, env.groundHeight / scale, 0], rotation: [0, 0, 0], scale: [1, 1, 1] }, env);
    const model = new Group();
    const floor = new Mesh(new PlaneGeometry(40, 40), new MeshStandardMaterial({ color: "#0d1829", roughness: 0.9, transparent: true, opacity: env.groundOpacity }));
    floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; model.add(floor);
    const light = (suffix: string, name: string, type: PrevisLight["type"], position: PrevisVec3, color: string, intensity: number): PrevisLight => ({ id: `${prefix}-${suffix}`, name, type, transform: { position, rotation: [0, 0, 0], scale: [1, 1, 1] }, color, intensity, castShadow: false });
    return {
        settings: { background: env.skyColor, environmentIntensity: 0, groundVisible: false, gridVisible: false, toneMapping: "none", lights: [
            light("ambient", "环境光", "ambient", [0, 0, 0], "#ffffff", 1.05),
            { ...light("hemisphere", "半球光", "hemisphere", [0, 1, 0], "#ffffff", 0.85), groundColor: "#2c3140" },
            { ...light("key", "主光", "directional", [5, 10, 5], "#ffffff", 1.2), castShadow: true, shadowNear: 0.5, shadowFar: 50 },
            light("fill", "补光", "directional", [-5, 3, -5], "#f5f7ff", 0.75),
        ] },
        ground: { model, object: { id: `${prefix}-ground`, name: "源场景地面", kind: "model", modelNormalization: "preserve-source", transform, color: "#0d1829", visible: env.groundVisible && env.groundOpacity > 0.01, castShadow: false, receiveShadow: true, keyframes: [] } },
    };
}
