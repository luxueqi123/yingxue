import { Bone, type Object3D } from "three";
import type { PrevisHumanoidBone, PrevisRig } from "@/types/previs";

export function inferPrevisRig(root: Object3D, animationNames: string[]): PrevisRig {
    const names = new Map<string, string>();
    root.traverse((child) => { if (child instanceof Bone) names.set(normalizeBoneName(child.name), child.name); });
    const fingerPatterns = (side: "left" | "right", finger: "thumb" | "index" | "middle" | "ring" | "pinky", segment: 1 | 2 | 3) => [
        new RegExp(`^mixamorig${side}hand${finger}${segment}$`),
        new RegExp(`^${side}hand${finger}${segment}$`),
        new RegExp(`^${side}${finger}${segment}$`),
        new RegExp(`^${finger}0?${segment}${side === "left" ? "l" : "r"}$`),
    ];
    const patterns: Record<PrevisHumanoidBone, RegExp[]> = {
        root: [/^root$/, /armature/], hips: [/hips|pelvis/, /mixamorig.*hip/], spine: [/spine1?$|lowerback/], chest: [/spine2|chest|upperback/], neck: [/neck/], head: [/head/],
        leftShoulder: [/leftshoulder|shoulder_l|mixamorigleftshoulder/], leftUpperArm: [/leftupperarm|leftarm|upperarm_l|mixamorigleftarm/], leftLowerArm: [/leftforearm|leftlowerarm|forearm_l|mixamorigleftforearm/], leftHand: [/^lefthand$/, /^handl$/, /^mixamoriglefthand$/],
        leftThumb1: fingerPatterns("left", "thumb", 1), leftThumb2: fingerPatterns("left", "thumb", 2), leftThumb3: fingerPatterns("left", "thumb", 3),
        leftIndex1: fingerPatterns("left", "index", 1), leftIndex2: fingerPatterns("left", "index", 2), leftIndex3: fingerPatterns("left", "index", 3),
        leftMiddle1: fingerPatterns("left", "middle", 1), leftMiddle2: fingerPatterns("left", "middle", 2), leftMiddle3: fingerPatterns("left", "middle", 3),
        leftRing1: fingerPatterns("left", "ring", 1), leftRing2: fingerPatterns("left", "ring", 2), leftRing3: fingerPatterns("left", "ring", 3),
        leftPinky1: fingerPatterns("left", "pinky", 1), leftPinky2: fingerPatterns("left", "pinky", 2), leftPinky3: fingerPatterns("left", "pinky", 3),
        rightShoulder: [/rightshoulder|shoulder_r|mixamorigrightshoulder/], rightUpperArm: [/rightupperarm|rightarm|upperarm_r|mixamorigrightarm/], rightLowerArm: [/rightforearm|rightlowerarm|forearm_r|mixamorigrightforearm/], rightHand: [/^righthand$/, /^handr$/, /^mixamorigrighthand$/],
        rightThumb1: fingerPatterns("right", "thumb", 1), rightThumb2: fingerPatterns("right", "thumb", 2), rightThumb3: fingerPatterns("right", "thumb", 3),
        rightIndex1: fingerPatterns("right", "index", 1), rightIndex2: fingerPatterns("right", "index", 2), rightIndex3: fingerPatterns("right", "index", 3),
        rightMiddle1: fingerPatterns("right", "middle", 1), rightMiddle2: fingerPatterns("right", "middle", 2), rightMiddle3: fingerPatterns("right", "middle", 3),
        rightRing1: fingerPatterns("right", "ring", 1), rightRing2: fingerPatterns("right", "ring", 2), rightRing3: fingerPatterns("right", "ring", 3),
        rightPinky1: fingerPatterns("right", "pinky", 1), rightPinky2: fingerPatterns("right", "pinky", 2), rightPinky3: fingerPatterns("right", "pinky", 3),
        leftUpperLeg: [/leftupleg|leftthigh|thigh_l|mixamorigleftupleg/], leftLowerLeg: [/leftleg|leftcalf|calf_l|mixamorigleftleg/], leftFoot: [/leftfoot|foot_l|mixamorigleftfoot/], rightUpperLeg: [/rightupleg|rightthigh|thigh_r|mixamorigrightupleg/], rightLowerLeg: [/rightleg|rightcalf|calf_r|mixamorigrightleg/], rightFoot: [/rightfoot|foot_r|mixamorigrightfoot/],
    };
    // The source director models use L_/R_ prefixes and zero-padded spine names.
    // Exact normalized aliases exclude the nearby Forearm/Thigh/Calf Twist helpers.
    const sourceAliases: Partial<Record<PrevisHumanoidBone, string>> = {
        spine: "spine01", chest: "spine02",
        leftShoulder: "lclavicle", rightShoulder: "rclavicle",
        leftUpperArm: "lupperarm", rightUpperArm: "rupperarm",
        leftLowerArm: "lforearm", rightLowerArm: "rforearm",
        leftHand: "lhand", rightHand: "rhand",
        leftUpperLeg: "lthigh", rightUpperLeg: "rthigh",
        leftLowerLeg: "lcalf", rightLowerLeg: "rcalf",
        leftFoot: "lfoot", rightFoot: "rfoot",
    };
    for (const [bone, alias] of Object.entries(sourceAliases)) {
        patterns[bone as PrevisHumanoidBone].push(new RegExp(`^${alias}$`));
    }
    const boneMap = Object.fromEntries(Object.entries(patterns).map(([bone, candidates]) => [bone, candidates.map((pattern) => [...names.entries()].find(([normalized]) => pattern.test(normalized))?.[1]).find(Boolean)]).filter(([, name]) => Boolean(name))) as PrevisRig["boneMap"];
    return { status: Object.keys(boneMap).length >= 8 ? "ready" : "unmapped", boneMap, animationNames };
}

function normalizeBoneName(name: string) {
    return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}
