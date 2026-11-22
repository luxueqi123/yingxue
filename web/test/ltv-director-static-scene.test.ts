import { expect, test } from "bun:test";
import { Bone, BoxGeometry, Group, Mesh, MeshStandardMaterial } from "three";
import { bindLtvPrevisSceneAssets, prepareLtvPrevisStaticScene } from "../src/lib/canvas/previs/ltv-director-static-scene";

const identity = { id: "scene-a", title: "静态导演台", now: "2026-09-30T00:00:00.000Z" };
function fixture() {
    const model = new Group();
    model.add(new Mesh(new BoxGeometry(1, 2, 1), new MeshStandardMaterial({ color: "#ffffff" })));
    for (const name of ["Root", "Pelvis", "Spine01", "Spine02", "Head", "L_Upperarm", "R_Upperarm", "L_Forearm", "R_Forearm", "L_Thigh", "R_Thigh", "L_Calf", "R_Calf"]) {
        const bone = new Bone(); bone.name = name; model.add(bone);
    }
    const transform = { position: { x: 1, y: 0, z: 2 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 }, uniformScale: 1, color: "#f75353", visible: true };
    const source = {
        environment: { skyColor: "#060608", groundVisible: true, groundOpacity: .4, groundHeight: 0, sceneScale: 3 },
        characters: [{ ...transform, id: "actor", modelUrl: "local-model", jointAngles: {}, shadowEnabled: true }],
        props: [{ ...transform, id: "prop", assetId: "mesh_cylinder" }],
        cameras: [{ id: "camera", label: "主机位", position: { x: 0, y: 2.2, z: 10 }, lookAt: { x: 0, y: 1.2, z: 0 }, lookAtTarget: "", fov: 50, zoom: 1, screenshots: [{ id: "preview", image: "data:image/png;base64,fixture" }] }],
    };
    return { source, model, models: new Map([["local-model", model]]) };
}

test("static composition remaps references, retains screenshots and leaves inputs untouched", () => {
    const { source, model, models } = fixture();
    const before = structuredClone(source), original = model.toJSON();
    const { scene, assets, screenshots } = prepareLtvPrevisStaticScene(source, identity, models);
    expect(scene.objects).toHaveLength(3);
    expect(scene.outputFrame).toEqual({ width: 2276, height: 1280, aspect: 16/9 });
    expect(assets.map(a => a.objectId)).toEqual(scene.objects.map(o => o.id));
    expect(scene.objects[0].transform.position).toEqual([3, 0, 6]);
    expect(scene.cameras[0].id).toBe("scene-a:camera:camera");
    expect(scene.shots[0]).toMatchObject({ cameraId: scene.cameras[0].id, duration: 5, fps: 24 });
    expect(scene.activeShotId).toBe(scene.shots[0].id);
    expect(screenshots).toEqual([{ cameraId: scene.cameras[0].id, source: source.cameras[0].screenshots[0] }]);
    expect(screenshots[0].source).not.toBe(source.cameras[0].screenshots[0]);
    expect(JSON.stringify(scene)).not.toContain("base64");
    expect(scene.objects.every(o => !o.url)).toBe(true);
    expect(source).toEqual(before);
    expect(model.toJSON()).toEqual(original);
    expect(assets[0].model).not.toBe(model);
});

test("unsupported source contracts are rejected instead of flattened or discarded", () => {
    const { source, models } = fixture();
    for (const patch of [
        { animation: {} }, { characterGroups: [{ id: "group" }] }, { emptyObjects: [{}] },
        { environment: { ...source.environment, sceneRotation: { x: 0, y: 1, z: 0 } } },
        { cameras: [] }, { props: [{ ...source.props[0], id: "actor" }] },
        { characters: [{ ...source.characters[0], locked: true }] },
    ]) expect(() => prepareLtvPrevisStaticScene({ ...source, ...patch }, identity, models)).toThrow();
    expect(() => prepareLtvPrevisStaticScene(source, identity, new Map())).toThrow("模型未补齐");
    expect(() => prepareLtvPrevisStaticScene(source, { ...identity, now: "invalid" }, models)).toThrow();
});

test("resource binding is immutable and whitelists resource fields", () => {
    const { source, models } = fixture();
    const { scene } = prepareLtvPrevisStaticScene(source, identity, models);
    const resources = new Map(scene.objects.map((o, i) => [o.id, { url: `/api/assets/${i}/model.glb`, assetId: `asset-${i}`, storageKey: `models/${i}`, id: "untrusted", transform: {} }]));
    const bound = bindLtvPrevisSceneAssets(scene, resources);
    expect(bound.objects.map(o => o.id)).toEqual(scene.objects.map(o => o.id));
    expect(bound.objects[0].transform).toEqual(scene.objects[0].transform);
    expect(bound.objects[0]).toMatchObject({ url: "/api/assets/0/model.glb", assetId: "asset-0", mimeType: "model/gltf-binary" });
    expect(scene.objects.every(o => !o.url)).toBe(true);
    expect(() => bindLtvPrevisSceneAssets(scene, new Map())).toThrow("尚未保存");
});

test("ephemeral, credential-bearing and malformed addresses are never bound", () => {
    const { source, models } = fixture();
    const { scene } = prepareLtvPrevisStaticScene(source, identity, models);
    const bind = (url: string) => bindLtvPrevisSceneAssets(scene, new Map(scene.objects.map(o => [o.id, { url }])));
    for (const url of ["blob:fixture", "data:model/gltf-binary;base64,AA", "http://example.test/model.glb", "https://user:secret@example.test/model.glb", "//example.test/model.glb", "/\\example.test/model.glb", "https://example.test/\nmodel.glb", " /model.glb", "relative.glb"]) expect(() => bind(url)).toThrow();
    expect(bind("https://example.test/model.glb").objects[0].url).toBe("https://example.test/model.glb");
    expect(bind("/api/assets/model.glb").objects[0].url).toBe("/api/assets/model.glb");
});

test("release is idempotent and never disposes shared source geometry or material", () => {
    const { source, models, model } = fixture();
    const original = model.children[0] as Mesh;
    let sourceDisposals = 0, preparedDisposals = 0;
    original.geometry.addEventListener("dispose", () => sourceDisposals++);
    (original.material as MeshStandardMaterial).addEventListener("dispose", () => sourceDisposals++);
    const prepared = prepareLtvPrevisStaticScene(source, identity, models);
    for (const asset of prepared.assets) asset.model.traverse(child => {
        if (child instanceof Mesh) (child.material as MeshStandardMaterial).addEventListener("dispose", () => preparedDisposals++);
    });
    prepared.dispose();
    expect(preparedDisposals).toBe(3);
    expect(sourceDisposals).toBe(0);
    prepared.dispose();
    expect(preparedDisposals).toBe(3);
    expect(sourceDisposals).toBe(0);
    expect(() => prepareLtvPrevisStaticScene({ ...source, cameras: [{ ...source.cameras[0], fov: 0 }] }, identity, models)).toThrow();
    expect(sourceDisposals).toBe(0);
});
