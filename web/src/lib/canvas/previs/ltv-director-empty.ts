import { Group } from "three";
import type { PrevisObject, PrevisVec3 } from "@/types/previs";
import { applyLtvPrevisSceneTransform } from "./ltv-director-prop";

/** Source locator has identity and position, but no renderable geometry or substitute mesh. */
export function prepareLtvPrevisEmpty(source: unknown, environment: unknown, prefix: string): { object: PrevisObject; model: Group } {
    if (!source || typeof source !== "object" || Array.isArray(source)) throw new Error("源空对象格式错误");
    const value = source as Record<string, unknown>;
    if (Object.keys(value).some(key => !["id", "label", "position"].includes(key))
        || typeof value.id !== "string" || !value.id.trim() || typeof value.label !== "string" || !value.label.trim()) throw new Error("源空对象字段或身份未接入");
    const position = value.position as Record<string, unknown> | undefined;
    if (!position || typeof position !== "object" || Array.isArray(position) || Object.keys(position).some(key => !["x", "y", "z"].includes(key))
        || [position.x, position.y, position.z].some(v => typeof v !== "number" || !Number.isFinite(v))) throw new Error("源空对象位置错误");
    const model = new Group(); model.name = "source-empty-locator";
    const object: PrevisObject = {
        id: `${prefix}empty:${value.id}`, name: value.label, kind: "model", modelNormalization: "preserve-source",
        transform: applyLtvPrevisSceneTransform({ position: [position.x, position.y, position.z] as PrevisVec3, rotation: [0, 0, 0], scale: [1, 1, 1] }, environment),
        color: "#ffffff", visible: true, castShadow: false, receiveShadow: false, keyframes: [],
    };
    return { object, model };
}
