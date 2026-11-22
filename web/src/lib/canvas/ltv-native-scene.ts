import prompts from './ltv-native-scene-prompts.json';
import { readLtvParameterLayers } from './ltv-parameter-layers';

// Source 3bspxqipxerfy.js getFallbackSlashImageItems explicitly requires an image for these operations.
const imageRequiredScenes = new Set(['multi_camera_grid_9', 'multi_camera_grid_9_4k', 'cinematic_lighting_correction', 'frame_prediction_plus_3s', 'frame_prediction_minus_5s']);

// These values are written by the source client itself while it builds node params
// (`params:{...,scene:"group-generate"}` in 0wllgknwomk2u.js, `d={...l,scene:"script-generate"}`
// and the v2 equivalent), so they record how the node was created instead of carrying a
// production parameter. They are also absent from the source slash-preset list, unlike the
// real presets (storyboard_canvas_skill and friends) which the user selects and which stay
// reported as unmapped until a matching template exists.
const workflowScenes = new Set([
    'group-generate', 'script-generate', 'script-generate-v2',
]);

/** Node-origin markers written by the source client; not request fields for any model. */
export function isLtvWorkflowScene(value: unknown) {
    return typeof value === 'string' && workflowScenes.has(value);
}

// Source 3iphtl71jy_tw.js module 184299 keeps the 720° panorama as two scene values and its own
// submit-time settings rule:
//   let t="720_panoramic_with_prompt", r="720_panoramic";
//   function i(e){return "lib-image-2"===e ? "2:1" : "21:9"}            // getPanoramicRatioForModel
//   isPanoramicGenerationScene(e){ return e===t||e===r }
//   mergeSettingsForPanoramicSlashScene(e,t,n){ if(e!==r) return t; return {...t, quality:"medium", ratio:i(n)} }
// Neither value carries a prompt template (the preset in 3bspxqipxerfy.js only declares
// resolution/quality/ratio enums), and the marker is a slash-preset token the editor inserts into
// the prompt: `x="{{Panorama720}}"`, removed again by stripPanorama720TokenFromPrompt. The saved
// project already stores the resulting ratio and quality, so adaptation keeps them instead of
// recomputing them, and the token never reaches a model.
const panoramicScenes = new Set(['720_panoramic', '720_panoramic_with_prompt']);

const panoramaToken = /\{\{Panorama720\}\}/g;
// Source 2xt5r4-qlahum.js defines both tokens side by side and strips them with the same
// whitespace-collapse rule:
//   T=/\{\{SlashPreset:[^}]+\}\}/g
//   stripPanorama720TokenFromPrompt: e => e.replace(v,"").replace(/[ \t]+/g," ").trim()
//   stripSlashPresetToken:           e => e.replace(T,"").replace(/[ \t]+/g," ").trim()
// Source 3iphtl71jy_tw.js `ei()` applies stripSlashPresetToken to every saved image prompt
// before submit, so the preset name never reaches a model either.
const slashPresetToken = /\{\{SlashPreset:[^}]+\}\}/g;

// Source 1di1-3y--egfx.js buildPrevisStudioCameraControls writes `{{CameraPreset N}}` for every
// preset the user adds to the shot and appends those markers to the saved prompt:
//   let y=g.map((e,t)=>`{{CameraPreset ${h.length+t+1}}}`)
//   m=["string"==typeof i.prompt?i.prompt.trim():"",...y].filter(Boolean).join(" ")
// Source 0zme995kos_wy.js then submits the same presets as an array for the modes that do not defer
// them (`cameraPresets:K.map(e=>e.prompt)`), so in the source the marker is an index into that array
// and the backend substitutes the preset text for it. Source 2xt5r4-qlahum.js confirms the marker is
// editor state rather than model text by stripping it before submit:
//   w=/\{\{CameraPreset\s+\d+\}\}/g
//   stripCameraPresetMentionTokens: e => e.replace(w,"").replace(v,"").replace(T,"").trim()
// The host has no marker resolver; the adapter appends the preset text itself from the saved
// cameraPresets array, so the index marker must be removed or the model would receive both the
// literal marker and the preset text. Measured 2026-09-17 across 963 local snapshots: 676 marker
// nodes (81 cases) are fully covered by their saved cameraPresets; 46 markers in 9 already-published
// projects were still reaching the model because the host kept `f.prompt` unchanged for video nodes.
// A marker whose index has no saved preset keeps its previous handling: it stays reported rather
// than being silently deleted (see the invalid-camera-preset rule in ltv-native-project.ts).
const cameraPresetToken = /\{\{CameraPreset\s+(\d+)\}\}/g;

/** Both 720° panorama scene values belong to the one 720 preset, not to any request field. */
export function isLtvPanoramicScene(value: unknown) {
    return typeof value === 'string' && panoramicScenes.has(value);
}

/** The editor's {{Panorama720}} token selects the preset; it is not model input text. */
export function stripLtvPanoramaToken(prompt: string) {
    return prompt.replace(panoramaToken, '').replace(/[ \t]+/g, ' ').trim();
}

/** The editor's {{SlashPreset:...}} token selects a preset; it is not model input text. */
export function stripLtvSlashPresetToken(prompt: string) {
    return prompt.replace(slashPresetToken, '').replace(/[ \t]+/g, ' ').trim();
}

/**
 * Removes every `{{CameraPreset N}}` marker from a saved prompt. The marker is an editor index into
 * the submitted cameraPresets array, never model text, so it is always removed; callers must report
 * an index that has no usable saved preset instead of dropping that requirement silently.
 */
export function stripLtvCameraPresetToken(prompt: string) {
    return prompt.replace(cameraPresetToken, '').replace(/[ \t]+/g, ' ').trim();
}

/** The saved cameraPreset texts a prompt's `{{CameraPreset N}}` markers resolve against. */
export function ltvCameraPresetTexts(value: unknown) {
    if (!Array.isArray(value)) return [] as string[];
    return value.map(preset => {
        const prompt = (preset as Record<string, unknown> | null)?.prompt;
        return typeof prompt === 'string' && prompt.trim() ? prompt : '';
    });
}

/** Indices whose `{{CameraPreset N}}` marker has no usable saved preset to resolve it. */
export function ltvUnresolvedCameraPresetIndexes(prompt: string, presets: ReadonlyArray<string>) {
    const unresolved: number[] = [];
    for (const match of prompt.matchAll(cameraPresetToken)) {
        const index = Number(match[1]);
        if (!presets[index - 1]) unresolved.push(index);
    }
    return unresolved;
}

// Source 2xt5r4-qlahum.js writes one mention token per referenced resource and only ever reads
// typed slots back out of it (`{{${mentionType} ${index}}}`), while source 1di1-3y--egfx.js
// normalizeMixedMentionsToTyped rewrites `{{Mixed N}}` into `{{Image|Video|Audio N}}`:
//   normalizeMixedMentionsToTyped: e => e.replace(/(\n[ \t]*)?\{\{Mixed\s+(\d+)\}\}[ \t]*/g, ...)
// Both run only on `prompt`/`multi_prompt` (0zme995kos_wy.js) and never on `textList`, which the
// submit path (0wllgknwomk2u.js) forwards verbatim:
//   textList: aD.textList.flatMap(e => Array.isArray(e?.content) ? e.content.filter(...) : [])
// A saved text node therefore keeps the literal marker, and the host appends text content straight
// into the model prompt (canvas-node-generation.ts), so the marker would reach the model as raw
// editor text. The host has no marker resolver, so every slot is rewritten to the same host label
// the reference plan already uses. Measured 2026-09-17 across 963 local snapshots: 60 consumed
// text-node copies in 17 cases carry markers; 1 case keeps an out-of-range `{{Image 5}}` whose
// saved imageList only has 4 entries, which stays reported instead of being invented.
// The leading newline/indent group is captured so a rewritten body keeps the line break the editor
// inserted; source 1di1-3y--egfx.js captures it for exactly the same reason:
//   /(\n[ \t]*)?\{\{Mixed\s+(\d+)\}\}[ \t]*/g
const mediaMentionToken = /(\n[ \t]*)?\{\{(Image|Portrait|Video|Audio|Mixed)\s+(\d+)\}\}[ \t]*/g;

export type LtvMentionSlots = {
    /** Saved order, which is what the source index markers count against. */
    original: { image: ReadonlyArray<string>; video: ReadonlyArray<string>; audio: ReadonlyArray<string>; mixed: ReadonlyArray<string> };
    /** Ordering-array order, which is what the host's `@图片N` labels count against. */
    sorted: { image: ReadonlyArray<string>; video: ReadonlyArray<string>; audio: ReadonlyArray<string> };
};

/**
 * Rewrites the editor's resource markers inside one saved text body into the host's `@图片N` labels.
 * Callers pass the ordered slot node ids for the consuming node, so an index that has no saved slot
 * is returned as unresolved instead of being replaced with a guessed reference.
 */
export function resolveLtvMentionTokens(content: string, slots: LtvMentionSlots) {
    const labels = { image: '图片', video: '视频', audio: '音频' } as const;
    const unresolved: string[] = [];
    const text = content.replace(mediaMentionToken, (token, breakBefore: string | undefined, type: string, index: string) => {
        const position = Number(index) - 1;
        // Source normalizeMixedMentionsToTyped reads `mixedList[n-1].mediaType` and emits the typed
        // marker for that media kind, so a `{{Mixed N}}` slot is a reference to whichever list holds
        // it; the host label depends on the media kind, not on the marker name.
        const declared: keyof typeof labels = type === 'Audio' ? 'audio' : type === 'Video' ? 'video' : 'image';
        const nodeId = type === 'Mixed' ? slots.original.mixed[position] : slots.original[declared][position];
        const kind = (['image', 'video', 'audio'] as const).find(candidate => slots.sorted[candidate].includes(nodeId!)) ?? declared;
        const label = slots.sorted[kind].indexOf(nodeId) + 1;
        // Source normalizeMixedMentionsToTyped returns "" for an index with no slot, so a dead
        // reference never survives as literal editor text. It is still reported to the caller, so the
        // requirement is surfaced instead of being shortened quietly.
        if (!nodeId || label < 1) { unresolved.push(token.trim()); return ''; }
        return `${breakBefore ?? ''}@${labels[kind]}${label} `;
    });
    return { text, unresolved };
}

/** Only materialize a missing user input, never replace a saved reference or guess an unbound edge. */
export function addLtvSceneInputSlots(nodes: Array<Record<string, any>>, edges: Array<Record<string, any>>) {
    const ids = new Set(nodes.map(node => node.id));
    const imageIds = new Set(nodes.filter(node => node.type === 'image').map(node => node.id));
    for (const node of nodes.slice()) {
        if (node.type !== 'image' || node.data?.action !== 'image_generate') continue;
        const params = node.data.params;
        if (!params || typeof params !== 'object' || Array.isArray(params)) continue;
        const { fields } = readLtvParameterLayers(params);
        if (!imageRequiredScenes.has(String(fields.scene)) || !ltvNativeScene(fields)) continue;
        if (params.imageList != null && (!Array.isArray(params.imageList) || params.imageList.length)) continue;
        if (params.settings?.modeType !== undefined || params.advancedSettings?.modeType !== undefined) continue;
        if (params.modeType !== undefined && !['text2image', 'image2image', ''].includes(params.modeType)) continue;
        if (edges.some(edge => edge.target === node.id && imageIds.has(edge.source))) continue;
        const id = `${node.id}::native-scene-input`;
        if (ids.has(id)) throw new Error('场景参考输入节点ID冲突');
        ids.add(id);
        nodes.push({ id, type: 'image', position: { x: Number(node.position?.x) - 400, y: Number(node.position?.y) },
            ...(node.parentId ? { parentId: node.parentId } : {}),
            data: { name: '待上传参考图', action: 'image_resource', url: [] } });
        params.imageList = [{ nodeId: id, url: '' }];
        params.imageListOrder = [id];
        params.modeType = 'image2image';
    }
}

/** Reuse the existing production reference skill; this is a native implementation, not a source-backend call. */
export function ltvNativeScene(fields: Record<string, unknown>) {
    if (typeof fields.scene !== 'string') return null;
    const key = fields.scene === 'multi_camera_grid_9_4k' ? 'multi_camera_grid_9' : fields.scene;
    if (!Object.hasOwn(prompts.templates, key)) return null;
    const preset = fields.slashPreset;
    if (preset !== undefined && preset !== null) {
        if (typeof preset !== 'object' || Array.isArray(preset)) return null;
        const scene = (preset as Record<string, unknown>).scene;
        if (scene !== undefined && scene !== fields.scene) return null;
    }
    const template = prompts.templates[key as keyof typeof prompts.templates];
    return { ...template, textPrompt: ltvNativeSceneTextPrompt(key, template), sourceSkillId: prompts.sourceSkillId, scene: fields.scene };
}

/**
 * The text branch of a saved scene template, or undefined for the scenes whose source contract is
 * image-only (`inputRequirement:"image"` in 3bspxqipxerfy.js: multi_camera_grid_9 /
 * multi_camera_grid_9_4k / cinematic_lighting_correction / frame_prediction_plus_3s /
 * frame_prediction_minus_5s). Every other template in the same preset list accepts a description,
 * which the source states twice: the i18n note for each of them reads
 * "支持文生/参考图生成" / "支持通过文本/参考图生成", and the preset objects the users' own saved
 * projects carry declare `inputRequirement:"prompt_or_image"`. Measured 2026-09-17 across the 963
 * archived snapshots: 33 saved scene nodes carry a complete preset, and the 8 that declare
 * prompt_or_image (character_turnaround_3view, character_face_turnaround_3view,
 * character_setting_sheet, scene_setting_sheet, product_setting_sheet, story_beat_grid_4,
 * continuous_storyboard_grid_25, 720_panoramic / portrait_texture_adjustment) are exactly the
 * templates that had no text branch. Only the reference wording changes; every grid, continuity and
 * consistency constraint stays byte-identical to the published prompt.
 */
export function ltvNativeSceneTextPrompt(key: string, template: { prompt: string }) {
    if (imageRequiredScenes.has(key)) return undefined;
    return template.prompt.replaceAll('the supplied image', key === 'continuous_storyboard_grid_25' ? 'the supplied story description' : 'the supplied description');
}
