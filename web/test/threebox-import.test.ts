import { describe, expect, test } from "bun:test";
import { AnimationClip, Box3, BoxGeometry, Group, Mesh, MeshBasicMaterial, Vector3, VectorKeyframeTrack } from "three";
import { normalizePrevisImportedModel, parseThreeboxGlb, parseThreeboxStaticScene, planThreeboxAnimation, resolvePrevisModelNormalization } from "../src/lib/canvas/previs/threebox-import";
import { createPrevisModel } from "../src/lib/canvas/previs/previs-scene";

const transform = { position: [0, 0, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] };
const gltf = {
    asset: { version: "2.0" }, scene: 0, scenes: [{ nodes: [0] }],
    nodes: [
        { extras: { hf_id: "root" }, translation: [0.75, 1.95, 6], children: [1, 2] },
        { extras: { hf_id: "camera" }, camera: 0 },
        { extras: { hf_id: "box" }, mesh: 0 },
    ],
    cameras: [{ type: "perspective", perspective: { yfov: Math.PI / 3, znear: 0.1, zfar: 200 } }],
    meshes: [{ primitives: [] }], animations: [{}],
};
const source = { entities: [
    { id: "root", kind: "object", state: { transform: { ...transform, position: [0.75, 1.95, 6] }, source: { nodeIndex: 0 } } },
    { id: "camera", kind: "camera", state: { name: "相机", transform, source: { nodeIndex: 1 } } },
    { id: "box", kind: "object", state: { transform, source: { nodeIndex: 2 } } },
    { id: "timeline", kind: "timeline", state: { timeline: { duration: 15 } } },
] };
const resolver = () => ({ gltf, asset: { name: "场景", url: "/model.glb" } });

describe("3D-BOX 静态整场景导入", () => {
    test("动态导入显式绑定整场景相机并拒收轨道冲突和多镜头", () => {
        const parsed = parseThreeboxStaticScene(source, resolver);
        const noTimeline = { entities: source.entities.filter((entity) => entity.kind !== "timeline") };
        const clip = new AnimationClip("源动画", 6, [new VectorKeyframeTrack("box.position", [0, 6], [0, 0, 0, 6, 0, 0])]);
        const plan = planThreeboxAnimation(noTimeline, parsed, [clip]);
        expect(plan.duration).toBe(6);
        expect(plan.cameras[0].sourceCamera).toEqual({ objectId: "threebox-scene", entityId: "camera" });
        expect(plan.objects[0].sourceAnimation?.mode).toBe("threebox-scene");
        expect(parsed.objects[0].sourceAnimation).toBeUndefined();
        expect(() => planThreeboxAnimation(noTimeline, parsed, [])).toThrow();
        expect(() => planThreeboxAnimation(noTimeline, parsed, [clip, clip])).toThrow("同一轨道");
        expect(() => planThreeboxAnimation(source, parsed, [clip])).toThrow("多镜头");
    });
    test("根据 hf_id 和 nodeIndex 绑定并累计 GLB 父变换，不把局部相机原点当世界原点", () => {
        const result = parseThreeboxStaticScene(source, resolver);
        expect(result.objects).toHaveLength(1);
        expect(result.objects[0].modelNormalization).toBe("preserve-source");
        expect(result.cameras[0].transform.position).toEqual([0.75, 1.95, 6]);
        expect(result.cameras[0].target).toEqual([0.75, 1.95, 5]);
        expect(result.cameras[0].fov).toBeCloseTo(60);
        expect(result.lights).toEqual([]);
        expect(result.warnings.some((item) => item.code === "dynamic-not-imported")).toBe(true);
        const reopened = JSON.parse(JSON.stringify(result));
        expect(reopened.objects[0].modelNormalization).toBe("preserve-source");
        expect(reopened.cameras).toEqual(result.cameras);
    });

    test("拒绝错误配对、重复ID、循环层级、变化后的静态变换和远程依赖", () => {
        const wrong = structuredClone(source); wrong.entities[2].id = "wrong";
        expect(() => parseThreeboxStaticScene(wrong, resolver)).toThrow();
        const duplicate = structuredClone(source); duplicate.entities.push(duplicate.entities[0]);
        expect(() => parseThreeboxStaticScene(duplicate, resolver)).toThrow();
        const cycle = structuredClone(gltf); cycle.nodes[2].children = [0];
        expect(() => parseThreeboxStaticScene(source, () => ({ ...resolver(), gltf: cycle }))).toThrow();
        const moved = structuredClone(source); moved.entities[2].state.transform.position = [10, 0, 0];
        expect(() => parseThreeboxStaticScene(moved, resolver)).toThrow();
        expect(() => parseThreeboxStaticScene(source, () => ({ ...resolver(), gltf: { ...gltf, buffers: [{ uri: "https://example.com/a.bin" }] } }))).toThrow();
    });

    test("旧对象保持 fit；preserve-source 保留同坐标尺度并经过序列化继续生效", () => {
        const make = () => { const root = new Group(); const mesh = new Mesh(new BoxGeometry(10, 4, 6), new MeshBasicMaterial()); mesh.position.set(3, 2, 1); root.add(mesh); return root; };
        const old = make(); normalizePrevisImportedModel(old, true, true);
        expect(new Box3().setFromObject(old).getSize(new Vector3()).x).toBeCloseTo(2);
        const scene = make(); normalizePrevisImportedModel(scene, true, true, "preserve-source");
        expect(new Box3().setFromObject(scene).getSize(new Vector3()).x).toBeCloseTo(10);
        expect(scene.position.toArray()).toEqual([0, 0, 0]);
    });

    test("GLB 头、长度与 JSON 必须有效", () => {
        expect(() => parseThreeboxGlb(new ArrayBuffer(12))).toThrow();
    });

    test("素材元数据保存重开后再次加入保留源坐标，未知或旧元数据仍使用 fit", () => {
        const asset = JSON.parse(JSON.stringify({ title: "3D场景", data: { url: "/scene.glb" }, metadata: { modelNormalization: "preserve-source" } }));
        const object = { ...createPrevisModel({ name: asset.title, url: asset.data.url }), modelNormalization: resolvePrevisModelNormalization(asset.metadata?.modelNormalization) };
        const root = new Group(); root.add(new Mesh(new BoxGeometry(12, 3, 4), new MeshBasicMaterial()));
        normalizePrevisImportedModel(root, true, true, object.modelNormalization);
        expect(new Box3().setFromObject(root).getSize(new Vector3()).x).toBeCloseTo(12);
        for (const value of [undefined, null, "fit", "other", { mode: "preserve-source" }]) expect(resolvePrevisModelNormalization(value)).toBe("fit");
    });
});
