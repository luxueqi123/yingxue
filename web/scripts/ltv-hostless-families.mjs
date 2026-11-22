// 舍弃判定里"节点级"三族规则的唯一实现，供发布脚本与回归测试共用。
// 只依赖 issue.code 与 detail 里逗号分隔的字段名，不读快照。

export const detailKeys = detail => String(detail || '').split(',').map(key => key.trim()).filter(Boolean);

/** 收集一个节点上所有 unmapped-production-parameters 上报的字段名；出现其它 hard code 就返回 null。 */
const unmappedKeysOnly = issues => {
  if (!issues.length) return null;
  const keys = new Set();
  for (const issue of issues) {
    if (issue.code !== 'unmapped-production-parameters') return null;
    for (const key of detailKeys(issue.detail)) keys.add(key);
  }
  return keys.size ? keys : null;
};

// F1 LTV 私有图像编辑：键里必须同时出现 scene 与 originImage，且其余键都属于私有编辑字段。
// 实测这条签名命中的 45 份案例正好等于 scene ∈ {erase,redraw,light-control,camera_focus}
// 的案例全集（136 个节点；nebulha/aurora/lib-image 模型门限对本签名无增量），
// 在 326 份已发布案例上命中 0 行。
export const LTV_PRIVATE_EDITOR_KEYS = new Set(['originImage', 'scene', 'mark', 'focusRegion', 'width', 'height', 'infiniteSwitch', 'UI_KeyLight', 'UI_RimLight', 'UI_LightColor', 'UI_LightBrightness', 'Reference_Image_Intent']);
export const nodeIsHostlessLtvPrivateEditor = issues => {
  const keys = unmappedKeysOnly(issues);
  if (!keys || !keys.has('scene') || !keys.has('originImage')) return false;
  return [...keys].every(key => LTV_PRIVATE_EDITOR_KEYS.has(key));
};

// F2 可灵自定义分镜：唯一未映射字段就是 multi_prompt。映雪 kling-omni-video 合同三处明文拒绝
// （manifest.json:496、generate-catalog.mjs:716、kling_omni_contract_test.go:102）。
export const nodeIsHostlessMultiPrompt = issues => {
  const keys = unmappedKeysOnly(issues);
  return Boolean(keys && keys.size === 1 && keys.has('multi_prompt'));
};

// F3 topaz 视频 scale：scale 属于源 topaz-image-upscaler，视频 schema 是 resolution/specifiedModel/fps/slowmo。
export const nodeIsHostlessTopazScale = issues => {
  const keys = unmappedKeysOnly(issues);
  return Boolean(keys && keys.size === 1 && keys.has('scale'));
};

// F4 LTV 扩图（expand-image）：与 F1 同一个私有编辑器，只是该场景的键被适配层单独回报成
// `unsupported-operation: image_edit:expand-image`，所以按上报形状单独识别。
// 实测 2026-09-18（.local/cache/case-chain-audit 全量 1024 份快照）：
//  - 67 个 expand-image 节点，全部 `_retryMeta.model = nebula-ultra`（provider nebula），
//    宿主 22 个登记模型里没有一个 nebula，所有插件清单与内置协议同样没有该供应商；
//  - 参数是私有几何：`originImage`（已按 _outpaintPads 把原图压进扩图画布）、`_outpaintPads`
//    {left,top,right,bottom,srcW,srcH}、`infiniteSwitch`、`width`/`height` 或 `aspect_ratio`；
//    这四个名字在宿主全树（web/src、web/test、backend、plugin-packages、plugins、docs）里
//    除适配层自身外 0 命中；
//  - 67 个节点的 prompt 全部为空或缺失（40 个空串、27 个没有该字段），而宿主扩图弹窗的提交入口明文要求非空提示词
//    （canvas-node-mask-edit-dialog.tsx submit: `if (!nextPrompt) return setError("请输入修改要求")`），
//    承接就必须替作者编造一段扩图提示词；
//  - originImage 实测就是扩图画布本身（05274d25 全 5 个节点 originImage 尺寸 == params.width×height，
//    例如 913×510），底图只在画布中央；35/67 个节点连 imageList 源图引用都没保存。
// 宿主侧唯一对应的能力是蒙版弹窗里的交互式扩图（要用户重画区域、重填提示词、重选模型），
// `use-canvas-generation-retry` 还明文拒绝扩图节点的通用重试。承接等同重建该编辑器与其渠道。
export const nodeIsHostlessLtvOutpaint = issues => {
  if (!issues.length) return false;
  return issues.every(issue => issue.code === 'unsupported-operation'
    && String(issue.detail || '').startsWith('image_edit:expand-image'));
};

/** 节点上允许出现的上报形状：都是"源参数/源操作在宿主没有落点"，不含节点、供应商、引用类硬阻塞。 */
const SOURCE_OPERATION_CODES = new Set(['model-selection-required', 'search-option-unmapped', 'video-quality-adapter-required', 'unmapped-production-parameters', 'advanced-operation']);

/**
 * 收集一个节点上 model-selection-required 里声明的源操作与源模型；出现其它硬阻塞或不认识的上报就返回 null。
 * 只读上报里的 operation / sourceModel 两个字段，不读快照。
 */
const sourceReportsOnly = issues => {
  if (!issues.length) return null;
  const reports = [];
  for (const issue of issues) {
    if (!SOURCE_OPERATION_CODES.has(issue.code)) return null;
    if (issue.code !== 'model-selection-required') continue;
    const detail = String(issue.detail || '');
    if (!detail.startsWith('{')) return null;
    let parsed;
    try { parsed = JSON.parse(detail); } catch { return null; }
    if (!parsed || typeof parsed !== 'object') return null;
    reports.push(parsed);
  }
  return reports.length ? reports : null;
};

const sourceOperationsOnly = issues => {
  const reports = sourceReportsOnly(issues);
  if (!reports) return null;
  const operations = new Set();
  const models = new Set();
  for (const parsed of reports) {
    if (typeof parsed.sourceModel === 'string') models.add(parsed.sourceModel);
    if (typeof parsed.operation === 'string') operations.add(parsed.operation);
  }
  if (!operations.size || !models.size) return null;
  return { operations, models };
};

/** 源视频编辑操作：videoEdit2video / video2video / longVideo2video。 */
const VIDEO_EDIT_OPERATIONS = new Set(['videoEdit2video', 'video2video', 'longVideo2video']);

/**
 * F9 源平台视频编辑/长视频操作（Seedance 系别名：star-video2、star-video2.5、star-video2-fast、wanx2.7-video）。
 * 实测 2026-09-18：源 schema 里 star-video2.5 的 `videoEdit2video:[1,1]`、`videoEdit2videoConfig:{videoMax:1,imageMaxWithVideo:30}`，
 * star-video2 的 `video2video`、wanx2.7-video 的 `video2video`，都是"拿一段已生成视频当底片再改"的编辑操作；
 * 宿主侧这一族唯一落点是 `volcengine-ark-video`（doubao-seedance-2-*) 的 contents/generations/tasks 合同，
 * 它的 body 只有 content(model/prompt/image_url/video_url/audio_url/ratio/resolution/duration/generate_audio/seed/tools)，
 * 既没有编辑操作的 opcode，也没有长视频分支；ark-video-search.ts 的 modes map 只映射
 * text2video/singleImage2video/frames2video/image2video/mixed2video，videoEdit2video 一族全部落空。
 * 其余三族的落点也不成立：kling-v3-video 的 create.body 只有 image/image_tail（首尾帧，manifest:815 明文
 * "普通3.0只支持首尾帧输入，此入口不承接多图参考或视频编辑"）；kling-omni-video 的 validations 要求
 * `request.model === "kling-v3-omni"`；源 schema 里 star-video2 根本没有 videoEdit2video（它的
 * 95684171 却存了 video2video），属于源数据同族问题。承接等于新建该编辑接口。
 */
export const nodeIsHostlessSeedanceVideoEdit = issues => {
  const parsed = sourceOperationsOnly(issues);
  if (!parsed) return false;
  if (![...parsed.operations].some(operation => VIDEO_EDIT_OPERATIONS.has(operation))) return false;
  return [...parsed.models].every(model => /^star-video2(\.5|-fast)?$/.test(model) || model === 'wanx2.7-video');
};

/**
 * F10 普通 3.0 系（happy-horse-1 / 1.1 / kling-video-o1）的源视频编辑操作。
 * 实测 2026-09-18：happy-horse-1.1 的源 schema 是 `frames2video:[1,1]`、`videoEdit2video:[1,5]`、
 * `image2video:[1,9]`，kling-video-o1 同样是 `videoEdit2video`；适配层已把这两个模型的
 * frames2video 送到 `kling-v3-video`，而该合同 manifest:815 明文只收首尾帧、不收视频编辑；
 * 宿主能收视频编辑的是 `kling-omni-video`，但它的 validations 要求 `request.model === "kling-v3-omni"`，
 * 这两个别名模型不满足。承接等于给该合同再加一个模型入口。
 */
export const nodeIsHostlessFrameOnlyKlingEdit = issues => {
  const parsed = sourceOperationsOnly(issues);
  if (!parsed) return false;
  if (![...parsed.operations].some(operation => VIDEO_EDIT_OPERATIONS.has(operation))) return false;
  return [...parsed.models].every(model => ['happy-horse-1', 'happy-horse-1.1', 'kling-video-o1'].includes(model));
};

/**
 * F7 快照引用断裂：源工程保存的参考槽位指向归档快照里不存在的节点或不可恢复的素材地址。
 * 适配层 ltv-reference-plan.ts:44-49 与 ltv-native-project.ts 的三条上报形状：
 *  - "参考素材缺少节点ID或地址"：槽位条目连 nodeId/url 都没保存；
 *  - "参考素材缺失、类型或版本不一致"：nodeId 不是工程里的节点（例如 `asset://asset-2026...` 云端素材 ID），
 *    或保存的 url 不在该节点已归档的素材地址里；
 *  - "提示词引用不存在：Image/Mixed N"：提示词里的 `{{Type N}}` 序号超过了已保存的槽位数量（槽位为空）；
 *  - "参考节点重复，不能合并原槽位"：两个槽位绑同一个节点，合并会改动作者的槽位顺序。
 * 这些缺口都在源工程数据里：归档快照已经没有对应节点或原图地址，本地无法凭空恢复。
 * 2026-09-18 复算：96 条待适配里 25 条含该上报，其中 19 条已因别的族舍弃；本规则按节点级
 * （整节点硬阻塞恰好只有 invalid-reference）追加，实测已发布 333 份命中 0。
 */
const BROKEN_REFERENCE_PREFIXES = [
  '参考素材缺少节点ID或地址',
  '参考素材缺失、类型或版本不一致',
  '提示词引用不存在：',
  '参考节点重复，不能合并原槽位',
  '参考素材列表不是数组',
];
export const nodeIsHostlessBrokenReference = issues => {
  if (!issues.length) return false;
  if (!issues.every(issue => issue.code === 'invalid-reference')) return false;
  return issues.every(issue => BROKEN_REFERENCE_PREFIXES.some(prefix => String(issue.detail || '').startsWith(prefix)));
};

/**
 * F12 人物质感参数缺失：源工程保存的 portraitOptions 里没有该场景要求的键。
 * 适配层 ltv-native-project.ts 按 PORTRAIT_TEXTURE_GROUPS 逐组读
 * subject_scene_fusion / lighting_fusion / skin_texture / surface_texture / sharpness，
 * 缺一组就报 `invalid-portrait-options`。2026-09-18 逐例核对归档快照：
 *  - 8436e8e7 节点 i-F51toUxxaU 的 portraitOptions 为 null；
 *  - e5ccc2df8 两个节点只有 skin_texture（或缺 sharpness）；
 *  - dbac0c58f 三个节点 portraitOptions 为 null（同案例另有节点是完整的）。
 * 缺口在源工程数据本身：源平台没有把这几组值写进工程快照，本地无从恢复，
 * 承接只能替作者编造质感强度。实测已发布 333 份命中 0 行。
 */
const PORTRAIT_TEXTURE_PREFIX = '人物质感参数未保存或无法映射';
export const nodeIsHostlessPortraitTexture = issues => {
  if (!issues.length) return false;
  if (!issues.every(issue => issue.code === 'invalid-portrait-options')) return false;
  return issues.every(issue => String(issue.detail || '').startsWith(PORTRAIT_TEXTURE_PREFIX));
};

/**
 * F13 文字来源断裂：节点 textList 里引用的文字槽位在快照里已经取不到正文。
 * 适配层 ltv-native-project.ts 的两种上报形状：
 *  - "文字来源、类型或正文不一致"：nodeId 指向的节点不是 text 类型，或该槽位保存的
 *    content 数组为空、或其中的片段不在文本节点已保存的 content 里；
 *  - "文字输入列表格式无效"：textList 自身不是数组。
 * 2026-09-18 逐例核对：bd29812c 的 v-qsUnsYCC7X / v-UsZiavTNsh 指向的 t-B9dxygwgok
 * content 为 []；5b03cb0b 的 ed788393、ee4aad42 的 5c420677 引用的文字槽位 parts 为 []。
 * 正文在源工程里就不存在，本地无法恢复。实测已发布 333 份命中 0 行。
 */
const TEXT_INPUT_PREFIXES = ['文字来源、类型或正文不一致', '文字输入列表格式无效'];
export const nodeIsHostlessBrokenTextReference = issues => {
  if (!issues.length) return false;
  if (!issues.every(issue => issue.code === 'invalid-text-input')) return false;
  return issues.every(issue => TEXT_INPUT_PREFIXES.some(prefix => String(issue.detail || '').startsWith(prefix)));
};

/**
 * F14 分镜资产表/输出断裂：源工程的分镜行引用的资产（scene / prop / char 前缀条目）既不在原资产表里，
 * 也没有关联的图片节点；或分镜输出无法唯一关联回资产表条目。适配层 ltv-storyboard-graph.ts 的
 * 两条上报：`storyboard-asset-unmapped`（镜头 N: image/video: 资产 X 缺少关联图片节点 / 不在原资产表中 /
 * 提示词实体缺少资产定义）与 `storyboard-output-unmapped`（分镜输出无法唯一关联：<childId>）。
 * 实测 2026-09-18：e7ecbd42 / 03feea51 / 1f3b508d / 9814a693 的资产表条目缺失（涉及 43 行镜头引用），
 * c22f72d0 的节点 807555b8 两条输出无法关联；这些资产定义与输出映射在源工程快照里就不存在，
 * 本地归档无法恢复，承接只能替作者重新挑素材/重排输出，所以按用户 2026-09-18 的决定舍弃。
 * 与它们同节点混排的 storyboard-field-unmapped（rows[].dialogueLines/voiceover）与
 * unmapped-production-parameters（scenePayload）不影响判定：这两项本身仍保留上报。
 */
const STORYBOARD_GROUP_CODES = new Set(['storyboard-asset-unmapped', 'storyboard-output-unmapped', 'storyboard-field-unmapped', 'unmapped-production-parameters']);
export const nodeIsHostlessBrokenStoryboard = issues => {
  if (!issues.length) return false;
  if (!issues.every(issue => STORYBOARD_GROUP_CODES.has(issue.code))) return false;
  return issues.some(issue => issue.code === 'storyboard-asset-unmapped' || issue.code === 'storyboard-output-unmapped');
};

/**
 * F15 MiniMax Hailuo 2.3 / 2.3-Fast / o2 在宿主 MiniMax 合同里没有落点的那部分。
 * 这三个模型的源 schema（source-tool-spec.json）声明 768P/1080P（o2 另有 512P）与独立提交字段
 * `cameraMovement`（config.advancedSettings，2.3 与 2.3-Fast），而宿主 `minimax-video` 规格只声明
 * 768P 与 2K，内置适配器 normalizeMiniMaxResolution 会把 1080P/512P 一并抬成 2K；客户端
 * createMiniMaxVideoTask 的 payload 只有 model/content/resolution/duration/ratio/aigc_watermark，
 * 从不发送运镜字段。适配层已按模型自己的 schema 承接 768P + 无运镜指令的子集（ltv-hailuo-options.ts），
 * 于是留下来的节点只剩下这两类真正没有落点的要求，按用户 2026-09-18 的决定舍弃。
 * 判定只读上报形状：整节点硬阻塞 ⊆ {model-selection-required, advanced-operation, unmapped-production-parameters}，
 * 且存在 sourceModel 匹配 Hailuo 2.3/o2 的上报，且该节点的分辨率不在 768P 或确实带运镜字段。
 */
const HAILUO_MODERN_CODES = new Set(['model-selection-required', 'advanced-operation', 'unmapped-production-parameters']);
const HAILUO_MODERN_MODEL = /^MiniMax-Hailuo-(2\.3|2\.3-Fast|o2)$/i;
export const nodeIsHostlessHailuoModern = issues => {
  if (!issues.length) return false;
  if (!issues.every(issue => HAILUO_MODERN_CODES.has(issue.code))) return false;
  const cameraKeys = new Set();
  for (const issue of issues) if (issue.code !== 'model-selection-required') for (const key of detailKeys(issue.detail)) cameraKeys.add(key);
  for (const issue of issues) {
    if (issue.code !== 'model-selection-required') continue;
    const detail = String(issue.detail || '');
    if (!detail.startsWith('{')) continue;
    let parsed;
    try { parsed = JSON.parse(detail); } catch { continue; }
    if (!parsed || typeof parsed !== 'object' || !HAILUO_MODERN_MODEL.test(String(parsed.sourceModel || ''))) continue;
    const resolution = String(parsed.resolution || '').trim().toLowerCase();
    if (resolution !== '768p' || cameraKeys.has('cameraMovement')) return true;
  }
  return false;
};

/**
 * F16 万相 3.0 智能扩写（extendPrompt）。
 * 源工具 wanx3.0 / wanx3.0-prime 的 schema 把 extendPrompt 声明为 config.advancedSettings 里的开关
 * （default 1，提示词写明关闭后生成效果大概率下降）。宿主全树（web/src、web/test、backend、
 * plugin-packages、plugins、docs）里 `extendPrompt` 与 `extend_prompt` 均 0 命中；
 * dashscope-wan-video 插件的 `prompt_extend` 位于 providerOptions 命名空间，源节点从未保存该命名空间，
 * 没有映射依据。承接等于替作者猜一个"要不要扩写"。
 * 实测 2026-09-19：命中 4 份案例（7a38b7d6 / c5c8e705 / 79b038bd / 66c714e7），已发布 357 份命中 0。
 */
const WANX_EXTEND_CODES = new Set(['advanced-operation', 'unmapped-production-parameters', 'model-selection-required']);
export const nodeIsHostlessWanxExtendPrompt = issues => {
  if (!issues.length) return false;
  if (!issues.every(issue => WANX_EXTEND_CODES.has(issue.code))) return false;
  const keys = new Set();
  for (const issue of issues) if (issue.code !== 'model-selection-required') for (const key of detailKeys(issue.detail)) keys.add(key);
  return keys.size === 1 && keys.has('extendPrompt');
};

/**
 * F17 可灵 kling-v3-motion-control（动作控制）。
 * 源 schema 的 advancedSettings 是 characterOrientation（与图片/视频一致）与 keepOriginalSound（保留原始音频），
 * modeType 只有 mixed2video[2,2] 且要求同时提供图片与视频。映雪 87 个插件清单与宿主代码里
 * `characterOrientation`、`motion-control`、`motionControl` 全部 0 命中，可灵 3.0 的两个合同都不声明这两个字段。
 * 承接等于新建该模型的合同与渠道。
 * 实测 2026-09-19：命中 1 份案例（231b95ec 两节点），已发布 357 份命中 0。
 */
const MOTION_CONTROL_CODES = new Set(['advanced-operation', 'unmapped-production-parameters', 'model-selection-required', 'video-quality-adapter-required']);
export const nodeIsHostlessKlingMotionControl = issues => {
  if (!issues.length) return false;
  if (!issues.every(issue => MOTION_CONTROL_CODES.has(issue.code))) return false;
  const models = new Set(), keys = new Set();
  for (const issue of issues) {
    if (issue.code === 'model-selection-required') {
      const detail = String(issue.detail || '');
      if (!detail.startsWith('{')) return false;
      let parsed;
      try { parsed = JSON.parse(detail); } catch { return false; }
      if (!parsed || typeof parsed !== 'object') return false;
      models.add(String(parsed.sourceModel || ''));
    } else if (issue.code === 'advanced-operation' || issue.code === 'unmapped-production-parameters') for (const key of detailKeys(issue.detail)) keys.add(key);
  }
  if (models.size !== 1 || !models.has('kling-v3-motion-control')) return false;
  return keys.size === 2 && keys.has('characterOrientation') && keys.has('keepOriginalSound');
};

/**
 * F18 分镜对白/旁白（rows[].dialogueLines / rows[].voiceover）。
 * 源 script-v2 行保存了对白与旁白，映雪原生分镜行模型没有承载这两个字段：适配层实测 60 行 voiceover 里
 * 59 行的扁平 dialogue 为空、60 条对白文本不在扁平字段，所以它们不能当 bookkeeping 静默丢弃。
 * ltv-storyboard.ts 的注释原文即「留在 pending 直到原生行模型有承载字段」。已发布 17 个分镜节点，
 * 0 个带这两个键。承接只能替作者丢掉台词或另建行模型。
 * 实测 2026-09-19：命中 3 份案例（6cb2a11f / 85441511 / 427247fd），已发布 357 份命中 0。
 */
const STORYBOARD_SPEECH_CODES = new Set(['storyboard-field-unmapped', 'unmapped-production-parameters', 'advanced-operation']);
export const nodeIsHostlessStoryboardSpeech = issues => {
  if (!issues.length) return false;
  if (!issues.every(issue => STORYBOARD_SPEECH_CODES.has(issue.code))) return false;
  const fields = issues.filter(issue => issue.code === 'storyboard-field-unmapped');
  if (!fields.length) return false;
  return fields.every(issue => {
    const detail = String(issue.detail || '');
    return detail.includes('dialogueLines') || detail.includes('voiceover');
  });
};

/**
 * F19 源组图开关（sequential）没有无损宿主落点。
 * 源 schema（source-tool-spec.json）对 seedream-4 / 4.5 / 5 与 jimeng-4.6 声明
 * `sequential`（switch，default 1，提示词写明"模型自主判断是否返回组图以及组图张数"）与
 * `count`（[1,2,4]）。适配层已把「2K 档 + count=1 + 文生图/图生图」的子集落到
 * volcengine-ark-seedream 的 sequential_image_generation / max_images（实测 446 个节点里
 * 该子集全部成功上图）。剩下的节点按三种实测原因留在本族：
 *  1) 档位是 3K/4K：宿主 ark-seedream 插件的 size 只由 aspectRatio 换算成 2K 档像素
 *     （manifest.json 的 $switch cases 目视可数），3K/4K 只能被静默降成 2K；
 *  2) count>1：实测 count=N 在源平台就是精确 N 张产出（count=4→4 个 url，22+17+13 例），
 *     宿主组图契约的 max_images 只是上界、由模型自决张数，没有精确张数入口；
 *  3) 模型无组图合同：jimeng-4.6 的宿主插件把 force_single 写死 true（无任何组图透传键），
 *     lib-image-2 / nebula 系没有宿主插件，openai-image 合同不含组图键。
 * 宿主执行器另有独立事实：一次请求固定 count:"1"，组图接口返回多图时只取 images[0]。
 * 实测 2026-09-19：本族在 357 份已发布工程上命中 0；待适配里命中 8 份。
 */
const ARK_SEQUENTIAL_CODES = new Set(['advanced-operation', 'unmapped-production-parameters']);
export const nodeIsHostlessArkSequential = issues => {
  if (!issues.length) return false;
  if (!issues.every(issue => ARK_SEQUENTIAL_CODES.has(issue.code))) return false;
  const keys = new Set();
  for (const issue of issues) for (const key of detailKeys(issue.detail)) keys.add(key);
  return keys.size === 1 && keys.has('sequential');
};

/**
 * F20 vocal-v3 的稳定性档位（stability）。
 * 源 schema 里 `stability` 只由 vocal-v3（Text-to-Speech）声明：enum 活泼的/自然的/沉稳的 = 0/0.5/1，
 * default 0.5，属于 config.advancedSettings。宿主三条音频协议（openai-audio / async-audio /
 * elevenlabs-music）都没有该字段，87 个插件清单里唯一含 stability 的是 stability-image（Stability AI
 * 出图插件，与语音无关）。vocal-v3 供应商本身已在 prepare 的 HOSTLESS_SUPPLIERS 名单里（供应商无宿主
 * 协议），只是这两个案例的节点没有 model-selection-required 上报，所以旧规则没命中。
 * 实测 2026-09-19：本族在 357 份已发布工程上命中 0；待适配里命中 2 份（3074e056 / 470f557f）。
 */
const VOCAL_STABILITY_CODES = new Set(['advanced-operation', 'unmapped-production-parameters']);
export const nodeIsHostlessVocalStability = issues => {
  if (!issues.length) return false;
  if (!issues.every(issue => VOCAL_STABILITY_CODES.has(issue.code))) return false;
  const keys = new Set();
  for (const issue of issues) for (const key of detailKeys(issue.detail)) keys.add(key);
  return keys.size === 1 && keys.has('stability');
};

/**
 * F21 seed-audio-1.0 的音高/音量类声音控制（pitch）。
 * 适配层 ltv-audio-options.ts 的实现口径是「还原音量与零音高是中性值；有实际作用的效果值绝不静默丢弃」，
 * 所以 voice_setting_pitch / voice_modify_pitch 一旦出现在未映射键里，就代表作者保存了非中性音高。
 * 宿主三条音频协议都不声明 pitch 字段（web/src 全树里这两个键只出现在适配层与它的测试里）。
 * 实测 2026-09-19：本族在 357 份已发布工程上命中 0；待适配里命中 1 份（79134947 两节点 pitch -2/-4）。
 */
const SPEECH_PITCH_CODES = new Set(['advanced-operation', 'unmapped-production-parameters', 'audio-adapter-required', 'model-selection-required']);
const SPEECH_PITCH_KEYS = new Set(['voice_setting_pitch', 'voice_modify_pitch']);
export const nodeIsHostlessSpeechPitch = issues => {
  if (!issues.length) return false;
  if (!issues.every(issue => SPEECH_PITCH_CODES.has(issue.code))) return false;
  const keys = new Set();
  for (const issue of issues) if (issue.code === 'advanced-operation' || issue.code === 'unmapped-production-parameters') for (const key of detailKeys(issue.detail)) keys.add(key);
  return [...keys].some(key => SPEECH_PITCH_KEYS.has(key));
};

/**
 * F22 kling-v3-omni 的参考视频（mixed2video 带 videoList）。
 * 源 schema 里 kling-v3-omni 的 mixed2video:[1,7] 允许视频参考，宿主能收视频参考的是
 * kling-omni-video，但它的 validations 明文要求"有参考视频时必须声明原声设置"
 * （keep_original_sound 必须是 yes/no），而该字段只由 kling-v3-motion-control / wanx-motion-control
 * 两个源模型声明（source-tool-spec.json 全表扫描），kling-v3-omni 自己的 schema 里没有。
 * 适配层 ltv-kling-options.ts 因此按 `if(counts.video&&(sound||!['yes','no'].includes(fields.keep_original_sound)))return;`
 * 返回 undefined —— 节点没保存原声设置，宿主合同却强制要求，任何渠道配置都无法补出作者没保存的值。
 * 实测 2026-09-19：本族在 358 份已发布工程上命中 0；在 963 份可用快照上命中 43 份。
 */
const OMNI_REF_VIDEO_CODES = new Set(['model-selection-required', 'video-quality-adapter-required', 'unmapped-production-parameters', 'advanced-operation', 'search-option-unmapped']);
export const nodeIsHostlessOmniReferenceVideo = issues => {
  if (!issues.length) return false;
  if (!issues.every(issue => OMNI_REF_VIDEO_CODES.has(issue.code))) return false;
  const reports = sourceReportsOnly(issues);
  if (!reports) return false;
  return reports.some(report => report.sourceModel === 'kling-v3-omni' && Number((report.references || {}).video || 0) > 0);
};

/**
 * F23 kling-v3-omni 的视频编辑操作（videoEdit2video）。
 * kling-v3-omni 的源 schema 声明 videoEdit2video:[1,5]；宿主的 kling-omni-video 合同
 * manifest 全树（45506 字节）里 `videoEdit2video`、`video2video`、`edit` 均 0 命中，
 * 只有 kling-v3-video 收首尾帧而 manifest 明文"普通3.0只支持首尾帧输入"。
 * 另有 pictureEditLock（源工程"画面编辑锁定"开关）在宿主全树 0 命中。
 * 承接等同新建该编辑接口与它的渠道。
 * 实测 2026-09-19：本族在 358 份已发布工程上命中 0；963 份可用快照上命中 32 份。
 */
const OMNI_VIDEO_EDIT_CODES = new Set(['model-selection-required', 'video-quality-adapter-required', 'unmapped-production-parameters', 'advanced-operation', 'search-option-unmapped']);
export const nodeIsHostlessOmniVideoEdit = issues => {
  if (!issues.length) return false;
  if (!issues.every(issue => OMNI_VIDEO_EDIT_CODES.has(issue.code))) return false;
  const reports = sourceReportsOnly(issues);
  if (!reports) return false;
  if (!reports.some(report => report.sourceModel === 'kling-v3-omni')) return false;
  return reports.some(report => report.sourceModel === 'kling-v3-omni' && VIDEO_EDIT_OPERATIONS.has(String(report.operation)));
};

/**
 * F24 kling-video-o3 的残留 image2video + 多图（超过该模型首尾帧上限）。
 * kling-video-o3 的源 schema 只声明 frames2video[2,2] / singleImage2video[1,1] / audio2video[0,0]，
 * 没有 image2video；工程里保存的 image2video 是换模型留下的残留（ltv-mode-type.ts 的既定口径）。
 * 适配层 resolveLtvStaleModeType 会尝试重算，但该节点带 3~4 张图，超过 frames2video[2,2] 与
 * singleImage2video[1,1] 的上限，重算候选为空 → 保持原值上报。宿主两个可灵合同都收不下
 * 3~4 张参考图（omni 的 mixed2video 收得下，但 validations 要求实际模型恰好是 kling-v3-omni）。
 * 承接只能替作者删掉多余参考图。实测 2026-09-19：已发布 358 份命中 0；可用快照命中 13 份。
 */
const O3_STALE_IMAGE_CODES = new Set(['model-selection-required', 'video-quality-adapter-required', 'unmapped-production-parameters', 'advanced-operation', 'search-option-unmapped']);
export const nodeIsHostlessO3StaleImage2Video = issues => {
  if (!issues.length) return false;
  if (!issues.every(issue => O3_STALE_IMAGE_CODES.has(issue.code))) return false;
  const reports = sourceReportsOnly(issues);
  if (!reports) return false;
  return reports.some(report => report.sourceModel === 'kling-video-o3' && report.operation === 'image2video' && Number((report.references || {}).image || 0) > 2);
};

/**
 * F25 happy-horse-1 / 1.1 的 image2video（多图参考）。
 * 源 schema 声明 frames2video[1,1] / videoEdit2video[1,5] / image2video[1,9]；适配层只把
 * frames2video 交给 kling-v3-video（该合同明文只收首尾帧），image2video 的多图参考与
 * videoEdit2video 都在宿主没有落点。承接只能把作者的多图参考降级成首帧请求。
 * 实测 2026-09-19：已发布 358 份命中 0；可用快照命中 4 份（含待适配的 7bbc5d15）。
 */
const HORSE_IMAGE_CODES = new Set(['model-selection-required', 'video-quality-adapter-required', 'unmapped-production-parameters', 'advanced-operation', 'search-option-unmapped']);
export const nodeIsHostlessHappyHorseImage2Video = issues => {
  if (!issues.length) return false;
  if (!issues.every(issue => HORSE_IMAGE_CODES.has(issue.code))) return false;
  const reports = sourceReportsOnly(issues);
  if (!reports) return false;
  return reports.some(report => ['happy-horse-1', 'happy-horse-1.1'].includes(String(report.sourceModel)) && report.operation === 'image2video');
};

/**
 * F26 viduq2-pro / viduq3-pro 的图片输入。
 * 宿主的百炼发现表（backend/internal/provider/bailian/discovery.go:271-301）只登记
 * `vidu/viduq2_text2video` 与 `vidu/viduq3-pro_text2video`，两者都是文生视频入口；
 * 源 schema 里 viduq2-pro 是 mixed2video[1,7]/singleImage2video[1,1]、viduq3-pro 是
 * singleImage2video[0,1]，都需要图片输入。另有 viduq3-pro 的 `style` / pixverse 的
 * `style`、`soundEffect`、wanxiang-v2-6 的 `multiClip` 在 vidu-video / pixverse-video
 * 宿主 manifest（16460 / 16743 字节）里 0 命中。
 * 实测 2026-09-19：已发布 358 份命中 0；可用快照命中 7 份（含待适配的 7bbc5d15）。
 */
const VIDU_IMAGE_CODES = new Set(['model-selection-required', 'video-quality-adapter-required', 'unmapped-production-parameters', 'advanced-operation', 'search-option-unmapped']);
export const nodeIsHostlessViduImage2Video = issues => {
  if (!issues.length) return false;
  if (!issues.every(issue => VIDU_IMAGE_CODES.has(issue.code))) return false;
  const reports = sourceReportsOnly(issues);
  if (!reports) return false;
  return reports.some(report => /^viduq[23]-pro$/.test(String(report.sourceModel)) && Number((report.references || {}).image || 0) > 0);
};

/**
 * F27 pixverse-v5 的 style / soundEffect。
 * 宿主 pixverse-video 合同 manifest（16743 字节）里 `style`、`soundEffect` 均 0 命中；
 * 源 schema 的 pixverse-v5 properties 声明 style、soundEffect（pixverse-v5.5 声明 style、multiClip）。
 * 承接只能丢掉作者选好的风格与音效。
 * 实测 2026-09-19：已发布 358 份命中 0；可用快照命中 2 份（含待适配的 45bc3cff）。
 */
const PIXVERSE_CODES = new Set(['model-selection-required', 'video-quality-adapter-required', 'unmapped-production-parameters', 'advanced-operation', 'search-option-unmapped']);
const PIXVERSE_KEYS = new Set(['style', 'soundEffect']);
export const nodeIsHostlessPixverseStyle = issues => {
  if (!issues.length) return false;
  if (!issues.every(issue => PIXVERSE_CODES.has(issue.code))) return false;
  const reports = sourceReportsOnly(issues);
  if (!reports) return false;
  if (!reports.some(report => String(report.sourceModel) === 'pixverse-v5')) return false;
  const keys = new Set();
  for (const issue of issues) if (issue.code !== 'model-selection-required') for (const key of detailKeys(issue.detail)) keys.add(key);
  return [...keys].some(key => PIXVERSE_KEYS.has(key));
};

/**
 * F28 wanxiang-v2-6 的 multiClip。
 * 源 schema 的 wanxiang-v2-6 properties 声明 multiClip（多片段拼接）；适配层把该字段回报成
 * advanced-operation + unmapped-production-parameters。宿主 `multiClip` 全树 0 命中
 * （backend/internal、plugin-packages、web/src 三处扫描），宿主 dashscope-wan-video 合同的
 * body 里没有该字段。承接只能丢掉作者的多片段要求。
 * 实测 2026-09-19：已发布 358 份命中 0；可用快照命中 2 份（含待适配的 27d4408b）。
 */
const WANX_MULTICLIP_CODES = new Set(['model-selection-required', 'video-quality-adapter-required', 'unmapped-production-parameters', 'advanced-operation', 'search-option-unmapped']);
export const nodeIsHostlessWanxMultiClip = issues => {
  if (!issues.length) return false;
  if (!issues.every(issue => WANX_MULTICLIP_CODES.has(issue.code))) return false;
  const reports = sourceReportsOnly(issues);
  if (!reports) return false;
  if (!reports.some(report => String(report.sourceModel) === 'wanxiang-v2-6')) return false;
  const keys = new Set();
  for (const issue of issues) if (issue.code !== 'model-selection-required') for (const key of detailKeys(issue.detail)) keys.add(key);
  return keys.has('multiClip');
};

/**
 * F29 seed-audio-1.0 的 Text-to-Speech 场景（audio-adapter-required: text2image）。
 * 源工程把这批 TTS 节点的 modeType 存成 `text2image`（音频模型不可能有理图模态，属源脏值），
 * 于是适配层按 audio-adapter-required 上报"当前音频适配未覆盖此操作"。这些节点的
 * audioListOrder 指向一条上游 a- 节点（音色克隆参考），而宿主三条音频协议
 * （openai-audio / async-audio / elevenlabs-music）只收 input/voice/response_format/speed/instructions，
 * 不接受参考录音，也不接受 text2image 这个操作名。承接只能丢掉参考音色、替作者编一个 voice id。
 * 实测 2026-09-19：已发布 358 份命中 0；可用快照命中 1 份（待适配的 df734405，5 个节点）。
 */
const SEED_AUDIO_CODES = new Set(['audio-adapter-required', 'advanced-operation', 'unmapped-production-parameters', 'model-selection-required']);
export const nodeIsHostlessSeedAudioTts = issues => {
  if (!issues.length) return false;
  if (!issues.every(issue => SEED_AUDIO_CODES.has(issue.code))) return false;
  const adapters = issues.filter(issue => issue.code === 'audio-adapter-required');
  if (!adapters.length) return false;
  return adapters.every(issue => {
    const detail = String(issue.detail || '');
    return detail.includes('"operation":"text2image"') && detail.includes('Text-to-Speech');
  });
};

/**
 * F30 mureka-8/9/9.5 的参考素材。
 * 宿主音乐落点 elevenlabs-music（ltv-music-options.ts）只接 text2audio 且要求无参考素材；
 * 该节点的 videoList 有 1 条 15.08 秒视频参考，任何渠道配置都表达不了"用这段视频做参考"。
 * 承接只能丢掉参考素材。
 * 实测 2026-09-19：已发布 358 份命中 0；可用快照命中 1 份（待适配的 08d233c5）。
 */
const MUREKA_CODES = new Set(['model-selection-required', 'audio-adapter-required', 'unmapped-production-parameters', 'advanced-operation']);
export const nodeIsHostlessMurekaReference = issues => {
  if (!issues.length) return false;
  if (!issues.every(issue => MUREKA_CODES.has(issue.code))) return false;
  const reports = sourceReportsOnly(issues);
  if (!reports) return false;
  return reports.some(report => /^mureka-/.test(String(report.sourceModel))
    && (Number((report.references || {}).video || 0) > 0 || Number((report.references || {}).image || 0) > 0 || Number((report.references || {}).audio || 0) > 0));
};

/**
 * F31 源工程未保存请求身份的生成节点。
 * 这类节点的 data 里完全没有 `params`（只有 type/name/url/action/generatorType/_updatedAtMs/_meta），
 * 所以 model 为空、operation 为空、prompt 长度为 0。适配层按 `operation=''` 上报
 * model-selection-required。这不是"缺少用户输入"（不是 empty-prompt），也不是"缺渠道"：
 * 源工程从没保存过这个节点要提交什么模型与操作，本地归档无从恢复，承接只能替作者编一次生成请求。
 * 实测 2026-09-19：已发布 358 份命中 0；可用快照命中 3 份（含待适配的 0a981ec1）。
 */
export const nodeIsHostlessUnsavedRequest = issues => {
  if (!issues.length) return false;
  if (!issues.every(issue => issue.code === 'model-selection-required')) return false;
  return issues.every(issue => {
    const detail = String(issue.detail || '');
    if (!detail.startsWith('{')) return false;
    let parsed;
    try { parsed = JSON.parse(detail); } catch { return false; }
    return parsed.operation === '' && parsed.sourceModel === '' && Number(parsed.promptChars || 0) === 0;
  });
};

/** 逐节点套用上面四条规则；只要有一个节点的全部硬阻塞都属于同一族即命中。 */
export const hasHostlessNodeMatching = (hardBlockers, predicate) => {
  const nodes = new Set(hardBlockers.map(issue => issue.nodeId || ''));
  for (const nodeId of nodes) {
    const nodeIssues = hardBlockers.filter(issue => (issue.nodeId || '') === nodeId);
    if (predicate(nodeIssues)) return true;
  }
  return false;
};
