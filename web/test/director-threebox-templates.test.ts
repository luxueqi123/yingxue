import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Box3, PerspectiveCamera, Vector3 } from "three";
import { GLTFLoader, SkeletonUtils } from "three-stdlib";
import { createPrevisSceneFromTemplate, PREVIS_TEMPLATES, type PrevisTemplateId } from "../src/lib/canvas/previs/previs-templates";
import { normalizePrevisImportedModel, parseThreeboxGlb } from "../src/lib/canvas/previs/threebox-import";
import { resolvePrevisViewFraming } from "../src/lib/canvas/previs/previs-view-modes";

const cases = [
    { id: "threebox-wooden-stage-static", file: "wooden-stage-static.glb", sha: "ceb75a2c1fcfda389c75d009fd7ec5a815e1415b88476f472ccb68f727e7ac0e", position: [0.75, 1.95, 6], fov: 40 },
    { id: "threebox-ancient-street-static", file: "ancient-street-static.glb", sha: "e6f40ecfa854b877c08604c20b72e2d122ea32568f77ce19ffbcc7b7bbcf1229", position: [-0.0026107965231873965, 10.45, -67.69999873772962], fov: 56 },
] as const;

describe("原生导演模板接入真实静态3D素材", () => {
    for (const item of cases) {
        test(`${item.id}直接生成原始坐标整模型、源摄影机与静态镜头`, () => {
            const scene = createPrevisSceneFromTemplate(item.id as PrevisTemplateId, "静态镜头");
            expect(scene.objects).toHaveLength(1);
            expect(scene.objects[0].modelNormalization).toBe("preserve-source");
            expect(scene.objects[0].url).toBe(`/production-library/director-models/${item.file}`);
            expect(scene.objects[0].transform).toEqual({ position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] });
            expect(scene.cameras[0].transform.position).toEqual([...item.position]);
            expect(scene.cameras[0].fov).toBe(item.fov);
            expect(scene.cameras[0].keyframes).toEqual([]);
            expect(scene.lights).toEqual([]);
            expect(scene.gridVisible).toBe(false);
            expect(scene.shots[0].cameraId).toBe(scene.cameras[0].id);
            expect(scene.shots[0].cameraMove).toBe("static");
            expect(scene.shots[0].aspectRatio).toBe("16:9");
            expect(scene.objects[0].motionClips?.length || 0).toBe(0);
            const framing = resolvePrevisViewFraming({ scene, mode: "camera", playhead: 3 });
            expect(framing?.position).toEqual([...item.position]);
            expect(framing?.target).toEqual(scene.cameras[0].target);
            expect(framing?.fov).toBeCloseTo(item.fov, 8);
            const description = PREVIS_TEMPLATES.find((template) => template.id === item.id)!;
            expect(description.name).toContain("静态");
            expect(description.description).toContain("原场景机位");
            expect(JSON.stringify(scene)).not.toMatch(/ownerId|12019119|[DE]:[\\/]/);
            const second = createPrevisSceneFromTemplate(item.id as PrevisTemplateId);
            expect(second.objects[0].id).not.toBe(scene.objects[0].id);
            expect(second.cameras[0].id).not.toBe(scene.cameras[0].id);
            scene.cameras[0].transform.position[0] = 999;
            expect(second.cameras[0].transform.position).toEqual([...item.position]);
        });

        test(`${item.id}公开GLB字节与已审查源一致，真实加载与保存重开保持世界尺度`, async () => {
            const scene = createPrevisSceneFromTemplate(item.id as PrevisTemplateId);
            const object = scene.objects[0];
            expect(object).toBeDefined();
            const data = await readFile(resolve(import.meta.dir, "../public", object.url!.slice(1)));
            expect(createHash("sha256").update(data).digest("hex")).toBe(item.sha);
            const array = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
            parseThreeboxGlb(array);
            const gltf = await new GLTFLoader().parseAsync(array, "");
            const sourceCamera = gltf.cameras[0];
            expect(sourceCamera).toBeInstanceOf(PerspectiveCamera);
            const framing = resolvePrevisViewFraming({ scene, mode: "camera", playhead: 0 });
            expect(framing?.fov).toBeCloseTo((sourceCamera as PerspectiveCamera).fov, 8);
            expect((sourceCamera as PerspectiveCamera).aspect).toBeCloseTo(16 / 9, 8);
            gltf.scene.updateMatrixWorld(true);
            const before = new Box3().setFromObject(gltf.scene, true);
            const reopened = JSON.parse(JSON.stringify(scene));
            const clone = SkeletonUtils.clone(gltf.scene);
            normalizePrevisImportedModel(clone, true, true, reopened.objects[0].modelNormalization);
            const after = new Box3().setFromObject(clone, true);
            expect(after.min.distanceTo(before.min)).toBeLessThan(1e-8);
            expect(after.max.distanceTo(before.max)).toBeLessThan(1e-8);
            expect(gltf.cameras[0].getWorldPosition(new Vector3()).distanceTo(new Vector3(...reopened.cameras[0].transform.position))).toBeLessThan(1e-6);
            expect(reopened.shots[0].cameraId).toBe(reopened.cameras[0].id);
        });
    }
});
