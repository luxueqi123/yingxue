import { expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import seeds from '../../backend/internal/skills/seed/production-skills.json';
import templates from '../src/lib/canvas/ltv-native-scene-prompts.json';
import { ltvNativeScene, isLtvPanoramicScene, stripLtvPanoramaToken, stripLtvSlashPresetToken, stripLtvCameraPresetToken, ltvCameraPresetTexts, ltvUnresolvedCameraPresetIndexes, resolveLtvMentionTokens, type LtvMentionSlots } from '../src/lib/canvas/ltv-native-scene';
import { adaptLtvNativeProject } from '../src/lib/canvas/ltv-native-project';
import { resolveLtvRuntimeReferences, remapLtvReferencePlan, ltvTextReferenceBody } from '../src/lib/canvas/ltv-runtime-references';

test('十二套原生场景完整复用已有制作提示词，导入真实引用和完整制作规格', () => {
    const source = seeds.find(row => row.skill_id === templates.sourceSkillId)!;
    expect(Object.keys(templates.templates)).toHaveLength(12);
    for (const [scene, template] of Object.entries(templates.templates)) {
        expect(source.instruction).toContain(template.prompt);
        expect(createHash('sha256').update(template.prompt).digest('hex')).toBe(template.sha256);
        const snapshot = { nodes: [{ id: 'scene', type: 'image', position: { x: 0, y: 0 }, data: { action: 'image_generate', params: {
            scene, slashPreset: { scene }, modeType: 'image2image', prompt: '保留红色衣服', ratio: '16:9', resolution: '2K', count: 2,
            imageList: [{ nodeId: 'reference', url: 'https://example.test/reference.png' }],
        } } }], edges: [] };
        const before = JSON.stringify(snapshot);
        const result = adaptLtvNativeProject(snapshot, { channels: [] }, 'case', '场景');
        expect(result.adoptable).toBe(true);
        expect(result.readiness.status).toBe('configuration-required');
        const node = result.project.nodes.find(node => node.id === 'scene')!;
        expect(node.metadata!.prompt).toBe(`${template.prompt}\n\n保留红色衣服`);
        expect(node.metadata!.count).toBe(2);
        expect(node.metadata!.ltvExecutionContract).toBe('openai-image');
        expect(node.metadata!.model).toBe('');
        expect(node.metadata!.ltvReferencePlan!.references[0].nodeId).toBe('reference');
        expect(result.project.connections.some(edge => edge.fromNodeId === 'reference' && edge.toNodeId === 'scene')).toBe(true);
        expect(JSON.stringify(snapshot)).toBe(before);
        const persisted = JSON.parse(JSON.stringify(result.project));
        expect(persisted.nodes.find((node: { id: string }) => node.id === 'scene').metadata.prompt).toBe(node.metadata!.prompt);
    }
});

test('未知场景与冲突预设不冒充支持；仅不接收文本的原生场景才要求参考图', () => {
    expect(ltvNativeScene({ scene: 'unknown' })).toBeNull();
    expect(ltvNativeScene({ scene: 'story_beat_grid_4', slashPreset: { scene: 'unknown' } })).toBeNull();
    // Source 1usgkl3x4ppme.js i18n for this preset reads "支持文生/参考图生成" and the saved preset
    // declares inputRequirement "prompt_or_image", so a saved description alone is a complete input:
    // the node stays importable and only its channel is still missing.
    const text = adaptLtvNativeProject({ nodes: [{ id: 'scene', type: 'image', position: { x: 0, y: 0 }, data: { action: 'image_generate', params: {
        scene: 'story_beat_grid_4', prompt: '故事', modeType: 'text2image', ratio: '16:9', resolution: '2K',
    } } }], edges: [] }, { channels: [] }, 'case', '场景');
    expect(text.adoptable).toBe(true);
    expect(text.issues.some(issue => issue.code === 'scene-reference-required')).toBe(false);
    // The reference-image presets are not satisfied by a description. They keep a real upload slot:
    // the node imports, but it stays blocked until the author supplies the frame, and the picture is
    // never replaced by a template or a cover image.
    const image = adaptLtvNativeProject({ nodes: [{ id: 'scene', type: 'image', position: { x: 0, y: 0 }, data: { action: 'image_generate', params: {
        scene: 'frame_prediction_plus_3s', prompt: '三秒后', modeType: 'text2image', ratio: '16:9', resolution: '2K',
    } } }], edges: [] }, { channels: [] }, 'case', '场景');
    expect(image.adoptable).toBe(true);
    expect(image.issues.some(issue => issue.code === 'empty-resource')).toBe(true);
    expect(image.issues.some(issue => issue.code === 'scene-reference-required')).toBe(false);
    expect(image.project.nodes.some(node => node.id === 'scene::native-scene-input')).toBe(true);
});

test('原定义要求图像的场景保留上传入口，未上传拦截，上传与复制后引用同一资源', () => {
    for (const scene of ['multi_camera_grid_9', 'multi_camera_grid_9_4k', 'cinematic_lighting_correction', 'frame_prediction_plus_3s', 'frame_prediction_minus_5s']) {
        const source = { nodes: [{ id: 'effect', type: 'image', position: { x: 400, y: 0 }, data: { action: 'image_generate', params: {
            scene, modeType: 'text2image', prompt: '', ratio: '16:9', resolution: '4K', imageList: [],
        } } }], edges: [] };
        const original = JSON.stringify(source);
        const result = adaptLtvNativeProject(source, { channels: [] }, 'test', '场景');
        expect(result.adoptable).toBe(true);
        expect(result.issues.some(issue => issue.code === 'empty-resource')).toBe(true);
        const effect = result.project.nodes.find(node => node.id === 'effect')!;
        const input = result.project.nodes.find(node => node.id === 'effect::native-scene-input')!;
        const plan = effect.metadata!.ltvReferencePlan!;
        expect(input.title).toBe('待上传参考图');
        expect(effect.metadata!.ltvExecutionContract).toBe('openai-image');
        expect(() => resolveLtvRuntimeReferences(plan, result.project.nodes, plan.prompt)).toThrow('尚未生成成功');
        input.metadata = { ...input.metadata, content: '/api/resources/uploaded-image/file', storageKey: 'resource:uploaded-image', status: 'success' };
        expect(resolveLtvRuntimeReferences(plan, result.project.nodes, plan.prompt)[0].id).toBe(input.id);
        const copied = remapLtvReferencePlan(plan, new Map([[input.id, 'new-input']]), true);
        const restored = JSON.parse(JSON.stringify({ ...input, id: 'new-input' }));
        expect(resolveLtvRuntimeReferences(copied, [restored], plan.prompt)[0].metadata!.storageKey).toBe('resource:uploaded-image');
        expect(JSON.stringify(source)).toBe(original);
    }
});

test('已有真实图像连线的场景恢复原输入，不另外增加上传槽', () => {
    const source = { nodes: [
        { id: 'effect', type: 'image', position: { x: 400, y: 0 }, data: { action: 'image_generate', params: { scene: 'multi_camera_grid_9', modeType: 'image2image', prompt: '', ratio: '16:9', resolution: '2K', imageList: [] } } },
        { id: 'original', type: 'image', position: { x: 0, y: 0 }, data: { action: 'image_resource', url: ['https://example.test/original.png'] } },
    ], edges: [{ source: 'original', target: 'effect' }] };
    const result = adaptLtvNativeProject(source, { channels: [] }, 'test', '场景');
    expect(result.project.nodes.some(node => node.id.includes('native-scene-input'))).toBe(false);
    expect(result.adoptable).toBe(true);
    expect(result.project.nodes.find(node => node.id === 'effect')?.metadata?.ltvReferencePlan?.references[0].nodeId).toBe('original');
});

test('25格分镜继承原资产文字或图片合同，文字与上游故事可导入并持久化', () => {
    for (const linked of [false, true]) {
        const story = '雨夜，一位穿红衣的旅人追踪灯塔的信号，黎明找到失散的伙伴。';
        const nodes: any[] = [{ id: 'effect', type: 'image', position: { x: 400, y: 0 }, data: { action: 'image_generate', params: {
            scene: 'continuous_storyboard_grid_25', modeType: 'text2image', prompt: linked ? '' : story, ratio: '16:9', resolution: '2K',
        } } }];
        if (linked) nodes.push({ id: 'story', type: 'text', position: { x: 0, y: 0 }, data: { action: 'text_resource', content: [story] } });
        const result = adaptLtvNativeProject({ nodes, edges: linked ? [{ source: 'story', target: 'effect' }] : [] }, { channels: [] }, 'test', '文字分镜');
        expect(result.adoptable).toBe(true);
        expect(result.project.nodes.some(node => node.id.includes('native-scene-input'))).toBe(false);
        const restored = JSON.parse(JSON.stringify(result.project));
        const plan = restored.nodes.find((node: any) => node.id === 'effect').metadata.ltvReferencePlan;
        expect(plan.prompt).toContain('5x5 grid of twenty-five equally sized cells');
        expect(plan.prompt).toContain('the supplied story description');
        expect(plan.prompt).not.toContain('the supplied image');
        expect([plan.prompt, ...plan.texts.map((ref: any) => ref.content)].join('\n')).toContain(story);
        expect(plan.references).toHaveLength(0);
    }
});

test('25格分镜无故事且无图片时，模板不能掩盖缺失输入', () => {
    const result = adaptLtvNativeProject({ nodes: [{ id: 'effect', type: 'image', position: { x: 0, y: 0 }, data: { action: 'image_generate', params: {
        scene: 'continuous_storyboard_grid_25', modeType: 'text2image', prompt: '', ratio: '16:9', resolution: '2K',
    } } }], edges: [] }, { channels: [] }, 'test', '无输入');
    // Both inputs are empty: the preset accepts text or a picture, so this is the author's missing
    // creation text (input), not a template that the host cannot run.
    expect(result.issues.some(issue => issue.code === 'empty-prompt')).toBe(true);
    expect(result.issues.some(issue => issue.code === 'scene-reference-required')).toBe(false);
    expect(result.adoptable).toBe(true);
    expect(result.readiness.requirements.find(entry => entry.code === 'empty-prompt')!.category).toBe('input');
});

// Source 3iphtl71jy_tw.js module 184299:
//   let t="720_panoramic_with_prompt", r="720_panoramic";
//   isPanoramicGenerationScene(e){ return e===t||e===r }
//   mergeSettingsForPanoramicSlashScene(e,t,n){ return e!==r ? t : {...t, quality:"medium", ratio:i(n)} }
// The preset injects no prompt template and both scene values are editor markers, so the saved
// ratio/resolution/quality must survive while `scene` and `slashPreset` stop being reported.
test('720全景把保存的比例和清晰度原样带走，场景标记与编辑器 token 都不进模型', () => {
    for (const [scene, slashPreset, ratio, expected] of [
        ['720_panoramic', undefined, '2:1', 2912 * 1456],
        ['720_panoramic_with_prompt', { scene: '720_panoramic' }, '2:1', 2912 * 1456],
    ] as const) {
        const source = { nodes: [{ id: 'pano', type: 'image', position: { x: 0, y: 0 }, data: { action: 'image_generate', params: {
            scene, ...(slashPreset ? { slashPreset } : {}), modeType: 'image2image', prompt: '{{Panorama720}} 把右侧的人去掉',
            ratio, resolution: '2K', quality: 'medium', count: 1,
            imageList: [{ nodeId: 'reference', url: 'https://example.test/reference.png' }], imageListOrder: ['reference'],
        } } }], edges: [{ source: 'reference', target: 'pano' }] };
        const before = JSON.stringify(source);
        const result = adaptLtvNativeProject(source, { channels: [] }, 'case', '全景');
        expect(result.adoptable).toBe(true);
        expect(result.issues.some(issue => issue.code === 'unmapped-production-parameters')).toBe(false);
        const node = result.project.nodes.find(node => node.id === 'pano')!;
        expect(node.metadata!.prompt).toBe('把右侧的人去掉');
        expect(node.metadata!.ltvReferencePlan!.prompt).toBe('把右侧的人去掉');
        expect(node.metadata!.quality).toBe('medium');
        expect(node.metadata!.size!.split('x').map(Number).reduce((a: number, b: number) => a * b, 1)).toBe(expected);
        expect(node.metadata!.ltvExecutionContract).toBe('openai-image');
        expect(JSON.stringify(source)).toBe(before);
    }
});

// Source 2xt5r4-qlahum.js strips both editor tokens with the same whitespace rule:
//   stripPanorama720TokenFromPrompt: e => e.replace(v,"").replace(/[ \t]+/g," ").trim()
//   stripSlashPresetToken:           e => e.replace(T,"").replace(/[ \t]+/g," ").trim()
// Neither token is model input text; {{Image N}} stays because it selects a real reference slot.
test('编辑器预设 token 被清掉，素材引用 token 保留', () => {
    expect(isLtvPanoramicScene('720_panoramic')).toBe(true);
    expect(isLtvPanoramicScene('720_panoramic_with_prompt')).toBe(true);
    expect(isLtvPanoramicScene('multi_camera_grid_9')).toBe(false);
    expect(isLtvPanoramicScene(undefined)).toBe(false);
    expect(stripLtvPanoramaToken('{{Panorama720}} 保留红色衣服')).toBe('保留红色衣服');
    expect(stripLtvPanoramaToken('{{Panorama720}}')).toBe('');
    expect(stripLtvSlashPresetToken('{{SlashPreset:multi_camera_grid_9}}场景在白色瓷砖空间')).toBe('场景在白色瓷砖空间');
    expect(stripLtvSlashPresetToken('{{SlashPreset:character_face_turnaround_3view}}')).toBe('');
    expect(stripLtvSlashPresetToken('保留 {{Image 1}} 与 {{SlashPreset:story_beat_grid_4}} 的构图')).toBe('保留 {{Image 1}} 与 的构图');
});

// Source 1di1-3y--egfx.js buildPrevisStudioCameraControls writes `{{CameraPreset N}}` for each
// added preset and appends the markers to the prompt, while source 0zme995kos_wy.js submits the same
// presets as an array for the non-deferring video modes. The marker is therefore an index into that
// array, and the host appends the array text itself. Source 2xt5r4-qlahum.js strips the marker with
//   w=/\{\{CameraPreset\s+\d+\}\}/g
//   stripCameraPresetMentionTokens: e => e.replace(w,"").replace(v,"").replace(T,"").trim()
// Measured 2026-09-17: 46 markers in 9 already-published projects were reaching the model.
test('运镜预设标记按索引消掉，预设正文仍进模型；索引落空则如实报缺口', () => {
    expect(stripLtvCameraPresetToken('{{CameraPreset 1}} 老爷子悠闲地听着足球赛。')).toBe('老爷子悠闲地听着足球赛。');
    expect(stripLtvCameraPresetToken('{{CameraPreset 1}}{{CameraPreset 2}} 一镜到底。')).toBe('一镜到底。');
    expect(stripLtvCameraPresetToken('低角度平拍 {{CameraPreset 1}}')).toBe('低角度平拍');
    expect(ltvCameraPresetTexts([{ prompt: 'POV shot, first-person perspective.' }, { prompt: '   ' }, null])).toEqual(['POV shot, first-person perspective.', '', '']);
    expect(ltvCameraPresetTexts(undefined)).toEqual([]);
    expect(ltvUnresolvedCameraPresetIndexes('{{CameraPreset 1}} 正文', ['Handheld shot.'])).toEqual([]);
    expect(ltvUnresolvedCameraPresetIndexes('{{CameraPreset 1}} {{CameraPreset 2}} 正文', ['Handheld shot.'])).toEqual([2]);
    expect(ltvUnresolvedCameraPresetIndexes('{{CameraPreset 1}} 正文', [])).toEqual([1]);

    const source = { nodes: [
        { id: 'clip', type: 'video', position: { x: 0, y: 0 }, data: { action: 'video_generate', params: {
            model: 'star-video2', modeType: 'mixed2video', prompt: '{{CameraPreset 1}} 小男孩跑过雪地。',
            cameraPresets: [{ prompt: 'Handheld shot, natural camera shake.', name: '手持', tagLabel: '手持' }],
            duration: 5, ratio: '16:9', resolution: '720p', count: 1,
            imageList: [{ nodeId: 'reference', url: 'https://example.test/reference.png' }], imageListOrder: ['reference'],
        } } },
        { id: 'lost', type: 'video', position: { x: 0, y: 400 }, data: { action: 'video_generate', params: {
            model: 'star-video2', modeType: 'mixed2video', prompt: '{{CameraPreset 1}} 女生扑回床上。',
            duration: 5, ratio: '16:9', resolution: '720p', count: 1,
            imageList: [{ nodeId: 'reference', url: 'https://example.test/reference.png' }], imageListOrder: ['reference'],
        } } },
    ], edges: [{ source: 'reference', target: 'clip' }, { source: 'reference', target: 'lost' }] };
    const before = JSON.stringify(source);
    const result = adaptLtvNativeProject(source, { channels: [] }, 'case', '运镜');
    const clip = result.project.nodes.find(node => node.id === 'clip')!;
    // The marker is gone and the saved preset text is appended exactly once.
    expect(clip.metadata!.prompt).toBe('小男孩跑过雪地。\n\nHandheld shot, natural camera shake.');
    expect(clip.metadata!.prompt).not.toContain('{{CameraPreset');
    expect(result.issues.some(issue => issue.nodeId === 'clip' && issue.code === 'invalid-camera-preset')).toBe(false);
    // A marker with no saved preset has no recoverable instruction: it is reported as missing input,
    // not dropped silently and not counted as an adapter gap.
    const lost = result.project.nodes.find(node => node.id === 'lost')!;
    expect(lost.metadata!.prompt).not.toContain('{{CameraPreset');
    expect(result.issues.some(issue => issue.nodeId === 'lost' && issue.code === 'missing-camera-preset')).toBe(true);
    expect(result.adoptable).toBe(true);
    expect(result.readiness.status).toBe('configuration-required');
    expect(JSON.stringify(source)).toBe(before);
});

// Source 1di1-3y--egfx.js `normalizeMixedMentionsToTyped` is wired only to `e$.prompt` and
// `e$.multi_prompt` (0zme995kos_wy.js), and source 0wllgknwomk2u.js forwards `textList[].content`
// verbatim, so a saved text body keeps the editor's index markers. The host appends text bodies
// straight into the model prompt (canvas-node-generation.ts), so the adapter rewrites them to the
// same `@图片N` labels the prompt rewrite already uses.
test('文本正文里的素材标记按槽位改写成宿主标签，索引落空则如实报缺口', () => {
    const slots: LtvMentionSlots = {
        original: { image: ['a', 'b'], video: ['v1'], audio: [], mixed: ['a', 'v1'] },
        sorted: { image: ['b', 'a'], video: ['v1'], audio: [] },
    };
    // The typed marker counts against the saved list; the label counts against the host shelf order.
    expect(resolveLtvMentionTokens('{{Image 1}} 走', slots)).toEqual({ text: '@图片2 走', unresolved: [] });
    expect(resolveLtvMentionTokens('A{{Portrait 2}}B', slots)).toEqual({ text: 'A@图片1 B', unresolved: [] });
    // The line break the editor inserted is part of the marker, exactly as the source regex captures it.
    expect(resolveLtvMentionTokens('镜头一\n{{Video 1}} 跑', slots)).toEqual({ text: '镜头一\n@视频1 跑', unresolved: [] });
    // Mixed slots resolve to whichever list holds the node, like the source `mixedList[n-1].mediaType`.
    expect(resolveLtvMentionTokens('{{Mixed 1}} 与 {{Mixed 2}}', slots)).toEqual({ text: '@图片2 与 @视频1 ', unresolved: [] });
    // An index with no saved slot is the source's `return ""` branch: the marker never survives, but
    // it is reported so the lost requirement is not shortened quietly.
    expect(resolveLtvMentionTokens('前{{Image 3}}后', slots)).toEqual({ text: '前后', unresolved: ['{{Image 3}}'] });
    expect(resolveLtvMentionTokens('前{{Mixed 3}}后', slots)).toEqual({ text: '前后', unresolved: ['{{Mixed 3}}'] });
    expect(resolveLtvMentionTokens('没有标记', slots)).toEqual({ text: '没有标记', unresolved: [] });
});

test('被生成节点消费的文本正文只把改写结果送进模型，原文仍保留为版本键', () => {
    const content = ['第一段\n{{Mixed 1}} 走远\n{{Mixed 2}} 靠近'];
    const source = { nodes: [
        { id: 'vid', type: 'video', position: { x: 0, y: 0 }, data: { action: 'video_generate', params: {
            model: 'star-video2', modeType: 'mixed2video', prompt: '镜头一 {{Mixed 2}} 跑过雪地。',
            duration: 5, ratio: '16:9', resolution: '720p', count: 1,
            imageList: [{ nodeId: 'still', url: 'https://example.test/still.png' }], imageListOrder: ['still'],
            videoList: [{ nodeId: 'clipref', url: 'https://example.test/ref.mp4' }], videoListOrder: ['clipref'],
            mixedListOrder: ['still', 'clipref'], textList: [{ nodeId: 'script', content }],
        } } },
        { id: 'still', type: 'image', position: { x: -400, y: 0 }, data: { action: 'image_resource', url: ['https://example.test/still.png'] } },
        { id: 'clipref', type: 'video', position: { x: -400, y: 300 }, data: { action: 'video_resource', url: ['https://example.test/ref.mp4'] } },
        { id: 'script', type: 'text', position: { x: 0, y: 600 }, data: { action: 'text_resource', content } },
    ], edges: [
        { id: 'e1', source: 'still', target: 'vid' },
        { id: 'e2', source: 'clipref', target: 'vid' },
        { id: 'e3', source: 'script', target: 'vid' },
    ] };
    const before = JSON.stringify(source);
    const result = adaptLtvNativeProject(source, { channels: [] }, 'case', '混合引用');
    const vid = result.project.nodes.find(node => node.id === 'vid')!;
    // The prompt branch was already rewritten by buildLtvReferencePlan; the text branch must match it.
    expect(vid.metadata!.prompt).toBe('镜头一 @视频1 跑过雪地。');
    const texts = vid.metadata!.ltvReferencePlan!.texts!;
    expect(texts).toHaveLength(1);
    // `content` keeps the saved body because it is the version key checked at run time.
    expect(texts[0].content).toBe(content[0]);
    expect(texts[0].resolved).toBe('第一段\n@图片1 走远\n@视频1 靠近');
    expect(ltvTextReferenceBody(texts[0])).toBe('第一段\n@图片1 走远\n@视频1 靠近');
    for (const body of texts.map(ref => ltvTextReferenceBody(ref))) expect(body).not.toContain('{{');
    expect(result.adoptable).toBe(true);
    expect(result.issues.some(issue => issue.code === 'unresolved-text-mention')).toBe(false);
    expect(JSON.stringify(source)).toBe(before);
});

test('正文里没有对应素材的标记只被如实上报，不猜引用也不丢正文', () => {
    const content = ['{{Image 5}} 的构图'];
    const source = { nodes: [
        { id: 'img', type: 'image', position: { x: 0, y: 0 }, data: { action: 'image_generate', params: {
            model: 'source-image', modeType: 'image2image', prompt: '重绘',
            imageList: [{ nodeId: 'still', url: 'https://example.test/still.png' }], imageListOrder: ['still'],
            textList: [{ nodeId: 'script', content }],
        } } },
        { id: 'still', type: 'image', position: { x: -400, y: 0 }, data: { action: 'image_resource', url: ['https://example.test/still.png'] } },
        { id: 'script', type: 'text', position: { x: 0, y: 600 }, data: { action: 'text_resource', content } },
    ], edges: [{ id: 'e1', source: 'still', target: 'img' }, { id: 'e2', source: 'script', target: 'img' }] };
    const before = JSON.stringify(source);
    const result = adaptLtvNativeProject(source, { channels: [] }, 'case', '落空引用');
    const img = result.project.nodes.find(node => node.id === 'img')!;
    const text = img.metadata!.ltvReferencePlan!.texts![0];
    expect(text.content).toBe(content[0]);
    // The source regex consumes the marker's trailing spaces with it, so the surviving text starts
    // at `的`.
    expect(text.resolved).toBe('的构图');
    const issue = result.issues.find(issue => issue.code === 'unresolved-text-mention')!;
    expect(issue.nodeId).toBe('img');
    expect(issue.detail).toContain('{{Image 5}}');
    // A missing reference is a user-supplied input, so the graph still imports for rebinding.
    expect(result.adoptable).toBe(true);
    // Only the missing slot is an input gap; the unmatched channel keeps the usual configuration
    // notice, and neither of them is a reason to drop the graph.
    expect(result.readiness.requirements.find(entry => entry.code === 'unresolved-text-mention')!.category).toBe('input');
    expect(result.readiness.status).toBe('configuration-required');
    expect(JSON.stringify(source)).toBe(before);
});
