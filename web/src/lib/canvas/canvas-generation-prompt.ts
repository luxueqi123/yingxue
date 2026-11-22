import type { CanvasNodeMetadata } from '../../types/canvas';
import { buildCameraPrompt } from './camera-prompt-library';
import { buildPortraitTexturePrompt } from './canvas-portrait-texture';

/** Initial execution and retry must compile the same optical settings exactly once. */
export function compileCanvasGenerationPrompt(prompt: string, mode: string, metadata?: CanvasNodeMetadata) {
    if (mode !== 'image') return prompt;
    let result = metadata?.portraitTexture ? buildPortraitTexturePrompt(prompt, metadata.portraitTexture) : prompt;
    if (metadata?.cameraControl?.enabled) {
        const camera = metadata.cameraControl;
        result += `\n${buildCameraPrompt({ cameraId: camera.camera, lensId: camera.lens, focalLengthMm: camera.focalLength, apertureF: camera.aperture })}`;
    }
    return result;
}
