import { describe, expect, test } from "bun:test";
import { AnimationClip, Group, PerspectiveCamera, Quaternion, QuaternionKeyframeTrack, Vector3, VectorKeyframeTrack } from "three";
import { createThreeboxAnimationRuntime, resolvePrevisImportedAnimations, detachThreeboxCamera } from "../src/lib/canvas/previs/threebox-animation";
import { createPrevisCamera } from "../src/lib/canvas/previs/previs-scene";

describe("3D-BOX 单时钟整场景动画", () => {
    test("显式解绑摄影机保留初始机位和全部原生属性，不修改源对象", () => {
        const initial = createPrevisCamera();
        const camera = { ...initial, sourceCamera: { objectId: "scene", entityId: "camera" } };
        const result = detachThreeboxCamera(camera);
        expect(result).toEqual(initial);
        expect(camera.sourceCamera).toEqual({ objectId: "scene", entityId: "camera" });
        expect(detachThreeboxCamera(initial)).toBe(initial);
    });
    test("三条 clip 并发，短片段保持末帧，向后拖动和跳零可重复", () => {
        const root = new Group();
        const body = new Group(), dust = new Group(), beam = new Group();
        body.name = "body"; dust.name = "dust"; beam.name = "beam"; root.add(body, dust, beam);
        const clips = [
            new AnimationClip("角色", 1, [new VectorKeyframeTrack("body.position", [0, 1], [0, 0, 0, 0, 2, 0])]),
            new AnimationClip("粉尘", 6, [new VectorKeyframeTrack("dust.position", [0, 6], [0, 0, 0, 6, 0, 0])]),
            new AnimationClip("光束", 6, [new VectorKeyframeTrack("beam.scale", [0, 6], [1, 1, 1, 2, 2, 2])]),
        ];
        const runtime = createThreeboxAnimationRuntime(root, clips);
        for (const time of [0, .5, 1, 3, 6, .5, 0, 6]) {
            runtime.seek(time);
            expect(body.position.y).toBeCloseTo(2 * Math.min(time, 1));
            expect(dust.position.x).toBeCloseTo(time);
            expect(beam.scale.x).toBeCloseTo(1 + time / 6);
        }
        runtime.dispose();
    });

    test("摄影机来自父链世界四元数，保留 roll 而不是静态 target", () => {
        const root = new Group(), parent = new Group(), camera = new PerspectiveCamera(56, 16 / 9, .04, 240);
        parent.name = "parent"; parent.position.set(5, 2, 3);
        camera.userData.hf_id = "camera"; camera.position.set(0, 1, -4); root.add(parent); parent.add(camera);
        const end = new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), Math.PI / 2);
        const runtime = createThreeboxAnimationRuntime(root, [new AnimationClip("父组", 2, [new QuaternionKeyframeTrack("parent.quaternion", [0, 2], [0, 0, 0, 1, ...end.toArray()])])]);
        runtime.seek(1);
        const frame = runtime.readCamera("camera", "native-id");
        expect(frame.position[0]).toBeCloseTo(5 - Math.SQRT1_2);
        expect(frame.up[0]).toBeCloseTo(-Math.SQRT1_2);
        expect(frame.fov).toBe(56);
        expect(frame.quaternion).toEqual(camera.getWorldQuaternion(new Quaternion()).toArray());
        parent.scale.set(2, 1, 1); camera.rotation.y = .4;
        expect(() => runtime.readCamera("camera", "native-id")).toThrow("剪切");
        runtime.dispose();
    });

    test("缺省静态整场景零动画，旧 fit 演员动画保持，新模式显式开启", () => {
        const clips = [new AnimationClip("旧动作", 1, [])];
        expect(resolvePrevisImportedAnimations({ modelNormalization: "preserve-source" }, clips)).toEqual([]);
        expect(resolvePrevisImportedAnimations({}, clips)).toBe(clips);
        expect(resolvePrevisImportedAnimations({ modelNormalization: "preserve-source", sourceAnimation: { mode: "threebox-scene", duration: 1 } }, clips)).toBe(clips);
    });
});
