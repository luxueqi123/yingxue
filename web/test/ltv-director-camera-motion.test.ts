import { expect, test } from "bun:test";
import { Matrix4, Vector3 } from "three";
import { editLtvPrevisCameraMotion, resolveLtvPrevisCameraMotionPath, sampleLtvPrevisCameraPosition, validateLtvPrevisCameraMotion } from "../src/lib/canvas/previs/ltv-director-camera-motion";
import { resolvePrevisCameraAlignment } from "../src/lib/canvas/previs/previs-animation-semantics";
import { compilePrevisPrompt } from "../src/lib/canvas/previs/previs-prompt-compiler";
import { copyProductionCasePreviss } from "../src/lib/canvas/previs/production-case-director";
import { createPrevisScene } from "../src/lib/canvas/previs/previs-scene";
import { resolvePrevisViewFraming } from "../src/lib/canvas/previs/previs-view-modes";
import type { PrevisLtvCameraMotion } from "../src/types/previs";

function fixture() {
    const scene = createPrevisScene();
    const camera = scene.cameras[0];
    const ltvCameraMotion: PrevisLtvCameraMotion = {
        version: 1 as const, duration: 10, baseY: 2, matrix: new Matrix4().makeScale(3, 3, 3).toArray(),
        path: { start: 0, end: 4, points: [[0, 0, 0], [10, 0, 0]],
            bezierPoints: [{ anchor: [0, 0, 0], out: [10 / 3, 0, 0] }, { anchor: [10, 0, 0], in: [20 / 3, 0, 0] }], offset: [0, 0, 0] },
    };
    const animated = { ...camera, target: [0, 0, -30] as [number, number, number], ltvCameraMotion };
    scene.cameras = [animated];
    return { scene, animated };
}

test("CAM evaluates preserved source motion instead of holding the imported static pose", () => {
    const { scene } = fixture();
    const before = JSON.stringify(scene);
    expect(resolvePrevisViewFraming({ scene, mode: "camera", playhead: 2 })?.position).toEqual([15, 6, 0]);
    expect(resolvePrevisViewFraming({ scene, mode: "camera", playhead: 8 })?.position).toEqual([30, 6, 0]);
    expect(JSON.stringify(scene)).toBe(before);
});

test("JSON reload retains motion and source clock clamps before and after the scene", () => {
    const { scene } = fixture();
    const reopened = JSON.parse(JSON.stringify(scene));
    expect(resolvePrevisViewFraming({ scene: reopened, mode: "camera", playhead: -2 })?.position).toEqual([0, 6, 0]);
    expect(resolvePrevisViewFraming({ scene: reopened, mode: "camera", playhead: 20 })?.position).toEqual([30, 6, 0]);
});

test("view modes that do not consume the shot camera do not apply its source motion", () => {
    expect(resolvePrevisViewFraming({ scene: fixture().scene, mode: "free", playhead: 2 })).toBeNull();
});

test("multiple unequal segments preserve handles, offset, baseline and world transform", () => {
    const { animated } = fixture(), motion = animated.ltvCameraMotion;
    motion.path.bezierPoints = [
        { anchor: [0, 0, 0], out: [1, 0, 0] },
        { anchor: [3, 0, 0], in: [2, 0, 0], out: [5, 0, 0] },
        { anchor: [9, 0, 0], in: [7, 0, 0] },
    ];
    motion.path.offset = [1, -0.5, 2];
    const matrix = new Matrix4().makeRotationY(Math.PI / 2).premultiply(new Matrix4().makeTranslation(5, 4, 3));
    motion.matrix = matrix.toArray();
    const before = JSON.stringify(motion);
    for (const time of [0, 1, 2, 3, 4, 10]) {
        const expected = new Vector3(Math.min(time / 4, 1) * 9 + 1, 1.5, 2).applyMatrix4(matrix);
        const actual = new Vector3(...sampleLtvPrevisCameraPosition(motion, time));
        expect(actual.distanceTo(expected)).toBeLessThan(1e-10);
    }
    expect(JSON.stringify(motion)).toBe(before);
});

test("copy remaps identity while retaining an independent motion and JSON persistence", () => {
    const { scene } = fixture(), before = JSON.stringify(scene);
    const copied = copyProductionCasePreviss([scene], [], new Map(), false).previsScenes![0];
    expect(copied.id).not.toBe(scene.id);
    expect(copied.cameras[0].ltvCameraMotion).toEqual(scene.cameras[0].ltvCameraMotion);
    expect(copied.cameras[0].ltvCameraMotion).not.toBe(scene.cameras[0].ltvCameraMotion);
    const reopened = JSON.parse(JSON.stringify(copied));
    expect(resolvePrevisViewFraming({ scene: reopened, mode: "camera", playhead: 2 })?.position).toEqual([15, 6, 0]);
    expect(JSON.stringify(scene)).toBe(before);
});

test("invalid explicit motion, clocks, matrices and degenerate curves fail both copy and CAM", () => {
    const invalids = [null, false, {},
        { path: { timeRatio: 0.5 } }, { duration: NaN }, { duration: -1 },
        { matrix: new Matrix4().makeScale(0, 1, 1).toArray() },
        { path: { end: 11 } }, { path: { start: 1 } },
        { path: { bezierPoints: [{ anchor: [0, 0, 0] }, { anchor: [0, 0, 0] }] } },
    ];
    for (const invalid of invalids) {
        const { scene, animated } = fixture();
        const motion = invalid && typeof invalid === "object" ? {
            ...animated.ltvCameraMotion, ...invalid,
            ...("path" in invalid ? { path: { ...animated.ltvCameraMotion.path, ...invalid.path } } : {}),
        } : invalid;
        // An empty object is invalid itself, not a no-op patch.
        const value = invalid && typeof invalid === "object" && !Object.keys(invalid).length ? invalid : motion;
        (animated as unknown as { ltvCameraMotion: unknown }).ltvCameraMotion = value;
        expect(() => validateLtvPrevisCameraMotion(value)).toThrow();
        expect(() => copyProductionCasePreviss([scene], [], new Map(), true)).toThrow();
        expect(resolvePrevisViewFraming({ scene, mode: "camera", playhead: 2 })).toBeNull();
    }
});

test("source GLB or native keyframes cannot silently compete with preserved source motion", () => {
    for (const kind of ["glb", "keyframes"] as const) {
        const { scene, animated } = fixture();
        if (kind === "glb") Object.assign(animated, { sourceCamera: { objectId: "model", entityId: "camera" } });
        else animated.keyframes = [{ id: "frame", time: 0, transform: structuredClone(animated.transform) }];
        expect(() => copyProductionCasePreviss([scene], [], new Map(), true)).toThrow();
        expect(resolvePrevisViewFraming({ scene, mode: "camera", playhead: 2 })).toBeNull();
    }
});

test("3D display path uses CAM's same world-space sampler without manufacturing keyframes", () => {
    const { scene, animated } = fixture(), before = JSON.stringify(scene);
    const path = resolveLtvPrevisCameraMotionPath(animated.ltvCameraMotion, 2);
    expect(path.points.length).toBe(193);
    expect(path.points[0]).toEqual([0, 6, 0]);
    expect(path.points.at(-1)).toEqual([30, 6, 0]);
    expect(path.current).toEqual(resolvePrevisViewFraming({ scene, mode: "camera", playhead: 2 })!.position);
    expect(JSON.stringify(scene)).toBe(before);
});

test("explicit path editing changes immutable identity and refreshes both CAM and display caches", () => {
    const { scene, animated } = fixture(), motion = animated.ltvCameraMotion, before = JSON.stringify(scene);
    const original = resolveLtvPrevisCameraMotionPath(motion, 2);
    const changed = editLtvPrevisCameraMotion(motion, { kind: "offset", value: [1, 2, 3] });
    const updated = resolveLtvPrevisCameraMotionPath(changed, 2);
    expect(changed).not.toBe(motion);
    expect(updated.points).not.toBe(original.points);
    expect(updated.current).toEqual([18, 12, 9]);
    expect(changed.path.points).toEqual(motion.path.points);
    expect(changed.path.bezierPoints).toEqual(motion.path.bezierPoints);
    expect(JSON.stringify(scene)).toBe(before);
    expect(() => editLtvPrevisCameraMotion(motion, { kind: "end", value: 11 })).toThrow();
    expect(() => editLtvPrevisCameraMotion(motion, { kind: "anchor", index: -1, value: [0, 0, 0] })).toThrow();
    expect(() => editLtvPrevisCameraMotion(motion, { kind: "out", index: 0, value: [NaN, 0, 0] })).toThrow();
    expect(() => resolvePrevisCameraAlignment(animated, animated.transform, 2)).toThrow();
});

test("output prompt describes the real path and initial sampled camera, never a static preset", () => {
    const { scene } = fixture(), before = JSON.stringify(scene);
    const prompt = compilePrevisPrompt(scene, scene.shots[0]);
    expect(prompt).toContain("按导演台贝塞尔机位路径运动");
    expect(prompt).toContain("运动至 4 秒后保持末态");
    expect(prompt).toContain("初始摄影机");
    expect(prompt).not.toContain("固定机位");
    expect(JSON.stringify(scene)).toBe(before);
});
