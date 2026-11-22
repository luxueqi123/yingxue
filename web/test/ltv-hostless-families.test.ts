import { expect, test } from 'bun:test';
import {
    hasHostlessNodeMatching,
    nodeIsHostlessBrokenReference,
    nodeIsHostlessBrokenStoryboard,
    nodeIsHostlessFrameOnlyKlingEdit,
    nodeIsHostlessHailuoModern,
    nodeIsHostlessLtvOutpaint,
    nodeIsHostlessLtvPrivateEditor,
    nodeIsHostlessMultiPrompt,
    nodeIsHostlessBrokenTextReference,
    nodeIsHostlessPortraitTexture,
    nodeIsHostlessSeedanceVideoEdit,
    nodeIsHostlessTopazScale,
    nodeIsHostlessWanxExtendPrompt,
    nodeIsHostlessKlingMotionControl,
    nodeIsHostlessStoryboardSpeech,
    nodeIsHostlessArkSequential,
    nodeIsHostlessVocalStability,
    nodeIsHostlessSpeechPitch,
    nodeIsHostlessOmniReferenceVideo,
    nodeIsHostlessOmniVideoEdit,
    nodeIsHostlessO3StaleImage2Video,
    nodeIsHostlessHappyHorseImage2Video,
    nodeIsHostlessViduImage2Video,
    nodeIsHostlessPixverseStyle,
    nodeIsHostlessWanxMultiClip,
    nodeIsHostlessSeedAudioTts,
    nodeIsHostlessMurekaReference,
    nodeIsHostlessUnsavedRequest,
} from '../scripts/ltv-hostless-families.mjs';

const unmapped = (nodeId: string, detail: string) => ({ code: 'unmapped-production-parameters', detail, nodeId });
const other = (nodeId: string, code = 'advanced-operation') => ({ code, detail: 'somethingElse', nodeId });
const unsupported = (nodeId: string, detail: string) => ({ code: 'unsupported-operation', detail, nodeId });
const report = (nodeId: string, sourceModel: string, operation: string, references: Record<string, number> = {}) => modelReport(nodeId, { operation, sourceModel, references, promptChars: 120 });


test('私有图像编辑族要求键里同时出现 scene 与 originImage', () => {
    // 实测的四种签名都命中
    expect(nodeIsHostlessLtvPrivateEditor([unmapped('n1', 'originImage,scene')])).toBe(true);
    expect(nodeIsHostlessLtvPrivateEditor([unmapped('n1', 'mark,originImage,scene')])).toBe(true);
    expect(nodeIsHostlessLtvPrivateEditor([unmapped('n1', 'focusRegion,originImage,scene')])).toBe(true);
    expect(nodeIsHostlessLtvPrivateEditor([unmapped('n1', 'UI_KeyLight,height,originImage,scene,width')])).toBe(true);
    expect(nodeIsHostlessLtvPrivateEditor([unmapped('n1', 'originImage,scene'), unmapped('n1', 'mark')])).toBe(true);
});

test('私有图像编辑族不吞掉组图、换装等可承接场景', () => {
    // 已发布集合里的 scene 值（script-generate / group-generate / *_turnaround_3view / multi_camera_grid_9 …）
    // 只带 scene 或只带 originImage，不能被判为舍弃
    expect(nodeIsHostlessLtvPrivateEditor([unmapped('n1', 'scene')])).toBe(false);
    expect(nodeIsHostlessLtvPrivateEditor([unmapped('n1', 'originImage')])).toBe(false);
    // 键集越界（含非私有编辑字段）或含非 unmapped 硬阻塞时不命中
    expect(nodeIsHostlessLtvPrivateEditor([unmapped('n1', 'originImage,scene,fineTuneType')])).toBe(false);
    expect(nodeIsHostlessLtvPrivateEditor([unmapped('n1', 'originImage,scene'), other('n1')])).toBe(false);
    expect(nodeIsHostlessLtvPrivateEditor([])).toBe(false);
});

test('可灵自定义分镜族只在唯一缺口是 multi_prompt 时命中', () => {
    expect(nodeIsHostlessMultiPrompt([unmapped('v1', 'multi_prompt')])).toBe(true);
    expect(nodeIsHostlessMultiPrompt([unmapped('v1', 'multi_prompt'), unmapped('v1', 'multi_prompt')])).toBe(true);
    expect(nodeIsHostlessMultiPrompt([unmapped('v1', 'multi_prompt,subjects')])).toBe(false);
    expect(nodeIsHostlessMultiPrompt([unmapped('v1', 'multi_prompt'), other('v1')])).toBe(false);
    // 智能分镜 multiShot 是合同支持的布尔开关，不在舍弃范围
    expect(nodeIsHostlessMultiPrompt([unmapped('v1', 'multiShot')])).toBe(false);
});

test('topaz 视频 scale 族只认单键 scale', () => {
    expect(nodeIsHostlessTopazScale([unmapped('n1', 'scale')])).toBe(true);
    // 有 fps/slowmo/specifiedModel 时属于 topaz 视频自己的参数族，交由更早的族处理
    expect(nodeIsHostlessTopazScale([unmapped('n1', 'scale,fps,slowmo')])).toBe(false);
    expect(nodeIsHostlessTopazScale([unmapped('n1', 'scale'), other('n1')])).toBe(false);
});

test('逐节点套用：任一节点整族命中即整例命中，跨节点混合不命中', () => {
    const hard = [unmapped('a', 'originImage,scene'), unmapped('b', 'scale')];
    expect(hasHostlessNodeMatching(hard, nodeIsHostlessLtvPrivateEditor)).toBe(true);
    expect(hasHostlessNodeMatching(hard, nodeIsHostlessTopazScale)).toBe(true);
    // 同一节点上两组字段混在一起时不命中任一单族规则
    const mixed = [unmapped('a', 'originImage,scene,scale')];
    expect(hasHostlessNodeMatching(mixed, nodeIsHostlessLtvPrivateEditor)).toBe(false);
    expect(hasHostlessNodeMatching(mixed, nodeIsHostlessTopazScale)).toBe(false);
    expect(hasHostlessNodeMatching([], nodeIsHostlessTopazScale)).toBe(false);
});

test('LTV 扩图族只认整节点都是 image_edit:expand-image 的上报', () => {
    expect(nodeIsHostlessLtvOutpaint([unsupported('n1', 'image_edit:expand-image')])).toBe(true);
    // 一个节点上多条 expand 上报同样命中
    expect(nodeIsHostlessLtvOutpaint([unsupported('n1', 'image_edit:expand-image'), unsupported('n1', 'image_edit:expand-image')])).toBe(true);
    // 普通 image_edit（私有编辑器的其它场景）不是扩图，交由 F1 的字段签名处理
    expect(nodeIsHostlessLtvOutpaint([unsupported('n1', 'image_edit')])).toBe(false);
    expect(nodeIsHostlessLtvOutpaint([unsupported('n1', 'image_edit:erase')])).toBe(false);
    // 节点上还有别的硬阻塞时不命中
    expect(nodeIsHostlessLtvOutpaint([unsupported('n1', 'image_edit:expand-image'), unmapped('n1', 'originImage,scene')])).toBe(false);
    expect(nodeIsHostlessLtvOutpaint([])).toBe(false);
});

test('逐节点套用扩图族：同一案例里任一节点整节点是扩图即命中，别的节点不影响', () => {
    const hard = [unsupported('a', 'image_edit:expand-image'), other('b', 'model-selection-required')];
    expect(hasHostlessNodeMatching(hard, nodeIsHostlessLtvOutpaint)).toBe(true);
    // 同一个节点上扩图上报与别的硬阻塞混在一起时不命中
    const sameNode = [unsupported('a', 'image_edit:expand-image'), other('a', 'model-selection-required')];
    expect(hasHostlessNodeMatching(sameNode, nodeIsHostlessLtvOutpaint)).toBe(false);
});

const modelSelection = (nodeId: string, detail: object) => ({ code: 'model-selection-required', detail: JSON.stringify(detail), nodeId });
const search = (nodeId: string) => ({ code: 'search-option-unmapped', detail: '{"sourceModel":"star-video2.5","reason":"x"}', nodeId });
const quality = (nodeId: string) => ({ code: 'video-quality-adapter-required', detail: '{"quality":"low","sourceModel":"kling-v3-omni"}', nodeId });
const invalidRef = (nodeId: string, detail: string) => ({ code: 'invalid-reference', detail, nodeId });

test('源视频编辑操作族只认 Seedance 系与 wanx2.7-video 的编辑/长视频操作', () => {
    expect(nodeIsHostlessSeedanceVideoEdit([modelSelection('v1', { operation: 'videoEdit2video', sourceModel: 'star-video2.5' })])).toBe(true);
    expect(nodeIsHostlessSeedanceVideoEdit([modelSelection('v1', { operation: 'longVideo2video', sourceModel: 'star-video2.5' }), search('v1')])).toBe(true);
    expect(nodeIsHostlessSeedanceVideoEdit([modelSelection('v1', { operation: 'video2video', sourceModel: 'star-video2' })])).toBe(true);
    expect(nodeIsHostlessSeedanceVideoEdit([modelSelection('v1', { operation: 'video2video', sourceModel: 'wanx2.7-video' })])).toBe(true);
    // 帧操作（singleImage2video / frames2video / mixed2video）是已承接路径，不能被吞掉
    expect(nodeIsHostlessSeedanceVideoEdit([modelSelection('v1', { operation: 'singleImage2video', sourceModel: 'star-video2.5' })])).toBe(false);
    expect(nodeIsHostlessSeedanceVideoEdit([modelSelection('v1', { operation: 'mixed2video', sourceModel: 'star-video2.5' })])).toBe(false);
    // 非 Seedance 系的编辑操作交给 F10 或更早的族
    expect(nodeIsHostlessSeedanceVideoEdit([modelSelection('v1', { operation: 'videoEdit2video', sourceModel: 'kling-v3-omni' })])).toBe(false);
    // 节点上还有节点/供应商/引用类硬阻塞时不命中
    expect(nodeIsHostlessSeedanceVideoEdit([modelSelection('v1', { operation: 'videoEdit2video', sourceModel: 'star-video2.5' }), invalidRef('v1', 'x')])).toBe(false);
    expect(nodeIsHostlessSeedanceVideoEdit([modelSelection('v1', { operation: 'videoEdit2video', sourceModel: 'star-video2.5' }), other('v1', 'unsupported-node')])).toBe(false);
    expect(nodeIsHostlessSeedanceVideoEdit([])).toBe(false);
});

test('首尾帧合同族只认 happy-horse-1 / 1.1 与 kling-video-o1 的视频编辑操作', () => {
    expect(nodeIsHostlessFrameOnlyKlingEdit([modelSelection('v1', { operation: 'videoEdit2video', sourceModel: 'happy-horse-1.1' })])).toBe(true);
    expect(nodeIsHostlessFrameOnlyKlingEdit([modelSelection('v1', { operation: 'videoEdit2video', sourceModel: 'happy-horse-1' })])).toBe(true);
    expect(nodeIsHostlessFrameOnlyKlingEdit([modelSelection('v1', { operation: 'videoEdit2video', sourceModel: 'kling-video-o1' }), quality('v1')])).toBe(true);
    // 首尾帧（frames2video）是已承接路径
    expect(nodeIsHostlessFrameOnlyKlingEdit([modelSelection('v1', { operation: 'frames2video', sourceModel: 'happy-horse-1.1' })])).toBe(false);
    // kling-v3-omni 的视频编辑有自己的落点判定，不在本族
    expect(nodeIsHostlessFrameOnlyKlingEdit([modelSelection('v1', { operation: 'videoEdit2video', sourceModel: 'kling-v3-omni' })])).toBe(false);
    expect(nodeIsHostlessFrameOnlyKlingEdit([modelSelection('v1', { operation: 'videoEdit2video', sourceModel: 'happy-horse-1.1' }), other('v1', 'unsupported-operation')])).toBe(false);
    expect(nodeIsHostlessFrameOnlyKlingEdit([])).toBe(false);
});

test('快照引用断裂族只认 invalid-reference 的源数据消息', () => {
    expect(nodeIsHostlessBrokenReference([invalidRef('n1', '参考素材缺失、类型或版本不一致')])).toBe(true);
    expect(nodeIsHostlessBrokenReference([invalidRef('n1', '参考素材缺少节点ID或地址')])).toBe(true);
    expect(nodeIsHostlessBrokenReference([invalidRef('n1', '提示词引用不存在：Mixed 9')])).toBe(true);
    expect(nodeIsHostlessBrokenReference([invalidRef('n1', '参考节点重复，不能合并原槽位')])).toBe(true);
    expect(nodeIsHostlessBrokenReference([invalidRef('n1', '参考素材缺失、类型或版本不一致'), invalidRef('n1', '提示词引用不存在：Image 1')])).toBe(true);
    // 别的 invalid-reference 消息或混入其它硬阻塞时不命中
    expect(nodeIsHostlessBrokenReference([invalidRef('n1', '参考素材时长无效')])).toBe(false);
    expect(nodeIsHostlessBrokenReference([invalidRef('n1', '提示词引用不存在：Image 1'), other('n1', 'model-selection-required')])).toBe(false);
    expect(nodeIsHostlessBrokenReference([])).toBe(false);
});

const invalidPortrait = (nodeId: string, detail: string) => ({ code: 'invalid-portrait-options', detail, nodeId });
const invalidText = (nodeId: string, detail: string) => ({ code: 'invalid-text-input', detail, nodeId });

test('人物质感族只认源工程未保存质感参数的 invalid-portrait-options', () => {
    expect(nodeIsHostlessPortraitTexture([invalidPortrait('i1', '人物质感参数未保存或无法映射：skin')])).toBe(true);
    expect(nodeIsHostlessPortraitTexture([
        invalidPortrait('i1', '人物质感参数未保存或无法映射：personSceneFusion'),
        invalidPortrait('i1', '人物质感参数未保存或无法映射：sharpness'),
    ])).toBe(true);
    // 别的 invalid-portrait-options 消息或混入其它硬阻塞时不命中
    expect(nodeIsHostlessPortraitTexture([invalidPortrait('i1', '人物质感参数超出该模型范围')])).toBe(false);
    expect(nodeIsHostlessPortraitTexture([invalidPortrait('i1', '人物质感参数未保存或无法映射：skin'), other('i1', 'model-selection-required')])).toBe(false);
    expect(nodeIsHostlessPortraitTexture([])).toBe(false);
});

test('文字来源断裂族只认源工程槽位正文缺失的 invalid-text-input', () => {
    expect(nodeIsHostlessBrokenTextReference([invalidText('n1', '文字来源、类型或正文不一致')])).toBe(true);
    expect(nodeIsHostlessBrokenTextReference([invalidText('n1', '文字输入列表格式无效')])).toBe(true);
    expect(nodeIsHostlessBrokenTextReference([
        invalidText('n1', '文字来源、类型或正文不一致'),
        invalidText('n1', '文字输入列表格式无效'),
    ])).toBe(true);
    // 别的 invalid-text-input 消息或混入其它硬阻塞时不命中
    expect(nodeIsHostlessBrokenTextReference([invalidText('n1', '文字内容超过模型上限')])).toBe(false);
    expect(nodeIsHostlessBrokenTextReference([invalidText('n1', '文字来源、类型或正文不一致'), other('n1', 'unmapped-production-parameters')])).toBe(false);
    expect(nodeIsHostlessBrokenTextReference([])).toBe(false);
});

const storyboardAsset = (nodeId: string, detail: string) => ({ code: 'storyboard-asset-unmapped', detail, nodeId });
const storyboardOutput = (nodeId: string, detail: string) => ({ code: 'storyboard-output-unmapped', detail, nodeId });
const storyboardField = (nodeId: string, detail: string) => ({ code: 'storyboard-field-unmapped', detail, nodeId });

test('分镜资产/输出断裂族要求资产或输出上报，且硬阻塞不出这四类', () => {
    expect(nodeIsHostlessBrokenStoryboard([storyboardAsset('b1', '镜头 1: image: 资产 scene-13 缺少关联图片节点，不能使用封面代替')])).toBe(true);
    expect(nodeIsHostlessBrokenStoryboard([storyboardAsset('b1', '镜头 2: video: 资产 scene-14 不在原资产表中')])).toBe(true);
    expect(nodeIsHostlessBrokenStoryboard([storyboardOutput('b1', '分镜输出无法唯一关联：cf42b702-56d0-4749-897c-f17ff32513cd')])).toBe(true);
    // 同节点混排扩展字段与 scenePayload 不影响判定
    expect(nodeIsHostlessBrokenStoryboard([
        storyboardAsset('b1', '镜头 1: image: 资产 prop-1 不在原资产表中'),
        storyboardField('b1', 'rows[0].dialogueLines: 分镜扩展字段尚未映射'),
        unmapped('b1', 'scenePayload'),
    ])).toBe(true);
    // 只有字段族（dialogueLines/voiceover）或只有 scenePayload 时不命中
    expect(nodeIsHostlessBrokenStoryboard([storyboardField('b1', 'rows[0].voiceover: 分镜扩展字段尚未映射')])).toBe(false);
    expect(nodeIsHostlessBrokenStoryboard([unmapped('b1', 'scenePayload')])).toBe(false);
    // 混入其它硬阻塞时不命中
    expect(nodeIsHostlessBrokenStoryboard([storyboardAsset('b1', '镜头 1: image: 资产 scene-1 不在原资产表中'), other('b1', 'model-selection-required')])).toBe(false);
    expect(nodeIsHostlessBrokenStoryboard([])).toBe(false);
});

const hailuoReport = (nodeId: string, model: string, resolution: string) => ({ code: 'model-selection-required', nodeId, detail: JSON.stringify({kind: 'video', operation: 'singleImage2video', sourceModel: model, resolution, duration: 6, count: 1, references: {image: 1, video: 0, audio: 0}, promptChars: 40}) });

test('Hailuo 2.3/o2 族只认 768P 以外档位或 cameraMovement 无落点', () => {
    expect(nodeIsHostlessHailuoModern([hailuoReport('v1', 'MiniMax-Hailuo-2.3', '1080P')])).toBe(true);
    expect(nodeIsHostlessHailuoModern([hailuoReport('v1', 'MiniMax-Hailuo-o2', '512P')])).toBe(true);
    expect(nodeIsHostlessHailuoModern([
        hailuoReport('v1', 'MiniMax-Hailuo-2.3', '768P'),
        other('v1', 'advanced-operation'),
        unmapped('v1', 'cameraMovement'),
    ])).toBe(true);
    // 768P 且无运镜字段时可承接，不命中
    expect(nodeIsHostlessHailuoModern([hailuoReport('v1', 'MiniMax-Hailuo-2.3', '768P')])).toBe(false);
    // H3 系不是本族（其规格是 768P/2K，另有更早的族处理）
    expect(nodeIsHostlessHailuoModern([hailuoReport('v1', 'MiniMax-Hailuo-H3', '1080P')])).toBe(false);
    // 混入其它硬阻塞（如源视频质量档）时不命中
    expect(nodeIsHostlessHailuoModern([hailuoReport('v1', 'MiniMax-Hailuo-2.3', '1080P'), other('v1', 'video-quality-adapter-required')])).toBe(false);
    expect(nodeIsHostlessHailuoModern([])).toBe(false);
});

// 源数据里 advanced-operation 的 detail 与 unmapped-production-parameters 相同（同一个键名），
// 所以断言必须用真实形状；detail 不同的 advanced-operation 会让键集越界而不命中。
const advanced = (nodeId: string, detail: string) => ({ code: 'advanced-operation', detail, nodeId });
const modelReport = (nodeId: string, detail: object) => ({ code: 'model-selection-required', nodeId, detail: JSON.stringify(detail) });

test('万相智能扩写族只认 extendPrompt 单一未映射键', () => {
    // 7a38b7d6 / 79b038bd：节点同时带 model-selection-required
    expect(nodeIsHostlessWanxExtendPrompt([
        unmapped('v1', 'extendPrompt'),
        advanced('v1', 'extendPrompt'),
        modelReport('v1', {kind: 'video', operation: 'mixed2video', sourceModel: 'wanx3.0-prime', resolution: '1080P'}),
    ])).toBe(true);
    // c5c8e705 / 66c714e7：只有 advanced-operation + unmapped
    expect(nodeIsHostlessWanxExtendPrompt([unmapped('v1', 'extendPrompt'), advanced('v1', 'extendPrompt')])).toBe(true);
    // 键集越界或压根没有 extendPrompt 时不命中
    expect(nodeIsHostlessWanxExtendPrompt([unmapped('v1', 'extendPrompt,multiClip'), advanced('v1', 'extendPrompt,multiClip')])).toBe(false);
    expect(nodeIsHostlessWanxExtendPrompt([unmapped('v1', 'multiClip'), advanced('v1', 'multiClip')])).toBe(false);
    // 混入其它硬阻塞时不命中
    expect(nodeIsHostlessWanxExtendPrompt([unmapped('v1', 'extendPrompt'), advanced('v1', 'extendPrompt'), other('v1', 'video-quality-adapter-required')])).toBe(false);
    expect(nodeIsHostlessWanxExtendPrompt([])).toBe(false);
});

const motionReport = (nodeId: string, model = 'kling-v3-motion-control', quality = 'high') => ({ code: 'model-selection-required', nodeId, detail: JSON.stringify({kind: 'video', operation: 'mixed2video', sourceModel: model, quality, count: 1, references: {image: 1, video: 1, audio: 0}}) });

test('可灵动作控制族要求两键同时出现且源模型是 kling-v3-motion-control', () => {
    expect(nodeIsHostlessKlingMotionControl([
        motionReport('v1'),
        advanced('v1', 'characterOrientation,keepOriginalSound'),
        unmapped('v1', 'characterOrientation,keepOriginalSound'),
        other('v1', 'video-quality-adapter-required'),
    ])).toBe(true);
    // 只出现一个键、或键集越界时不命中
    expect(nodeIsHostlessKlingMotionControl([motionReport('v1'), unmapped('v1', 'characterOrientation'), other('v1')])).toBe(false);
    expect(nodeIsHostlessKlingMotionControl([
        motionReport('v1'),
        unmapped('v1', 'characterOrientation,keepOriginalSound'),
        unmapped('v1', 'multi_prompt'),
        other('v1'),
    ])).toBe(false);
    // 其它可灵模型不落进本族
    expect(nodeIsHostlessKlingMotionControl([motionReport('v1', 'kling-v3-omni'), unmapped('v1', 'characterOrientation,keepOriginalSound'), other('v1')])).toBe(false);
    expect(nodeIsHostlessKlingMotionControl([])).toBe(false);
});

test('分镜对白/旁白族只认 dialogueLines 与 voiceover', () => {
    expect(nodeIsHostlessStoryboardSpeech([
        storyboardField('b1', 'rows[0].dialogueLines: 分镜扩展字段尚未映射'),
        storyboardField('b1', 'rows[0].voiceover: 分镜扩展字段尚未映射'),
    ])).toBe(true);
    // 427247fd 的形状：同节点混排 scenePayload
    expect(nodeIsHostlessStoryboardSpeech([
        storyboardField('b1', 'rows[3].dialogueLines: 分镜扩展字段尚未映射'),
        unmapped('b1', 'scenePayload'),
    ])).toBe(true);
    // 其它分镜扩展字段不落进本族
    expect(nodeIsHostlessStoryboardSpeech([storyboardField('b1', 'rows[0].cameraAngle: 分镜扩展字段尚未映射')])).toBe(false);
    // 资产/输出断裂由 F14 负责，本族不吞
    expect(nodeIsHostlessStoryboardSpeech([
        storyboardField('b1', 'rows[0].voiceover: 分镜扩展字段尚未映射'),
        storyboardAsset('b1', '镜头 1: image: 资产 scene-1 不在原资产表中'),
    ])).toBe(false);
    expect(nodeIsHostlessStoryboardSpeech([])).toBe(false);
});

test('组图无落点族只认 sequential 单一未映射键', () => {
    // 已承接的子集（2K + count=1）在适配层就不再上报 sequential，所以这里命中的都是留下来的节点
    expect(nodeIsHostlessArkSequential([unmapped('i1', 'sequential'), advanced('i1', 'sequential')])).toBe(true);
    expect(nodeIsHostlessArkSequential([unmapped('i1', 'sequential')])).toBe(true);
    // 键集越界或压根不是 sequential 时不命中
    expect(nodeIsHostlessArkSequential([unmapped('i1', 'sequential,count'), advanced('i1', 'sequential,count')])).toBe(false);
    expect(nodeIsHostlessArkSequential([unmapped('i1', 'style')])).toBe(false);
    // 混入其它硬阻塞（如 channel-configuration-required 之外的 video-quality）时不命中
    expect(nodeIsHostlessArkSequential([unmapped('i1', 'sequential'), advanced('i1', 'sequential'), other('i1', 'video-quality-adapter-required')])).toBe(false);
    expect(nodeIsHostlessArkSequential([])).toBe(false);
});

test('vocal-v3 稳定性族只认 stability 单一未映射键', () => {
    expect(nodeIsHostlessVocalStability([unmapped('a1', 'stability'), advanced('a1', 'stability')])).toBe(true);
    expect(nodeIsHostlessVocalStability([unmapped('a1', 'stability')])).toBe(true);
    // 键集越界或不是 stability 时不命中
    expect(nodeIsHostlessVocalStability([unmapped('a1', 'stability,voice_id'), advanced('a1', 'stability,voice_id')])).toBe(false);
    expect(nodeIsHostlessVocalStability([unmapped('a1', 'voice_id')])).toBe(false);
    // 混入其它硬阻塞时不命中
    expect(nodeIsHostlessVocalStability([unmapped('a1', 'stability'), advanced('a1', 'stability'), other('a1', 'audio-adapter-required')])).toBe(false);
    expect(nodeIsHostlessVocalStability([])).toBe(false);
});

test('语音音高族只要出现 pitch 键就命中，且允许音频类的伴随上报', () => {
    expect(nodeIsHostlessSpeechPitch([
        unmapped('a1', 'scene,language,sample_rate,format,voice_setting_speed,voice_setting_pitch,voice_setting_vol'),
        advanced('a1', 'voice_setting_speed,voice_setting_pitch,voice_setting_vol'),
        other('a1', 'audio-adapter-required'),
        other('a1', 'model-selection-required'),
    ])).toBe(true);
    expect(nodeIsHostlessSpeechPitch([
        unmapped('a1', 'voice_modify_pitch'),
        other('a1', 'audio-adapter-required'),
    ])).toBe(true);
    // 只有速度/音量（中性还原）时不命中
    expect(nodeIsHostlessSpeechPitch([unmapped('a1', 'voice_setting_speed,voice_setting_vol'), advanced('a1', 'voice_setting_speed,voice_setting_vol')])).toBe(false);
    expect(nodeIsHostlessSpeechPitch([unmapped('a1', 'scene,language')])).toBe(false);
    // 混入其它硬阻塞（如 source-repair 类）时不命中
    expect(nodeIsHostlessSpeechPitch([unmapped('a1', 'voice_setting_pitch'), other('a1', 'unbound-input')])).toBe(false);
    expect(nodeIsHostlessSpeechPitch([])).toBe(false);
});

test('kling-v3-omni 参考视频族要求同节点声明 kling-v3-omni 且带视频参考', () => {
    expect(nodeIsHostlessOmniReferenceVideo([report('v1', 'kling-v3-omni', 'mixed2video', { image: 1, video: 1 }), other('v1', 'video-quality-adapter-required')])).toBe(true);
    expect(nodeIsHostlessOmniReferenceVideo([report('v1', 'kling-v3-omni', 'mixed2video', { image: 3, video: 1 })])).toBe(true);
    // 没有视频参考时不命中（那种节点在适配层已能映射）
    expect(nodeIsHostlessOmniReferenceVideo([report('v1', 'kling-v3-omni', 'mixed2video', { image: 1, video: 0 })])).toBe(false);
    expect(nodeIsHostlessOmniReferenceVideo([report('v1', 'kling-video-o3', 'mixed2video', { image: 1, video: 1 })])).toBe(false);
    expect(nodeIsHostlessOmniReferenceVideo([other('v1', 'unsupported-node')])).toBe(false);
    expect(nodeIsHostlessOmniReferenceVideo([])).toBe(false);
});

test('kling-v3-omni 视频编辑族只认该模型的 videoEdit2video', () => {
    expect(nodeIsHostlessOmniVideoEdit([report('v1', 'kling-v3-omni', 'videoEdit2video', { image: 1, video: 1 }), unmapped('v1', 'pictureEditLock'), advanced('v1', 'pictureEditLock')])).toBe(true);
    expect(nodeIsHostlessOmniVideoEdit([report('v1', 'kling-v3-omni', 'video2video', { video: 1 })])).toBe(true);
    // 普通生成操作不命中
    expect(nodeIsHostlessOmniVideoEdit([report('v1', 'kling-v3-omni', 'mixed2video', { image: 1, video: 1 })])).toBe(false);
    expect(nodeIsHostlessOmniVideoEdit([report('v1', 'star-video2.5', 'videoEdit2video', { video: 1 })])).toBe(false);
    expect(nodeIsHostlessOmniVideoEdit([])).toBe(false);
});

test('kling-video-o3 残留 image2video 族只在多图超过首尾帧上限时命中', () => {
    expect(nodeIsHostlessO3StaleImage2Video([report('v1', 'kling-video-o3', 'image2video', { image: 3 })])).toBe(true);
    expect(nodeIsHostlessO3StaleImage2Video([report('v1', 'kling-video-o3', 'image2video', { image: 4 }), other('v1', 'video-quality-adapter-required')])).toBe(true);
    // 1~2 张图仍可由 frames2video 承接，不命中
    expect(nodeIsHostlessO3StaleImage2Video([report('v1', 'kling-video-o3', 'image2video', { image: 2 })])).toBe(false);
    expect(nodeIsHostlessO3StaleImage2Video([report('v1', 'kling-video-o3', 'frames2video', { image: 2 })])).toBe(false);
    expect(nodeIsHostlessO3StaleImage2Video([report('v1', 'kling-v3-omni', 'image2video', { image: 3 })])).toBe(false);
    expect(nodeIsHostlessO3StaleImage2Video([])).toBe(false);
});

test('happy-horse 多图参考族只认 image2video', () => {
    expect(nodeIsHostlessHappyHorseImage2Video([report('v1', 'happy-horse-1', 'image2video', { image: 1 })])).toBe(true);
    expect(nodeIsHostlessHappyHorseImage2Video([report('v1', 'happy-horse-1.1', 'image2video', { image: 1 })])).toBe(true);
    // frames2video 是适配层已承接的操作，不命中
    expect(nodeIsHostlessHappyHorseImage2Video([report('v1', 'happy-horse-1', 'frames2video', { image: 1 })])).toBe(false);
    expect(nodeIsHostlessHappyHorseImage2Video([report('v1', 'kling-video-o3', 'image2video', { image: 1 })])).toBe(false);
    expect(nodeIsHostlessHappyHorseImage2Video([])).toBe(false);
});

test('viduq 图生族只认 viduq2-pro / viduq3-pro 且带图片输入', () => {
    expect(nodeIsHostlessViduImage2Video([report('v1', 'viduq2-pro', 'mixed2video', { image: 2 })])).toBe(true);
    expect(nodeIsHostlessViduImage2Video([report('v1', 'viduq3-pro', 'singleImage2video', { image: 1 }), advanced('v1', 'style')])).toBe(true);
    // 文生（无图）不命中
    expect(nodeIsHostlessViduImage2Video([report('v1', 'viduq3-pro', 'singleImage2video', { image: 0 })])).toBe(false);
    expect(nodeIsHostlessViduImage2Video([report('v1', 'wanxiang-v2-6', 'frames2video', { image: 1 })])).toBe(false);
    expect(nodeIsHostlessViduImage2Video([])).toBe(false);
});

test('pixverse 风格族要求 pixverse-v5 且键里出现 style 或 soundEffect', () => {
    expect(nodeIsHostlessPixverseStyle([report('v1', 'pixverse-v5', 'singleImage2video', { image: 1 }), unmapped('v1', 'style,soundEffect'), advanced('v1', 'style,soundEffect')])).toBe(true);
    expect(nodeIsHostlessPixverseStyle([report('v1', 'pixverse-v5', 'singleImage2video', { image: 1 }), unmapped('v1', 'style')])).toBe(true);
    // 其它模型或其它键不命中
    expect(nodeIsHostlessPixverseStyle([report('v1', 'viduq3-pro', 'singleImage2video', { image: 1 }), unmapped('v1', 'style')])).toBe(false);
    expect(nodeIsHostlessPixverseStyle([report('v1', 'pixverse-v5', 'singleImage2video', { image: 1 }), unmapped('v1', 'template')])).toBe(false);
    expect(nodeIsHostlessPixverseStyle([])).toBe(false);
});

test('wanxiang multiClip 族只认 wanxiang-v2-6 的 multiClip', () => {
    expect(nodeIsHostlessWanxMultiClip([report('v1', 'wanxiang-v2-6', 'frames2video', { image: 1 }), unmapped('v1', 'multiClip'), advanced('v1', 'multiClip')])).toBe(true);
    expect(nodeIsHostlessWanxMultiClip([report('v1', 'kling-video-o3', 'frames2video', { image: 1 }), unmapped('v1', 'multiClip')])).toBe(false);
    expect(nodeIsHostlessWanxMultiClip([report('v1', 'wanxiang-v2-6', 'frames2video', { image: 1 }), unmapped('v1', 'template')])).toBe(false);
    expect(nodeIsHostlessWanxMultiClip([])).toBe(false);
});

test('seed-audio TTS 族要求 audio-adapter-required 明确报出 Text-to-Speech / text2image', () => {
    const tts = (nodeId: string) => ({ code: 'audio-adapter-required', detail: JSON.stringify({ scene: 'Text-to-Speech', operation: 'text2image', sourceModel: 'seed-audio-1.0' }), nodeId });
    expect(nodeIsHostlessSeedAudioTts([tts('a1'), unmapped('a1', 'scene,language,voice_setting_speed'), advanced('a1', 'voice_setting_speed'), other('a1', 'model-selection-required')])).toBe(true);
    // 普通 text2audio 配音不命中
    expect(nodeIsHostlessSeedAudioTts([{ code: 'audio-adapter-required', detail: JSON.stringify({ scene: 'Text-to-Speech', operation: 'text2audio', sourceModel: 'seed-audio-1.0' }), nodeId: 'a1' }])).toBe(false);
    // 没有音频上报或混入其它硬阻塞时不命中
    expect(nodeIsHostlessSeedAudioTts([unmapped('a1', 'scene,language')])).toBe(false);
    expect(nodeIsHostlessSeedAudioTts([tts('a1'), other('a1', 'unbound-input')])).toBe(false);
    expect(nodeIsHostlessSeedAudioTts([])).toBe(false);
});

test('mureka 参考素材族只认 mureka 系带参考素材', () => {
    expect(nodeIsHostlessMurekaReference([report('a1', 'mureka-8', 'text2audio', { video: 1 })])).toBe(true);
    expect(nodeIsHostlessMurekaReference([report('a1', 'mureka-9', 'text2audio', { audio: 1 })])).toBe(true);
    // 无参考素材的纯文生音乐不命中（适配层已能映射）
    expect(nodeIsHostlessMurekaReference([report('a1', 'mureka-8', 'text2audio', {})])).toBe(false);
    expect(nodeIsHostlessMurekaReference([report('a1', 'vocal-music', 'text2audio', { video: 1 })])).toBe(false);
    expect(nodeIsHostlessMurekaReference([])).toBe(false);
});

test('未保存请求身份族只认 model / operation / prompt 全空的生成节点', () => {
    expect(nodeIsHostlessUnsavedRequest([modelReport('v1', { operation: '', sourceModel: '', promptChars: 0 })])).toBe(true);
    expect(nodeIsHostlessUnsavedRequest([modelReport('v1', { operation: '', sourceModel: '', promptChars: 0, references: { image: 1 } })])).toBe(true);
    // 有模型或操作时不命中
    expect(nodeIsHostlessUnsavedRequest([modelReport('v1', { operation: '', sourceModel: 'kling-video-o3', promptChars: 0 })])).toBe(false);
    expect(nodeIsHostlessUnsavedRequest([modelReport('v1', { operation: 'text2video', sourceModel: '', promptChars: 0 })])).toBe(false);
    // 空提示词但有模型身份属于缺用户输入，不命中
    expect(nodeIsHostlessUnsavedRequest([modelReport('v1', { operation: 'text2video', sourceModel: 'star-video2.5', promptChars: 0 })])).toBe(false);
    expect(nodeIsHostlessUnsavedRequest([other('v1', 'empty-prompt')])).toBe(false);
    expect(nodeIsHostlessUnsavedRequest([])).toBe(false);
});
