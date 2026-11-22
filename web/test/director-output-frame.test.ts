import { expect, test } from "bun:test";
import { Group, OrthographicCamera, PerspectiveCamera, Scene, type WebGLRenderer, type WebGLRenderTarget } from "three";
import { previsOutputCamera, ltvPrevisOutputFrame, renderPrevisOutputFrame, validatePrevisOutputFrame } from "../src/lib/canvas/previs/director-output-frame";

test("source output sizes and projection ratio retain source rounding", () => {
    expect(ltvPrevisOutputFrame()).toEqual({ width: 2276, height: 1280, aspect: 16/9 });
    expect(ltvPrevisOutputFrame(9/16)).toEqual({ width: 720, height: 1280, aspect: 9/16 });
    expect(ltvPrevisOutputFrame(1)).toEqual({ width: 1280, height: 1280, aspect: 1 });
    expect(ltvPrevisOutputFrame(3)).toEqual({ width: 2560, height: 853, aspect: 3 });
});

test("capture projection is independent of pane dimensions and retains world pose", () => {
    const parent = new Group(); parent.position.set(5, 2, -3); parent.rotation.y = .7;
    const pane = new PerspectiveCamera(29,680/752,.1,2000);
    pane.position.set(3,7,9); pane.rotation.x = .2; parent.add(pane); parent.updateMatrixWorld(true);
    pane.setViewOffset(1280,720,100,40,680,600);
    const before = JSON.stringify(pane.toJSON());
    const output = previsOutputCamera(pane,ltvPrevisOutputFrame());
    expect(output.aspect).toBe(16/9);
    expect(output.view?.enabled).toBe(false);
    expect(output.fov).toBe(29);
    expect(Math.max(...output.matrixWorld.elements.map((v,i) => Math.abs(v-pane.matrixWorld.elements[i])))).toBeLessThan(1e-12);
    expect(JSON.stringify(pane.toJSON())).toBe(before);
    const reference = new PerspectiveCamera(29,16/9,.1,2000);
    expect(output.projectionMatrix.elements).toEqual(reference.projectionMatrix.elements);
});

test("invalid frames and orthographic output fail instead of stretching", () => {
    for (const aspect of [0,-1,NaN,Infinity]) expect(() => ltvPrevisOutputFrame(aspect)).toThrow();
    expect(() => validatePrevisOutputFrame({ width:5000,height:1280,aspect:16/9 })).toThrow();
    expect(() => validatePrevisOutputFrame(null as never)).toThrow();
    expect(() => previsOutputCamera(new OrthographicCamera(),ltvPrevisOutputFrame())).toThrow();
});

test("render failure restores the original target and disposes the temporary buffer", () => {
    let active: WebGLRenderTarget | null = null;
    let disposed = false;
    const gl = {
        getRenderTarget: () => null,
        setRenderTarget: (target: WebGLRenderTarget | null) => {
            active = target;
            target?.addEventListener("dispose", () => { disposed = true; });
        },
        clear: () => {},
        render: () => { throw Error("render failed"); },
    } as unknown as WebGLRenderer;
    expect(() => renderPrevisOutputFrame(gl, new Scene(), new PerspectiveCamera(), ltvPrevisOutputFrame())).toThrow("render failed");
    expect(active).toBe(null);
    expect(disposed).toBe(true);
});
