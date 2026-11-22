import { Bone, Euler, Quaternion, type Object3D } from "three";
import type { PrevisHumanoidBone, PrevisObject, PrevisQuat } from "@/types/previs";
import { inferPrevisRig } from "./director-rig";

const defaults = {
    body: { bend: 0, turn: 0, tilt: 0 }, torso: { bend: 2, turn: 0, tilt: 0 }, head: { nod: -10, turn: 0, tilt: 0 },
    l_arm: { raise: -5, straddle: 7, turn: 0 }, r_arm: { raise: -5, straddle: 7, turn: 0 },
    l_elbow: { bend: 15 }, r_elbow: { bend: 15 },
    l_leg: { raise: 0, straddle: 0, turn: 0 }, r_leg: { raise: 0, straddle: 0, turn: 0 },
    l_knee: { bend: 0 }, r_knee: { bend: 0 },
};
type Joint = keyof typeof defaults;
type Angles = typeof defaults;

// The source chooses the first traversed exact match across all aliases, not alias priority.
const aliases: Record<Joint, string[]> = {
    body: ["hips", "pelvis", "hip", "root"], torso: ["upperchest", "chest", "spine2", "spine1", "spine"], head: ["head"],
    l_arm: ["leftupperarm", "leftarm", "lupperarm", "larm", "upperarml", "arml"],
    r_arm: ["rightupperarm", "rightarm", "rupperarm", "rarm", "upperarmr", "armr"],
    l_elbow: ["leftforearm", "leftlowerarm", "lforearm", "llowerarm", "forearml", "lowerarml"],
    r_elbow: ["rightforearm", "rightlowerarm", "rforearm", "rlowerarm", "forearmr", "lowerarmr"],
    l_leg: ["leftupleg", "leftupperleg", "leftthigh", "lupleg", "lupperleg", "lthigh", "uplegl", "upperlegl", "thighl"],
    r_leg: ["rightupleg", "rightupperleg", "rightthigh", "rupleg", "rupperleg", "rthigh", "uplegr", "upperlegr", "thighr"],
    l_knee: ["leftleg", "leftlowerleg", "leftcalf", "lleg", "llowerleg", "lcalf", "legl", "lowerlegl", "calfl"],
    r_knee: ["rightleg", "rightlowerleg", "rightcalf", "rleg", "rlowerleg", "rcalf", "legr", "lowerlegr", "calfr"],
};

function record(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === "object" && !Array.isArray(value);
}

function angles(value: unknown): Angles {
    if (value !== undefined && !record(value)) throw new Error("导演台关节角格式错误");
    const result = structuredClone(defaults);
    for (const joint of Object.keys(defaults) as Joint[]) {
        const input = value?.[joint];
        if (input === undefined) continue;
        if (!record(input)) throw new Error(`导演台关节 ${joint} 格式错误`);
        for (const field of Object.keys(defaults[joint])) {
            if (input[field] === undefined) continue;
            if (typeof input[field] !== "number" || !Number.isFinite(input[field])) throw new Error(`导演台关节 ${joint}.${field} 数值错误`);
            (result[joint] as Record<string, number>)[field] = input[field];
        }
    }
    return result;
}

/** Convert a pristine loaded source GLB pose into native absolute bone overrides, without mutating it. */
export function convertLtvPrevisPose(root: Object3D, value: unknown): Pick<PrevisObject, "pose" | "rig" | "boneOverrides"> {
    const a = angles(value), rad = Math.PI / 180;
    // Source lN negates all Euler components before bind * delta; Euler order is significant.
    const rotations: Record<Joint, Euler> = {
        body: new Euler(-a.body.bend * rad, -a.body.turn * rad, -a.body.tilt * rad, "YXZ"),
        torso: new Euler(-a.torso.bend * rad, -a.torso.turn * rad, -a.torso.tilt * rad, "YXZ"),
        head: new Euler(-a.head.nod * rad, -a.head.turn * rad, -a.head.tilt * rad, "YXZ"),
        l_arm: new Euler(a.l_arm.raise * rad, -a.l_arm.turn * rad, a.l_arm.straddle * rad, "ZXY"),
        r_arm: new Euler(a.r_arm.raise * rad, a.r_arm.turn * rad, -a.r_arm.straddle * rad, "ZXY"),
        l_elbow: new Euler(a.l_elbow.bend * rad, 0, 0), r_elbow: new Euler(a.r_elbow.bend * rad, 0, 0),
        l_leg: new Euler(a.l_leg.raise * rad, -a.l_leg.turn * rad, a.l_leg.straddle * rad, "ZXY"),
        r_leg: new Euler(a.r_leg.raise * rad, a.r_leg.turn * rad, -a.r_leg.straddle * rad, "ZXY"),
        l_knee: new Euler(-a.l_knee.bend * rad, 0, 0), r_knee: new Euler(-a.r_knee.bend * rad, 0, 0),
    };
    const bones: Bone[] = [];
    root.traverse((object) => { if (object instanceof Bone) bones.push(object); });
    const normalize = (name: string) => name.toLowerCase().replace(/[^a-z0-9]/g, "");
    const rig = inferPrevisRig(root, []);
    const boneOverrides: NonNullable<PrevisObject["boneOverrides"]> = {};
    for (const joint of Object.keys(aliases) as Joint[]) {
        const candidates = aliases[joint];
        const bone = bones.find((b) => candidates.includes(normalize(b.name)))
            ?? bones.find((b) => candidates.some((alias) => normalize(b.name).includes(alias)));
        if (!bone) throw new Error(`源导演台关节 ${joint} 缺少骨骼`);
        const bindings = Object.entries(rig.boneMap).filter(([, name]) => name === bone.name);
        if (bindings.length !== 1 || bones.filter((b) => b.name === bone.name).length !== 1) throw new Error(`源导演台关节 ${joint} 无唯一原生绑定`);
        const key = bindings[0][0] as PrevisHumanoidBone;
        if (boneOverrides[key]) throw new Error(`源导演台关节 ${joint} 与其它关节共用骨骼`);
        boneOverrides[key] = bone.quaternion.clone().multiply(new Quaternion().setFromEuler(rotations[joint])).toArray() as PrevisQuat;
    }
    return { pose: "neutral", rig, boneOverrides };
}
