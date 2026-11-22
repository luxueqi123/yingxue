import { expect, test } from "bun:test";
import { Matrix4, PerspectiveCamera, Vector3 } from "three";
import { convertLtvPrevisCamera, ltvPrevisSceneMatrix } from "../src/lib/canvas/previs/ltv-director-camera";
import { resolvePrevisViewUp } from "../src/lib/canvas/previs/previs-view-modes";

const source = { position: { x: 0, y: 2.2, z: 10 }, lookAt: { x: 0, y: 1.2, z: 0 }, lookAtTarget: "", cameraRotation: { x: 100, y: 20, z: 170 }, fov: 50, zoom: 1 };
const scene = { environment: {}, characters: [] };
const id = { id: "camera-1", name: "机位 A" };

test("source logical position and lookAt are scaled together, stale rotation is ignored", () => {
    const result = convertLtvPrevisCamera(source, scene, id);
    expect(result.transform.position).toEqual([0, 6.6000000000000005, 30]);
    expect(result.target[1]).toBeCloseTo(3.6, 12);
    expect(result.transform.rotation[2]).toBeCloseTo(0, 12);
    expect(result).toMatchObject({fov:50,near:0.1,far:2000,keyframes:[]});
});

test("actor target height is 1.2 logical units, not model height or scale", () => {
    const result = convertLtvPrevisCamera({...source,lookAtTarget:"actor"},{...scene,characters:[{id:"actor",position:{x:2,y:3,z:4},scale:{x:5,y:5,z:5}}]},id);
    expect(result.target).toEqual([6,12.600000000000001,12]);
});

test("native unit-zoom projection matches source optical zoom and roll", () => {
    const result = convertLtvPrevisCamera({...source,lookAtTarget:"__none__",cameraRotation:{x:22,y:33,z:41},zoom:2},scene,id);
    const native = new PerspectiveCamera(result.fov,16/9,result.near,result.far);
    native.position.fromArray(result.transform.position);
    native.up.fromArray(resolvePrevisViewUp(result.transform.rotation,new Vector3(...result.target).sub(native.position).toArray()));
    native.lookAt(...result.target);native.updateMatrixWorld(true);
    const expected = new PerspectiveCamera(50,16/9,0.1,2000);expected.zoom=2;expected.updateProjectionMatrix();
    expect(Math.max(...native.projectionMatrix.elements.map((v,i)=>Math.abs(v-expected.projectionMatrix.elements[i])))).toBeLessThan(1e-12);
    expect(Math.abs(result.transform.rotation[2])).toBeGreaterThan(0.01);
});

test("scene matrix includes XYZ rotation, translation and source scale clamping", () => {
    expect(new Vector3(1,0,0).applyMatrix4(ltvPrevisSceneMatrix({sceneScale:20,sceneRotation:{x:0,y:90,z:0},sceneTranslation:{x:2,y:3,z:4}})).distanceTo(new Vector3(2,3,-6))).toBeLessThan(1e-12);
    expect(ltvPrevisSceneMatrix({sceneScale:1}).equals(new Matrix4())).toBe(true);
});

test("unresolved references, follow motion and malformed optics fail explicitly", () => {
    for(const patch of [{lookAtTarget:"missing"},{followTargetId:"actor"},{fov:0},{zoom:0},{cameraQuaternion:[0,0,0,0]},{position:{x:NaN,y:0,z:0}}])expect(()=>convertLtvPrevisCamera({...source,...patch},scene,id)).toThrow();
});
