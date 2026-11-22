import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { AnimationMixer, LoopOnce, Object3D, Quaternion, Vector3 } from "three";
import { GLTFLoader, SkeletonUtils } from "three-stdlib";
import { createThreeboxAnimationRuntime } from "../src/lib/canvas/previs/threebox-animation";
import { normalizePrevisImportedModel, parseThreeboxGlb, parseThreeboxStaticScene, planThreeboxAnimation } from "../src/lib/canvas/previs/threebox-import";

assert.ok(process.argv[2], "传入只读编辑器本体目录");
const receipts = [];
for (const [folder, filename, jsonName, clipCount, duration] of [
    ["DV4生成实录_木质舞台", "model.glb", "collaboration.json", 3, 6],
    ["官方示例_古代街景", "model.glb", "scene_collaboration.json", 1, 15],
    ["官方示例_古代街景", "scene_render.glb", "scene_collaboration.json", 1, 15],
] as const) {
    const bytes = await readFile(join(process.argv[2], folder, filename));
    const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    const source = JSON.parse(await readFile(join(process.argv[2], folder, jsonName), "utf8"));
    const parsed = parseThreeboxStaticScene(source, () => ({ gltf: parseThreeboxGlb(buffer), asset: { name: folder } }));
    const [reference, imported] = await Promise.all([new GLTFLoader().parseAsync(buffer, ""), new GLTFLoader().parseAsync(buffer, "")]);
    assert.equal(imported.animations.length, clipCount);
    const plan = planThreeboxAnimation(source, parsed, imported.animations);
    assert.equal(plan.duration, duration);
    assert.deepEqual(JSON.parse(JSON.stringify(plan)).objects, plan.objects);
    const rendered = SkeletonUtils.clone(imported.scene);
    normalizePrevisImportedModel(rendered, true, true, "preserve-source");
    const runtime = createThreeboxAnimationRuntime(rendered, imported.animations);
    const referenceMixer = new AnimationMixer(reference.scene);
    const actions = reference.animations.map((clip) => {
        const action = referenceMixer.clipAction(clip).setLoop(LoopOnce, 1);
        action.clampWhenFinished = true; action.play(); return action;
    });
    const byId = (root: Object3D) => { const map = new Map<string, Object3D>(); root.traverse((node) => { if (node.userData.hf_id) map.set(node.userData.hf_id, node); }); return map; };
    const expectedNodes = byId(reference.scene), actualNodes = byId(rendered);
    let checks = 0;
    let changedNodes = 0;
    const startMatrices = new Map<string, number[]>();
    const samples = [0, .5, 1, 3, 6, ...(duration === 15 ? [7.5, 14.958333, 15] : []), .5, 0, duration];
    for (const time of samples) {
        for (const action of actions) { action.enabled = true; action.paused = false; action.time = Math.min(time, action.getClip().duration); }
        referenceMixer.update(0); reference.scene.updateWorldMatrix(true, true);
        runtime.seek(time);
        for (const [id, node] of expectedNodes) {
            const other = actualNodes.get(id)!; assert.ok(other);
            assert.ok(node.matrixWorld.elements.every((value, i) => Math.abs(value - other.matrixWorld.elements[i]) < 1e-5), "节点世界矩阵失配 " + id);
            if (checks === 0) startMatrices.set(id, [...node.matrixWorld.elements]);
            if (time === duration && !node.matrixWorld.elements.every((value, i) => Math.abs(value - startMatrices.get(id)![i]) < 1e-5)) changedNodes++;
        }
        for (const camera of plan.cameras) {
            const frame = runtime.readCamera(camera.sourceCamera.entityId, camera.id);
            const expected = expectedNodes.get(camera.sourceCamera.entityId)!;
            assert.ok(expected.getWorldPosition(new Vector3()).distanceTo(new Vector3(...frame.position)) < 1e-5);
            assert.ok(1 - Math.abs(expected.getWorldQuaternion(new Quaternion()).dot(new Quaternion(...frame.quaternion))) < 1e-6);
        }
        checks++;
    }
    assert.ok(changedNodes > 0, "动画实际节点未变化");
    runtime.dispose(); referenceMixer.stopAllAction(); referenceMixer.uncacheRoot(reference.scene);
    receipts.push({ folder, filename, clips: clipCount, duration, samples, nodeMatrixComparisons: checks * expectedNodes.size, movingNodeObservations: changedNodes, passed: true });
}
console.log(JSON.stringify(receipts, null, 2));
