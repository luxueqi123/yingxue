import { PerspectiveCamera, SRGBColorSpace, WebGLRenderTarget, type Camera, type Scene, type WebGLRenderer } from "three";
import type { PrevisScene } from "@/types/previs";

export type PrevisOutputFrame = NonNullable<PrevisScene["outputFrame"]>;

export function validatePrevisOutputFrame(frame: PrevisOutputFrame): void {
    if (!frame || !Number.isInteger(frame.width) || !Number.isInteger(frame.height) || frame.width < 1 || frame.height < 1 || frame.width > 4096 || frame.height > 4096 || !Number.isFinite(frame.aspect) || frame.aspect <= 0) {
        throw new Error("导演台输出画幅无效");
    }
}

export function ltvPrevisOutputFrame(aspect = 16 / 9): PrevisOutputFrame {
    const width = Math.round(1280 * Math.min(aspect, 2));
    const frame = { width, height: Math.round(width / aspect), aspect };
    validatePrevisOutputFrame(frame);
    return frame;
}

export function previsOutputCamera(camera: Camera, frame: PrevisOutputFrame): PerspectiveCamera {
    validatePrevisOutputFrame(frame);
    if (!(camera instanceof PerspectiveCamera)) throw new Error("指定输出画幅需要透视摄影机");
    const result = camera.clone();
    camera.getWorldPosition(result.position);
    camera.getWorldQuaternion(result.quaternion);
    camera.getWorldScale(result.scale);
    result.clearViewOffset();
    result.aspect = frame.aspect;
    result.updateProjectionMatrix();
    result.updateMatrixWorld(true);
    return result;
}

/** Render a new projection, never resize/stretch the pane's captured pixels or mutate its camera. */
export function renderPrevisOutputFrame(gl: WebGLRenderer, scene: Scene, camera: Camera, frame: PrevisOutputFrame): HTMLCanvasElement {
    const outputCamera = previsOutputCamera(camera, frame);
    const target = new WebGLRenderTarget(frame.width, frame.height, { depthBuffer: true });
    target.texture.colorSpace = SRGBColorSpace;
    const previous = gl.getRenderTarget();
    try {
        gl.setRenderTarget(target);
        gl.clear();
        gl.render(scene, outputCamera);
        const pixels = new Uint8Array(frame.width * frame.height * 4);
        gl.readRenderTargetPixels(target, 0, 0, frame.width, frame.height, pixels);
        const canvas = document.createElement("canvas");
        canvas.width = frame.width; canvas.height = frame.height;
        const context = canvas.getContext("2d");
        if (!context) throw new Error("导演台输出画布不可用");
        const image = context.createImageData(frame.width, frame.height);
        const stride = frame.width * 4;
        for (let row = 0; row < frame.height; row++) image.data.set(pixels.subarray((frame.height - row - 1) * stride, (frame.height - row) * stride), row * stride);
        context.putImageData(image, 0, 0);
        return canvas;
    } finally {
        gl.setRenderTarget(previous);
        target.dispose();
    }
}
