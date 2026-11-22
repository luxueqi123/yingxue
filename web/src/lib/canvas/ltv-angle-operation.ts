import { buildAnglePrompt } from './canvas-project-domain';

// Source 0wllgknwomk2u.js handleGenerateAngle submits the angle editor as a plain image edit:
//   if(e8===V.ElementTool.Angle&&tn){
//    let t=(tZ.angleValues.rotation%360+360)%360,
//        a=Math.max(-30,Math.min(60,tZ.angleValues.tilt)),
//        n=(0,eS.scaleToZoom)(tZ.angleValues.scale);
//    return handleGenerateAngle({images:[tn],prompt:tZ.anglePromptEnabled?tZ.anglePrompt:"",
//      horizontal_angle:String(Math.round(t)),vertical_angle:String(Math.round(a)),zoom:String(n)},e)}
// The same chunk defines the value domains: eS.scaleToZoom = scale/10, zoomToScale = 10*e,
// snapRotationToGrid/snapTiltToGrid step 15; the editor sliders are
// horizontalOrbit 0..345, verticalPitch -90..90 (clamped to -30..60 at submit) and
// shotScale with rightLabel zoomPanorama for zoom<=3, zoomMedium for zoom<=6, else zoomCloseUp.
// The declared tool spec for that provider (`image:multiple-angles`) has `properties:{}`, so these
// three keys exist only in the node params the editor wrote, never in a model schema.

const SOURCE_KEYS = ['horizontal_angle', 'vertical_angle', 'zoom'] as const;
const HOST_PITCH_LIMIT = 75;

/** Reads a source angle value that the editor always wrote as a numeric String. */
function numeric(value: unknown): number | null {
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    if (typeof value !== 'string' || !value.trim()) return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
}

export type LtvAngleMapping = {
    /** Source values, kept so a caller can report exactly what was translated. */
    source: { horizontalAngle: number; verticalAngle: number; zoom: number };
    /** Host angle-editor values, i.e. what the canvas 多角度 panel itself produces. */
    host: { horizontalAngle: number; pitchAngle: number; cameraDistance: number; wideAngle: boolean };
    /** Host-style angle instruction, built with the canvas' own angle prompt builder. */
    prompt: string;
};

/**
 * Translates the source angle request into the canvas' own angle-editor values.
 *
 * Both sides drive a prompt-based image edit, so the translation is a documented value mapping:
 * horizontal rotation is the same signed angle (source 0..360 compass, host -180..180);
 * vertical tilt keeps its sign (source positive = looking down, host positive = 俯视) and is
 * already clamped to [-30,60] by the source; the source `zoom` runs 0 = 全景 → 10 = 特写
 * (`zoomPanorama` for zoom<=3, `zoomCloseUp` for zoom>6), while the canvas `cameraDistance`
 * runs 1 = 近景 → 10 = 全景, so the two scales are inverted relative to each other and
 * `cameraDistance = 10 - zoom` lands in the same band (0→10 全景, 5→5 中景, 10→1 近景).
 *
 * Returns null for values the canvas cannot express, so the caller keeps reporting the field as
 * unmapped instead of guessing.
 */
export function mapLtvAngleOperation(fields: Record<string, unknown>): LtvAngleMapping | null {
    if (!SOURCE_KEYS.every(key => Object.hasOwn(fields, key))) return null;
    const rotation = numeric(fields.horizontal_angle);
    const tilt = numeric(fields.vertical_angle);
    const zoom = numeric(fields.zoom);
    if (rotation === null || tilt === null || zoom === null) return null;
    if (zoom < 0 || zoom > 10) return null;
    if (Math.abs(tilt) > HOST_PITCH_LIMIT) return null;
    const horizontalAngle = ((Math.round(rotation) % 360) + 360) % 360 > 180
        ? (((Math.round(rotation) % 360) + 360) % 360) - 360
        : ((Math.round(rotation) % 360) + 360) % 360;
    const pitchAngle = Math.round(tilt);
    const cameraDistance = Math.min(10, Math.max(1, 10 - zoom));
    const host = { horizontalAngle, pitchAngle, cameraDistance, wideAngle: false };
    return {
        source: { horizontalAngle: rotation, verticalAngle: tilt, zoom },
        host,
        // The source kept a wide-angle lens on the fisheye preset, which is saved as prompt text
        // (measured: node prompts carry "极度特写镜头，广角镜头，边缘带有鱼眼畸变效果"), so the
        // host panel's standard lens keeps that instruction instead of contradicting it.
        prompt: buildAnglePrompt(host),
    };
}

/** True when the node carries the source angle request, mapped or not. */
export function isLtvAngleOperation(fields: Record<string, unknown>) {
    return SOURCE_KEYS.every(key => Object.hasOwn(fields, key));
}
