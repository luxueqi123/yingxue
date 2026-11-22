import { expect, test } from "bun:test";
import { Bone, Euler, Group, Quaternion } from "three";
import { convertLtvPrevisPose } from "../src/lib/canvas/previs/ltv-director-pose";
import { resolvePrevisBoneRotation } from "../src/lib/canvas/previs/previs-animation-semantics";

function skeleton() {
    const root = new Group();
    for (const name of ["Root", "Pelvis", "Spine01", "Spine02", "Head", "L_Upperarm", "R_Upperarm", "L_Forearm", "R_Forearm", "L_Thigh", "R_Thigh", "L_Calf", "R_Calf"]) {
        const bone = new Bone(); bone.name = name; bone.rotation.set(0.12, -0.2, 0.03); root.add(bone);
    }
    return root;
}

test("source body binds Root rather than Pelvis, torso binds Spine01 rather than Spine02", () => {
    const result = convertLtvPrevisPose(skeleton(), undefined);
    expect(result.pose).toBe("neutral");
    expect(Object.keys(result.boneOverrides!)).toHaveLength(11);
    expect(result.boneOverrides!.root).toBeDefined();
    expect(result.boneOverrides!.spine).toBeDefined();
    expect(result.boneOverrides!.hips).toBeUndefined();
    expect(result.boneOverrides!.chest).toBeUndefined();
});

test("bind times signed ZXY delta survives native evaluation and JSON round trip", () => {
    const root = skeleton(); const before = root.getObjectByName("L_Upperarm")!.quaternion.clone();
    const pose = convertLtvPrevisPose(root, { l_arm: { raise: 38, turn: -21, straddle: 47 } });
    const expected = before.clone().multiply(new Quaternion().setFromEuler(new Euler(38*Math.PI/180,21*Math.PI/180,47*Math.PI/180,"ZXY")));
    const serialized = JSON.parse(JSON.stringify(pose));
    const actual = resolvePrevisBoneRotation({override:serialized.boneOverrides.leftUpperArm,time:0});
    expect(new Quaternion(...actual!).angleTo(expected)).toBeLessThan(1e-7);
    expect(root.getObjectByName("L_Upperarm")!.quaternion.equals(before)).toBe(true);
});

test("defaults preserve source bend and head angle rather than substituting native stand", () => {
    const root = skeleton();
    const pose = convertLtvPrevisPose(root, {});
    const head = root.getObjectByName("Head")!.quaternion.clone().multiply(new Quaternion().setFromEuler(new Euler(10*Math.PI/180,0,0,"YXZ")));
    expect(new Quaternion(...pose.boneOverrides!.head!).angleTo(head)).toBeLessThan(1e-7);
});

test("invalid fields, absent and ambiguous source bones fail instead of creating default actors", () => {
    for (const value of [null, [], {head:null}, {l_arm:{raise:NaN}}, {r_knee:{bend:"20"}}]) expect(() => convertLtvPrevisPose(skeleton(), value)).toThrow();
    expect(() => convertLtvPrevisPose(new Group(), {})).toThrow("缺少骨骼");
    const root = skeleton();const duplicate = new Bone();duplicate.name="Head";root.add(duplicate);
    expect(() => convertLtvPrevisPose(root, {})).toThrow("唯一原生绑定");
});
