import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { Box3, Vector3 } from "three";
import { GLTFLoader, SkeletonUtils } from "three-stdlib";
import { parseThreeboxGlb, parseThreeboxStaticScene, normalizePrevisImportedModel } from "../src/lib/canvas/previs/threebox-import";
import { createPrevisScene } from "../src/lib/canvas/previs/previs-scene";
import { createPrevisSaveCoordinator } from "../src/lib/canvas/previs/previs-save";

const root = process.argv[2];
assert.ok(root, "传入只读 3D-BOX 编辑器本体目录");
const receipts = [];
for (const [folder, modelFile, jsonName, expectedCount, expectedFov] of [
    ["DV4生成实录_木质舞台", "model.glb", "collaboration.json", 146, 40],
    ["官方示例_古代街景", "model.glb", "scene_collaboration.json", 2257, 56],
    ["官方示例_古代街景", "scene_render.glb", "scene_collaboration.json", 2258, 56],
] as const) {
    const model = await readFile(join(root, folder, modelFile));
    const json = await readFile(join(root, folder, jsonName));
    const array = model.buffer.slice(model.byteOffset, model.byteOffset + model.byteLength) as ArrayBuffer;
    const result = parseThreeboxStaticScene(JSON.parse(json.toString("utf8")), () => ({ gltf: parseThreeboxGlb(array), asset: { name: folder, url: "/isolated-test.glb" } }));
    assert.equal(result.matchedEntities, expectedCount);
    assert.equal(result.cameras.length, 1);
    assert.equal(result.cameras[0].fov, expectedFov);
    if (folder.startsWith("DV4")) assert.deepEqual(result.cameras[0].transform.position, [0.75, 1.95, 6]);
    const loaded = await new GLTFLoader().parseAsync(array, "");
    loaded.scene.updateMatrixWorld(true);
    const originalBounds = new Box3().setFromObject(loaded.scene, true);
    const clone = SkeletonUtils.clone(loaded.scene);
    normalizePrevisImportedModel(clone, true, true, result.objects[0].modelNormalization);
    clone.updateMatrixWorld(true);
    const importedBounds = new Box3().setFromObject(clone, true);
    assert.ok(originalBounds.min.distanceTo(importedBounds.min) < 1e-8);
    assert.ok(originalBounds.max.distanceTo(importedBounds.max) < 1e-8);
    assert.ok(loaded.cameras[0].getWorldPosition(new Vector3()).distanceTo(new Vector3(...result.cameras[0].transform.position)) < 1e-5);
    let meshCount = 0, lightCount = 0;
    clone.traverse((object) => { if ((object as any).isMesh) meshCount++; if ((object as any).isLight) lightCount++; });
    assert.ok(meshCount > 0 && lightCount > 0);
    const initial = createPrevisScene(folder);
    const imported = { ...initial, objects: result.objects, cameras: result.cameras, lights: result.lights, shots: initial.shots.map((shot) => ({ ...shot, cameraId: result.cameras[0].id })) };
    const values = new Map<string, string>();
    const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); }, removeItem: (key: string) => { values.delete(key); } };
    const coordinator = createPrevisSaveCoordinator({ initialScene: initial, scope: "threebox-isolated", storage, flush: async () => { throw new Error("隔离离线保存"); }, schedule: () => 0, cancelSchedule: () => {} });
    assert.ok(coordinator.edit(imported));
    const reopened = createPrevisSaveCoordinator({ initialScene: initial, scope: "threebox-isolated", storage, flush: async () => {}, schedule: () => 0, cancelSchedule: () => {} });
    const candidate = reopened.restoreCandidate();
    assert.ok(candidate && reopened.explicitRestore(candidate));
    assert.equal(reopened.getSnapshot().scene.objects[0].modelNormalization, "preserve-source");
    assert.deepEqual(reopened.getSnapshot().scene.cameras, imported.cameras);
    coordinator.dispose(); reopened.dispose();
    receipts.push({ folder, model: { file: modelFile, bytes: model.byteLength, sha256: createHash("sha256").update(model).digest("hex") }, json: { file: jsonName, bytes: json.byteLength, sha256: createHash("sha256").update(json).digest("hex") }, matchedEntities: result.matchedEntities, meshCount, lightCount, embeddedAnimationsNotImported: loaded.animations.length, cameraPosition: result.cameras[0].transform.position, dimensions: importedBounds.getSize(new Vector3()).toArray(), warnings: result.warnings, nativeDraftRestore: true, visualReview: "pending", browserUploadSaveReopen: "pending" });
}
console.log(JSON.stringify(receipts, null, 2));
