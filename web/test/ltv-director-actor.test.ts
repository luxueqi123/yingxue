import { expect, test } from "bun:test";
import { Bone, Box3, BoxGeometry, Group, Mesh, MeshStandardMaterial, Vector3 } from "three";
import { prepareLtvPrevisActorModel } from "../src/lib/canvas/previs/ltv-director-actor";

function model() {
    const group = new Group();
    const mesh = new Mesh(new BoxGeometry(1, 2, 1), new MeshStandardMaterial({ color: "#ffffff", roughness: 0.37 }));
    mesh.position.y = 4; group.add(mesh);
    for (const name of ["Root", "Pelvis", "Spine01", "Spine02", "Head", "L_Upperarm", "R_Upperarm", "L_Forearm", "R_Forearm", "L_Thigh", "R_Thigh", "L_Calf", "R_Calf"]) {
        const bone = new Bone(); bone.name = name; group.add(bone);
    }
    return { group, mesh };
}
const source = { position: { x: 1, y: 2, z: 3 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 }, uniformScale: 1, color: "#F75353", visible: false, shadowEnabled: true, jointAngles: {} };
const identity = { id: "actor-1", name: "角色 A" };

test("original height, centering and tint prepare a detached native preserve-source asset", () => {
    const { group, mesh } = model(), oldMaterial = mesh.material;
    const { object } = prepareLtvPrevisActorModel(group, source, identity);
    expect(group.parent).toBeNull();
    const box = new Box3().setFromObject(group);
    expect(box.getSize(new Vector3()).y).toBeCloseTo(1.75, 8);
    expect(box.min.y).toBeCloseTo(0, 8);
    expect(group.rotation.y).toBeCloseTo(-Math.PI / 2, 8);
    expect(mesh.material).not.toBe(oldMaterial);
    expect(oldMaterial.color.getHexString()).toBe("ffffff");
    expect(mesh.material.color.getHexString()).toBe("f75353");
    expect(mesh.material.roughness).toBe(0.37);
    expect(object).toMatchObject({ ...identity, kind: "model", role: "actor", modelNormalization: "preserve-source", pose: "neutral", visible: false, castShadow: true, receiveShadow: false });
    expect(object.transform.position).toEqual([1, 2, 3]);
    expect(Object.keys(object.boneOverrides!)).toHaveLength(11);
});

test("skipNormalize retains height and uniform scale multiplies each source axis", () => {
    const { group } = model();
    const { object } = prepareLtvPrevisActorModel(group, { ...source, skipNormalize: true, scale: { x: 2, y: 3, z: 4 }, uniformScale: 0.5, rotation: 90 }, identity);
    expect(new Box3().setFromObject(group).getSize(new Vector3()).y).toBeCloseTo(2, 8);
    expect(object.transform.scale).toEqual([1, 1.5, 2]);
    expect(object.transform.rotation).toEqual([0, Math.PI / 2, 0]);
});

test("unsupported source types and invalid transforms fail before model mutation", () => {
    for (const patch of [{samSkinnedMesh:{}}, {poseSkeleton:{}}, {useMannequin:true}, {animalType:"wolf"}, {jointAngles:undefined}, {skipNormalize:1}, {scale:{x:0,y:1,z:1}}, {uniformScale:NaN}, {rotation:{x:0,y:Infinity,z:0}}, {position:{x:"0",y:0,z:0}}, {color:"not-a-color"}, {visible:undefined}]) {
        const { group } = model();
        expect(() => prepareLtvPrevisActorModel(group, { ...source, ...patch }, identity)).toThrow();
        expect(group.scale.toArray()).toEqual([1,1,1]);
        expect(group.position.toArray()).toEqual([0,0,0]);
    }
    const { group } = model(); new Group().add(group);
    expect(() => prepareLtvPrevisActorModel(group, source, identity)).toThrow("脱离场景");
});
