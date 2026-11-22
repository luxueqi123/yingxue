import { CanvasNodeType, type CanvasNodeData, type CanvasConnection, type CanvasNodeMetadata } from '../../types/canvas';
import { buildLtvReferencePlan } from './ltv-reference-plan';
import { projectLtvSubmittedFields, readLtvSwitch, resolveLtvSourceModel, normalizeLtvVideoEnhancementFields } from './ltv-parameter-layers';
import { buildCameraPrompt } from './camera-prompt-library';
import type { LtvReferencePlan } from './ltv-reference-plan';
import { PORTRAIT_TEXTURE_GROUPS, buildPortraitTexturePrompt, type PortraitTextureSettings } from './canvas-portrait-texture';
import { summarizeLtvReadiness } from './ltv-case-readiness';
import { mapLtvSpeechOptions } from './ltv-audio-options';
import { mapLtvImageBackground } from './ltv-image-background';
import { extractLtvVideoClipTimelines } from './ltv-video-clip';
import { projectLtvMediaInputs, restoreLtvMediaMetadata, restoreLtvProjectAssetUrls } from './ltv-media-inputs';
import { configurableLtvOperation } from './ltv-configurable-operation';
import { mapLtvVolcanoVideoEnhance } from './ltv-volcano-video-enhance';
import { mapLtvSubtitleErase } from './ltv-subtitle-erase';
import { mapLtvOmniHuman } from './ltv-omnihuman';
import { prepareLtvStoryboardGraph } from './ltv-storyboard-graph';
import { ltvNativeScene, addLtvSceneInputSlots, isLtvWorkflowScene, isLtvPanoramicScene, stripLtvPanoramaToken, stripLtvSlashPresetToken, stripLtvCameraPresetToken, ltvCameraPresetTexts, ltvUnresolvedCameraPresetIndexes, resolveLtvMentionTokens } from './ltv-native-scene';
import { ltvReferenceSlotNodeIds } from './ltv-reference-plan';
import { ltvTextReferenceBody } from './ltv-runtime-references';
import { mapLtvMusicOptions } from './ltv-music-options';
import { restoreLtvConnectedInputs, expandLtvGroupInputEdges, findLtvSavedReferenceOwner } from './ltv-connected-inputs';
import { mapLtvKlingOptions } from './ltv-kling-options';
import { HAPPYHORSE_FIRST_FRAME_CONTRACT } from './ltv-happyhorse-options';
import { mapLtvTopazImageOptions, ltvTopazImageDeclaredFieldsAreMapped, ltvTopazImageRequestIsMapped, topazImageContractOptions } from './ltv-topaz-image';
import { mapLtvTopazVideoOptions, ltvTopazVideoDeclaredFieldsAreMapped, topazVideoContractOptions } from './ltv-topaz-video';
import { mapLtvAngleOperation } from './ltv-angle-operation';
import { mapLtvMaskEdit, ltvMaskEditOptions, ltvMaskEditPrompt, restoreLtvStandaloneMaskInput } from './ltv-mask-edit';
import { ltvArkImageSequentialDeclared } from './ltv-ark-image-options';
import { isLtvWanxPromptExtendModel, LTV_WANX_PROMPT_EXTEND_CONTRACT, LTV_WANX_PROMPT_EXTEND_PROVIDER, mapLtvWanxPromptExtend } from './ltv-wanx-options';
import { readLtvModeSchema, resolveLtvStaleModeType, ltvSchemaDeclaresQuality } from './ltv-mode-type';
import { buildLtvPrevisProjectNode, type LtvPrevisProjectImport } from './previs/ltv-director-project';
import type { PrevisScene } from '../../types/previs';

type RecordValue = Record<string, any>;
type NativeModel = { channelId: string; modelKey: string; capability: string; protocol: string; available?: boolean; capabilityConfig: RecordValue };
export type NativeCaseIssue = { nodeId?: string; code: string; detail: string };
const record = (v: unknown): RecordValue => v && typeof v === 'object' && !Array.isArray(v) ? v as RecordValue : {};
const list = (v: unknown): string[] => typeof v === 'string' ? v ? [v] : [] : Array.isArray(v) && v.every(x=>typeof x==='string') ? v : [];
const enabled = readLtvSwitch;
const mediaUrl = (v: string) => { try { return new URL(v).protocol === 'https:'; } catch { return false; } };
const mappedFields=new Set(['model','count','n','modeType','prompt','cameraControl','cameraPresets','textList','imageList','videoList','audioList','mixedList','imageListOrder','videoListOrder','audioListOrder','mixedListOrder','imageLabelList','ratio','resolution','quality','duration','enableSound','autoCompliance','search_enabled','searchEnabled','searchable']);
// 源工程会把同一批素材的水印版另存一份镜像键（videoList_wm 等，值是同一地址加 /wm/ 前缀）。
// 实测 2026-09-18：全量 1024 份快照里只有 3 个节点带 videoList_wm，其中 2 个属已舍弃工程；
// 106 个源工具的 schema 没有任何一个声明 *_wm 字段，提交字段是 videoList 本身，所以这类镜像键
// 不参与请求，按残留字段豁免，不再当成"未映射制作参数"。
const mirroredMediaFields=new Set(['imageList_wm','videoList_wm','audioList_wm','mixedList_wm']);
const active=(v:unknown):boolean=>v!==undefined&&v!==null&&v!==false&&v!==0&&v!==''&&(!Array.isArray(v)||v.length>0)&&(typeof v!=='object'||Array.isArray(v)||Object.keys(v).length>0);

/** Rebuilds a complete project using Yingxue operations, never source model identities or APIs. */
export function adaptLtvNativeProject(snapshotValue: unknown, catalogValue: unknown, id: string, title: string, sourceSchemas: Record<string, unknown> = {}, previsImports: ReadonlyMap<string, LtvPrevisProjectImport> = new Map()) {
 const source=record(snapshotValue);
 // Source 36r2or3hxiguz.js writes the newer editable screenplay as type `script-v2`; it carries
 // the same `rows` table as the legacy `script` node, so both take the native storyboard path.
 if(!Array.isArray(source.nodes)||!source.nodes.some((node:RecordValue)=>node.type==='script'||node.type==='script-v2'||node.type==='video-story'))return adaptStandardLtvNativeProject(source,catalogValue,id,title,sourceSchemas,previsImports);
 const prepared=prepareLtvStoryboardGraph(source);
 const result=adaptStandardLtvNativeProject(prepared.snapshot,catalogValue,id,title,sourceSchemas,previsImports);
 result.issues.push(...prepared.issues);
 for(const node of result.project.nodes){
  const script=prepared.scripts.get(node.id);if(!script)continue;
  node.type=CanvasNodeType.Script;
   node.metadata={...node.metadata,storyboard:script.storyboard,storyboardViews:script.viewState.views,storyboardActiveViewId:script.viewState.activeId,ltvStoryboardSource:{columns:script.sourceColumns,imageGenerationConfig:script.imageConfig,...(script.videoStory?{videoStory:script.videoStory}:{})}};
  // Video story is a source-video analysis resource, not a script generation request.
  if(script.sourceKind==='video-story')continue;
  const config=record(script.imageConfig);
  if(!Object.keys(config).length){
   node.metadata.storyboardImageDefaults={model:'',count:1,strictGenerationOptions:['model','count']};
   result.issues.push({nodeId:node.id,code:'channel-configuration-required',detail:JSON.stringify({scope:'storyboard-image-defaults',modelKey:'',reason:'原脚本未保存图像模型配置；新建分镜图后明确选择模型，不能自动替换为全局模型'})});
  }else{
   const params={model:config.model,prompt:'分镜图片参数校验',count:1,modeType:'text2image',settings:config.settings,
    cameraControl:config.cameraControl,fineTuneType:config.fineTuneType,fineTuneModels:config.fineTuneModels,...(config.model==='z-image'?{promptMagic:1}:{})};
   const defaults=adaptStandardLtvNativeProject({nodes:[{id:'image-defaults',type:'image',position:{x:0,y:0},data:{action:'image_generate',params}}],edges:[]},catalogValue,id,title,sourceSchemas);
   const blocking=defaults.issues.filter(issue=>!['channel-configuration-required','empty-prompt'].includes(issue.code));
   for(const issue of defaults.issues)result.issues.push({...issue,nodeId:node.id,detail:issue.code==='channel-configuration-required'?JSON.stringify({...JSON.parse(issue.detail),scope:'storyboard-image-defaults'}):`分镜默认图像参数：${issue.detail}`});
   const options=defaults.project.nodes[0]?.metadata;
   if(!blocking.length&&options){
    const {model,size,quality,count,cameraControl,imageGrounding,ltvExecutionContract,strictGenerationOptions}=options;
    node.metadata.storyboardImageDefaults={model,size,quality,count,cameraControl,imageGrounding,
     ltvExecutionContract:ltvExecutionContract||'openai-image',strictGenerationOptions};
   }
  }
 }
 const ids=new Set(result.project.nodes.map(node=>node.id));
 for(const edge of prepared.outputConnections)if(ids.has(edge.fromNodeId)&&ids.has(edge.toNodeId)){
  const existing=result.project.connections.find(item=>item.fromNodeId===edge.fromNodeId&&item.toNodeId===edge.toNodeId);
  if(existing)Object.assign(existing,{relation:edge.relation,storyboardRowId:edge.storyboardRowId,fromHandleId:edge.fromHandleId});
  else result.project.connections.push(edge);
 }
 result.project.adaptation.sourceNodeCount=source.nodes.length;
 if(new TextEncoder().encode(JSON.stringify({project:result.project})).length>5*1024*1024&&!result.issues.some(issue=>issue.code==='project-size-limit'))result.issues.push({code:'project-size-limit',detail:'完整分镜工程超过映雪5MiB保存限制'});
 result.readiness=summarizeLtvReadiness(result.issues);
 result.supported=result.issues.length===0;
 result.adoptable=['ready','input-required','configuration-required'].includes(result.readiness.status);
 return result;
}

function adaptStandardLtvNativeProject(snapshotValue: unknown, catalogValue: unknown, id: string, title: string, sourceSchemas: Record<string, unknown> = {}, previsImports: ReadonlyMap<string, LtvPrevisProjectImport> = new Map()) {
 const snapshot=record(snapshotValue), catalog=record(catalogValue);
 const issues: NativeCaseIssue[]=[], nodes: CanvasNodeData[]=[], connections: CanvasConnection[]=[];
 const previsScenes: PrevisScene[]=[];
 const add=(code:string,detail:string,nodeId?:string)=>issues.push({code,detail,nodeId});
 const sourceNodes: RecordValue[]=Array.isArray(snapshot.nodes)?restoreLtvProjectAssetUrls(structuredClone(snapshot.nodes)):[];
 const timelineCandidates=new Map(extractLtvVideoClipTimelines(snapshot).map(candidate=>[candidate.ownerNodeId,candidate]));
 for(const node of sourceNodes)if(node.type==='video-clip'&&timelineCandidates.get(String(node.id))?.timeline){
  node.type='video';node.data={...node.data,action:'video_resource',params:{}};
 }
 const originalNodeCount=sourceNodes.length;
 for(const node of sourceNodes)if(node.type==='reference'&&node.data?.action==='reference_node'){
  node.type='text';node.data={...node.data,action:'text_resource'};
 }
 // Source style material is a LoRA/template application, not a picture reference: measured across
 // the snapshot every one of its 659 outgoing edges targets a generation node without appearing in
 // that node's reference list. The host's own LTV import path degrades it to an image reference
 // (backend/internal/auth/libtv_adapter.go), but that policy would turn 659 style edges into bogus
 // `unbound-input` requirements here, so the adapter keeps it an explicit unsupported node and
 // drops its edges instead of fabricating a reference the source never declared.
 const styleMaterialIds=new Set(sourceNodes.filter(node=>node.type==='material-style').map(node=>String(node.id)));
 for(const node of sourceNodes)if(node.data?.params){
  try{const restored=restoreLtvMediaMetadata(record(node.data.params));node.data.params=node.type==='video'?projectLtvMediaInputs(restored,String(node.id)):restored;}
  catch(error){add('invalid-reference',error instanceof Error?error.message:'混合参考格式无效',node.id);}
 }
 const expandedInputEdges=expandLtvGroupInputEdges(sourceNodes,Array.isArray(snapshot.edges)?snapshot.edges:[]);
 restoreLtvConnectedInputs(sourceNodes,expandedInputEdges);
 for(const node of sourceNodes)if(node.type==='image'&&node.data?.action==='image_generate'&&!expandedInputEdges.some(edge=>edge.target===node.id)){
  node.data.params=restoreLtvStandaloneMaskInput(record(node.data.params));
 }
 try{addLtvSceneInputSlots(sourceNodes,expandedInputEdges);}
 catch(error){add('invalid-ids',error instanceof Error?error.message:'场景参考输入节点无效');}
 const originalIds=new Set(sourceNodes.map(n=>n.id));
 // 内嵌/补齐素材节点的 id 只由本轮 materialize 生成；保存槽位若指向不在快照里的 id，说明它引用的
 // 是这类合成节点（见下方 `::inline::` 分支），而不是作者工程里的真实节点。
 const snapshotNodeIds=new Set(sourceNodes.map(n=>n.id));
  // 保存槽位的地址在图里没有节点持有时适配层会补一条内嵌素材节点；同节点的 live 入边指的是同一个
  // 逻辑输入，提交时源只按 live 入边重建素材列表，所以这条关系用来给下面的入边循环去重。
  const mergedInlineUpstreams=new Map<string,Set<string>>();
  // Uploaded references are legitimate inputs even when LTV did not create a canvas node for them.
 for(const node of sourceNodes.slice()){
   const params=record(node.data?.params);
  for(const ref of Array.isArray(params.textList)?params.textList:[]){
   const owner=sourceNodes.find(n=>n.id===ref?.nodeId);
   if(owner?.type==='text'){
    const parts=list(ref.content),saved=list(owner.data?.content);
    if(parts.length&&parts.some(part=>!saved.includes(part))){
     const refId=`${owner.id}::saved::text-ref-${node.id}-${params.textList.indexOf(ref)}`;
     if(originalIds.has(refId)){add('invalid-ids','历史文字引用ID冲突',node.id);continue;}
     originalIds.add(refId);ref.nodeId=refId;
     sourceNodes.push({id:refId,type:'text',position:{x:Number(owner.position?.x)+400,y:Number(owner.position?.y)},data:{name:`${owner.data?.name||'文字'} · 引用快照`,action:'text_resource',content:parts}});
    }
   }
   if(typeof ref?.nodeId!=='string'||!ref.nodeId||sourceNodes.some(n=>n.id===ref.nodeId))continue;
   const content=list(ref.content);if(!content.length)continue;
   originalIds.add(ref.nodeId);
   sourceNodes.push({id:ref.nodeId,type:'text',position:{x:Number(node.position?.x)-400,y:Number(node.position?.y)},data:{name:'文字参考',action:'text_resource',content}});
  }
   for(const kind of ['image','video','audio']){
   const values=params[`${kind}List`];if(!Array.isArray(values))continue;
   values.forEach((value:unknown,index:number)=>{
    if(typeof value==='string'&&mediaUrl(value))values[index]={url:value};
    const ref=values[index] as RecordValue;
    if(!ref||typeof ref!=='object')return;
    // Source normalizeMediaList selects the first entry of legacy URL arrays.
    // Other node outputs are still materialized independently below.
    if(Array.isArray(ref.url)&&typeof ref.url[0]==='string')ref.url=ref.url[0];
    if(typeof ref.url==='string'&&ref.url.startsWith('asset://')&&typeof ref._httpUrl==='string'&&mediaUrl(ref._httpUrl))ref.url=ref._httpUrl;
    if((ref.nodeId===undefined||ref.nodeId===null||ref.nodeId==='')&&typeof ref.url==='string'&&mediaUrl(ref.url)){
     const savedOwner=findLtvSavedReferenceOwner(sourceNodes,expandedInputEdges,String(node.id),kind,ref.url);
     if(savedOwner)ref.nodeId=savedOwner;
    }
    const owner=sourceNodes.find(n=>n.id===ref.nodeId);
    // 保存槽位指向的节点不在作者快照里，而同一目标节点还有一条同类型的 live 入边持有完全相同的地址：
    // 源提交时只用 live 入边重建素材列表（1di1-3y--egfx.js `ei()` / collectIncomingNodeDataForTarget），
    // 两者就是同一条逻辑输入。合成节点可能是更早的节点先建出来的，那时这里不会再走 `::inline::` 分支，
    // 于是下面的入边循环会把这条 live 入边再追加一遍，把一条输入记成两条参考。登记下来供该循环去重。
    // 实测 2026-09-19：case-cdd799b0 的两个 kling-video-o3 节点因此把 2 张参考记成 4 张，
    // frames2video 数量超限，误落 model-selection-required；已发布 357 份命中 0。
    if(typeof ref.nodeId==='string'&&ref.nodeId&&!snapshotNodeIds.has(ref.nodeId)){
     const liveOwner=findLtvSavedReferenceOwner(sourceNodes,expandedInputEdges,String(node.id),kind,ref.url);
     if(liveOwner){const owners=mergedInlineUpstreams.get(String(node.id))||new Set<string>();owners.add(liveOwner);mergedInlineUpstreams.set(String(node.id),owners);}
    }
    if(owner&&ref.durationSec===undefined){
     const version=list(owner.data?.url).indexOf(ref.url);
     const info=(owner.data?.resourceMeta?.items||owner.resourceMeta?.items||[])[version];
     if(version>=0&&typeof info?.durationSec==='number'&&info.durationSec>0)ref.durationSec=info.durationSec;
    }
    if(owner&&owner.type===kind&&typeof ref.url==='string'&&mediaUrl(ref.url)&&!list(owner.data?.url).includes(ref.url)){
     const refId=`${owner.id}::saved::ref-${node.id}-${kind}-${index}`;
     if(originalIds.has(refId)){add('invalid-ids','历史引用ID冲突',node.id);return;}
     originalIds.add(refId);ref._originalNodeId=ref.nodeId;ref.nodeId=refId;
     sourceNodes.push({id:refId,type:kind,position:{x:Number(owner.position?.x)+400,y:Number(owner.position?.y)+index*270},data:{name:`${owner.data?.name||kind} · 引用快照`,action:`${kind}_resource`,url:[ref.url]},resourceMeta:{items:[{width:ref.width,height:ref.height,durationSec:ref.durationSec}]}});
    }
    if((!ref.nodeId||(typeof ref.nodeId==='string'&&!owner))&&typeof ref.url==='string'&&mediaUrl(ref.url)){
     // 保存的素材地址在整张图里没有任何节点持有（作者当时引用的那一版已经被上游重新生成顶掉），
     // 适配层按原地址补一个内嵌素材节点。此时这条"内嵌槽位"和同节点的 live 入边指的是同一个逻辑
     // 输入：源 1di1-3y--egfx.js `ei()` 在提交时才用 live 入边重建素材列表，两者不会同时进入请求。
     // 记录同类型的唯一 live 上游，供下面的入边循环去重，避免同一输入被记成两次参考
     // （实测 2026-09-18：9d25c7f5 的 9 个 topaz 视频节点因此把 video 参考记成 2 条，落到
     // model-selection-required；已发布 342 份里"保存槽位地址无节点持有"的节点为 0，故本分支
     // 不影响任何已发布工程）。
     const candidates=[...new Set(expandedInputEdges.filter((edge:RecordValue)=>edge.target===node.id&&!edge.data?.portraitVirtual&&!edge.data?.assetVirtual).map((edge:RecordValue)=>String(edge.source)))].filter((source:string)=>String(record(sourceNodes.find(n=>n.id===source)?.data).type||sourceNodes.find(n=>n.id===source)?.type||'')===kind);
     // 该内嵌槽位保存的地址如果在某个同类型 live 上游节点的地址表里，那条上游就是同一逻辑输入
     // （源提交时才用 live 入边重建素材列表），必须一起去重，不能因为 live 入边有两条就放弃。
     // 实测 2026-09-18：case-cdd799b0 的 4 个 o3 节点保存的两个槽位指向快照里已不存在的节点，
     // 两条 live 入边各持其中一个地址，候选数为 2 时旧判定不去重，内嵌 + live 被记成 4 张参考，
     // frames2video 因此报数量超限；全量 1024 份里该形状只出现在 2 个案例，已发布命中 0。
     const inlineUrl=typeof ref.url==='string'?ref.url:'';
     const sameAddress=candidates.filter((source:string)=>list(record(sourceNodes.find(n=>n.id===source)?.data).url).includes(inlineUrl));
     const deduped=sameAddress.length===1?sameAddress:candidates.length===1?candidates:[];
     // 该节点只有一条同类型 live 上游、且本槽位没有别的引用已经占用它时，把这个槽位指回那条上游，
     // 不再补内嵌素材节点：源提交时只用 live 入边重建素材列表，这条上游就是同一个逻辑输入。
     // 补节点会同时留下"内嵌→目标"与"上游→目标"两条连线，而引用计划里只有一条参考，首次生成会被
     // 画布的引用顺序校验判成「参考素材或编号已变化」而无法提交。
     // 实测 2026-09-19：cdd799b0 的 5 个可灵节点（槽位地址与上游保存地址相同）与 9d25c7f5 的 9 个
     // topaz 节点（槽位地址在图里已无节点持有、live 上游另有当前版本）都是这个形状，两条都落在已发布工程里。
     const onlyUpstream=deduped.length===1?sourceNodes.find(n=>n.id===deduped[0]):undefined;
     const alreadyBound=values.some((other:unknown)=>other!==ref&&record(other).nodeId===deduped[0]);
     if(onlyUpstream&&!alreadyBound){
      const generate=String(onlyUpstream.data?.action||'').endsWith('_generate');
      ref.nodeId=deduped[0];
      // Keep the plan's version in step with the node it now names: a generation upstream is resolved at
      // run time, a resource upstream contributes the version this project archived.
      if(generate){ref.url='';ref.deferred=true;}else ref.url=list(onlyUpstream.data?.url)[0]||inlineUrl;
      const owners=mergedInlineUpstreams.get(String(node.id))||new Set<string>();
      owners.add(deduped[0]);mergedInlineUpstreams.set(String(node.id),owners);
      return;
     }
     const refId=ref.nodeId||`${node.id}::inline::${kind}::${index}`;
     if(originalIds.has(refId)){add('invalid-ids','内嵌素材ID冲突',node.id);return;}
     originalIds.add(refId);ref.nodeId=refId;
     if(deduped.length===1){
      const owners=mergedInlineUpstreams.get(String(node.id))||new Set<string>();
      owners.add(deduped[0]);mergedInlineUpstreams.set(String(node.id),owners);
     }
     sourceNodes.push({id:refId,type:kind,position:{x:Number(node.position?.x)-400,y:Number(node.position?.y)+index*270},data:{name:ref.label||`${kind}参考 ${index+1}`,action:`${kind}_resource`,url:[ref.url]},resourceMeta:{items:[{width:ref.width,height:ref.height,durationSec:ref.durationSec}]}});
    }else if(ref.nodeId&&ref.url==null&&sourceNodes.some(n=>n.id===ref.nodeId&&String(n.data?.action).endsWith('_generate')))ref.url='';
   });
  }
 }
 const ignoredConnections: RecordValue[]=[];
 const sourceEdges: RecordValue[]=expandedInputEdges.filter((edge:RecordValue)=>{
  if(edge.data?.portraitVirtual||edge.data?.assetVirtual){ignoredConnections.push({fromNodeId:edge.source,toNodeId:edge.target,reason:'源collectIncomingNodeDataForTarget不将虚拟资产连线作为制作输入'});return false;}
  const ignored=sourceNodes.find(node=>node.id===edge.target)?.data?.params?._ltvInactiveReferenceNodeIds;
  if(Array.isArray(ignored)&&ignored.includes(edge.source)){ignoredConnections.push({fromNodeId:edge.source,toNodeId:edge.target,reason:'源混合模式没有提交该分列表输入'});return false;}
  // Style material wires a LoRA/template application onto a generation node; the source never lists
  // it as a reference input, so carrying the edge would fabricate an unbound input requirement.
  if(styleMaterialIds.has(String(edge.source))){ignoredConnections.push({fromNodeId:edge.source,toNodeId:edge.target,reason:'风格素材是LoRA/模板应用，不是原引用列表中的图片输入'});return false;}
  return true;
 });
 const byId=new Map(sourceNodes.map(n=>[n.id,n]));
 for(const nodeId of previsImports.keys())if(byId.get(nodeId)?.type!=='director-console-3d')add('director-adaptation-required','导演台产物缺少对应源节点',nodeId);
 if(!sourceNodes.length || !Array.isArray(snapshot.edges))add('missing-graph','无完整节点与连线');
 if(byId.size!==sourceNodes.length || sourceNodes.some(n=>typeof n.id!=='string'||!n.id))add('invalid-ids','节点ID不完整');
 const models:NativeModel[]=(catalog.channels||[]).flatMap((c:RecordValue)=>(c.models||[]).map((m:RecordValue)=>({...m,channelId:c.id,available:m.available!==false&&c.available!==false&&c.enabled!==false}))).sort((a:NativeModel,b:NativeModel)=>Number(b.available)-Number(a.available));
 const resources=new Map(sourceNodes.map(n=>[n.id,{kind:n.type,urls:list(n.data?.url)}]));
 for(const n of sourceNodes)for(const [index,url] of list(n.data?.url).entries())if(index>0)resources.set(`${n.id}::saved::${index}`,{kind:n.type,urls:[url]});
  // Source 0wllgknwomk2u.js ty() resolves a group's children through the nodes' own parentId and
  // drops ids that no longer resolve (`r.map(e=>o.get(e)).filter(e=>!!e)`); its fallback is
  // `nodes.filter(e=>e.parentId===group.id)`. So a group only owns a child that exists and either
  // declares this group as its parentId or declares no parent at all. Measured across 959
  // snapshots: all 68 duplicate child ids are stale references (47) or already resolved by an
  // authoritative parentId (21); none are genuinely ambiguous. Reporting them as conflicts
  // rejected 12 cases for a graph the source itself reads without conflict.
  const parents=new Map<string,string>();
  const undeclaredClaims=new Map<string,string[]>();
  for(const n of sourceNodes) for(const child of n.type==='group' ? n.data?.childNodeIds||[] : []) {
   const childNode=byId.get(child);
   if(!childNode)continue;
   if(childNode.parentId){parents.set(child,String(childNode.parentId));continue;}
   undeclaredClaims.set(child,[...(undeclaredClaims.get(child)||[]),String(n.id)]);
  }
  for(const [child,owners] of undeclaredClaims){
   if(owners.length>1)add('multiple-parents','节点存在多个分组',child);
   else parents.set(child,owners[0]);
  }
 for(const e of sourceEdges){
  // Source 1di1-3y--egfx.js collectIncomingNodeDataForTarget resolves each incoming edge with
  // `map(e=>i.get(e.source)).filter(e=>!!e)`: an edge whose endpoint node no longer exists is
  // dropped from the rebuilt request instead of invalidating the node. Measured across 959 local
  // snapshots: 369 such orphan edges in 92 cases, and the missing endpoints appear in no node's
  // parameters outside optional ordering arrays (which tolerate unknown ids). Dropping them here
  // matches the source submit path; a self-loop still has both endpoints and stays an error.
  if(!byId.has(e.source)||!byId.has(e.target)){ignoredConnections.push({fromNodeId:String(e.source),toNodeId:String(e.target),reason:'源collectIncomingNodeDataForTarget以filter(e=>!!e)丢弃端点已不存在的连线'});}
  else if(e.source===e.target)add('invalid-edge','连线缺少有效起止节点',String(e.id));
  else connections.push({id:String(e.id||`edge-${connections.length}`),fromNodeId:e.source,toNodeId:e.target});
 }
 // Graph cycles cannot be executed as a finite native dependency chain.
 const degrees=new Map(sourceNodes.map(n=>[n.id,0]));
 for(const e of connections)degrees.set(e.toNodeId,(degrees.get(e.toNodeId)||0)+1);
 const queue=[...degrees].filter(([,n])=>n===0).map(([id])=>id);let consumed=0;
 while(queue.length){const current=queue.pop();consumed++;for(const e of connections.filter(e=>e.fromNodeId===current)){const left=degrees.get(e.toNodeId)!-1;degrees.set(e.toNodeId,left);if(!left)queue.push(e.toNodeId);}}
 if(consumed!==sourceNodes.length)add('cyclic-workflow','循环依赖需要明确执行边界');
 const adaptations: Array<{nodeId:string;sourceModel:string;targetModel:string;operation:string}>=[];
 for(const original of sourceNodes){
  const d=record(original.data), p=record(d.params);
  const sourceModel=resolveLtvSourceModel(original);
  const submitted=projectLtvSubmittedFields(p,sourceSchemas[`${original.type}:${sourceModel}`],String(original.type));
  const f=normalizeLtvVideoEnhancementFields({...submitted.fields,...(sourceModel?{model:sourceModel}:{})}) as RecordValue;
  const kind=String(original.type), action=String(d.action||'');
  // Source 3iphtl71jy_tw.js ei()/er() removes stale portrait fields when the preset is cleared.
  // Restrict this to explicit null on ordinary generation; absent presets retain their audit gate.
  if(kind==='image'&&action==='image_generate'&&f.scene==='portrait_texture_adjustment'&&p.slashPreset===null){
   delete f.scene;delete f.portraitOptions;
  }
  if(kind==='video-clip'){
   const candidate=timelineCandidates.get(String(original.id));
   if(candidate?.issues.length)for(const issue of candidate.issues)add(issue.code,issue.detail,original.id);
   else add('timeline-adaptation-required',`已解析 ${candidate?.timeline?.clips.length??0} 个原生时间线片段；剪辑节点入口、独立归属及工程持久化尚待接入，不以解析成功计为工程完成`,original.id);
   continue;
  }
  if(!['text','image','video','audio','group'].includes(kind)&&!(kind==='director-console-3d'&&previsImports.has(original.id))){add('unsupported-node',kind,original.id);continue;}
  const parent=original.parentId||parents.get(original.id);
  if(parent&&!byId.has(parent)){add('missing-parent',String(parent),original.id);continue;}
  let x=Number(original.position?.x),y=Number(original.position?.y);
  const seen=new Set([original.id]);let next=original.parentId;
  while(next&&byId.has(next)){
   if(seen.has(next)){add('parent-cycle','分组循环',original.id);break;}seen.add(next);
   const owner=byId.get(next)!;x+=Number(owner.position?.x);y+=Number(owner.position?.y);next=owner.parentId;
  }
  const width=Number(original.width||original.measured?.width||350),height=Number(original.height||original.measured?.height||240);
  if(![x,y,width,height].every(Number.isFinite)||width<=0||height<=0){add('invalid-layout','布局数值无效',original.id);continue;}
  if(kind==='director-console-3d'){
   try{
    if(sourceEdges.some(edge=>edge.target===original.id)||sourceEdges.some(edge=>edge.source===original.id&&String(byId.get(edge.target)?.data?.action||'').endsWith('_generate')))throw new Error('导演台上下游制作输入尚需专用引用协议，不用视频引用代替');
    const prepared=buildLtvPrevisProjectNode(original,previsImports.get(original.id)!,{position:{x,y},width,height,...(parent?{parentId:parent}:{})});
    if(previsScenes.some(scene=>scene.id===prepared.scene.id)||prepared.nodes.some(node=>nodes.some(existing=>existing.id===node.id)||(node.id!==original.id&&byId.has(node.id)))||prepared.connections.some(edge=>connections.some(existing=>existing.id===edge.id)))throw new Error('导演台场景、节点或连接标识冲突');
    previsScenes.push(prepared.scene);nodes.push(...prepared.nodes);connections.push(...prepared.connections);
   }catch(error){add('director-adaptation-required',error instanceof Error?error.message:'导演台完整场景接入失败',original.id);}
   continue;
  }
  const contents=kind==='text'?list(d.content):list(d.url);
  const content=contents[0]||'';
  if(content && kind!=='text' && kind!=='group' && !mediaUrl(content)){add('unrecoverable-media','媒体需可恢复HTTPS地址',original.id);continue;}
  const metadata:CanvasNodeMetadata={content,status:content?'success':'idle'};
  const composition=timelineCandidates.get(String(original.id))?.timeline;
  if(composition)metadata.timelineComposition=composition;
  const embeddedInfo=d.resourceMeta?.items?.[0],savedInfo=original.resourceMeta?.items?.[0];
  // Embedded metadata can contain only the MIME/size; fill absent fields from the same saved version.
  if(embeddedInfo||savedInfo){
   metadata.naturalWidth=embeddedInfo?.width??savedInfo?.width;
   metadata.naturalHeight=embeddedInfo?.height??savedInfo?.height;
   const durationSec=embeddedInfo?.durationSec??savedInfo?.durationSec;
   if(durationSec)metadata.durationMs=durationSec*1000;
  }
  const materializedEdit=action==='image_edit'&&kind==='image'&&content&&!Object.keys(p).length;
  // Source `image_edit` is the LTV image editor's saved node. Measured 2026-09-18 across the 963
  // local snapshots (1862 image_edit nodes in 67 cases): a node whose saved request uses only the
  // ordinary request vocabulary holds the same shape as the sibling `image_generate` nodes of its
  // own case — model, modeType, settings, advancedSettings, count, and an imageList pointing at the
  // picture the editor was opened on. Only the saved action name differs, so a node that also saved
  // its model takes the ordinary generation branch below. A node whose request identity never got
  // saved (no model at all) keeps its saved picture as a result node instead of being handed a
  // fabricated ratio/quality. A node carrying any other saved key — the editor's own `originImage` /
  // `scene` / `mark` / `focusRegion` / `width` / `height` / `infiniteSwitch` / `UI_*` fields and
  // every unmapped parameter alike — keeps the previous `unsupported-operation` report, so the
  // already-decided discard families and their membership do not move.
  const requestVocabulary=new Set([...mappedFields,'settings','advancedSettings']);
  const ordinaryKeys=(value:unknown)=>Object.keys(record(value)).every(key=>requestVocabulary.has(key));
  const plainImageEdit=action==='image_edit'&&kind==='image'&&Object.keys(p).length>0
   &&ordinaryKeys(p)&&ordinaryKeys(p.settings)&&ordinaryKeys(p.advancedSettings);
  const editResultNode=plainImageEdit&&Boolean(content)&&!active(p.model);
  const editGeneration=plainImageEdit&&active(p.model);
  // Keep the editor scene in the report until its model-specific request is bridged.
  // LTV expand-image uploads an already white-padded originImage and saves _outpaintPads
  // beside params. Native OpenAI masked outpaint exists, but is not this nebula scene contract;
  // padding that saved input again or silently switching its model would change the source task.
  if(kind!=='group'&&!action.endsWith('_resource')&&!action.endsWith('_generate')&&!editResultNode&&!editGeneration&&!materializedEdit){
   const scene=typeof p.scene==='string'&&p.scene?`:${p.scene}`:'';
   add('unsupported-operation',`${action||'缺少操作类型'}${action==='image_edit'?scene:''}`,original.id);continue;
  }
  if(action.endsWith('_resource')&&!content&&!composition)add('empty-resource','素材槽需要补充正文或文件；尚不能据此判断源工程损坏',original.id);
  if(action.endsWith('_generate')||editGeneration){
   const invalidSwitches=['search_enabled','searchEnabled','searchable','enableSound'].filter(key=>{
    try{readLtvSwitch(f[key]);return false;}catch{return true;}
   });
   if(invalidSwitches.length){add('invalid-switch-parameter',invalidSwitches.join(','),original.id);continue;}
   const speech=kind==='audio'?mapLtvSpeechOptions(f):null;
   const imageBackground=kind==='image'?mapLtvImageBackground(f):undefined;
   if(imageBackground)metadata.imageBackground=imageBackground;
   const music=kind==='audio'?mapLtvMusicOptions(f):null;
   const nativeScene=kind==='image'?ltvNativeScene(f):null;
   // Source 0wllgknwomk2u.js writes scene:"group-generate" and the storyboard markers itself when
   // materializing nodes, so these values record how the node was created. They are not request
   // fields for any catalog model; only slashPreset repeats the same marker is dropped with them.
   const workflowScene=isLtvWorkflowScene(f.scene);
   const markerKeys=(key:string)=>workflowScene&&(key==='scene'||(key==='slashPreset'&&record(f.slashPreset).scene===f.scene));
   const portrait=kind==='image'&&f.scene==='portrait_texture_adjustment'&&(!f.slashPreset||record(f.slashPreset).scene===f.scene);
   // The 720° panorama preset records the same marker shape, so the saved ratio and quality are kept
   // exactly as submitted while the marker keys and the editor's {{Panorama720}} token are dropped.
    // Source 3iphtl71jy_tw.js `ei()` resolves the stored preset first and then upgrades
    // "720_panoramic" to "720_panoramic_with_prompt" when the prompt has real text, so the saved
    // slashPreset keeps the plain scene while `scene` carries the prompt variant. Both values are
    // the same 720 preset, so either may appear on either side.
    const panoramic=kind==='image'&&isLtvPanoramicScene(f.scene)&&(!f.slashPreset||isLtvPanoramicScene(record(f.slashPreset).scene));
   if(portrait){
    const fields={personSceneFusion:'subject_scene_fusion',lightingFusion:'lighting_fusion',skin:'skin_texture',texture:'surface_texture',sharpness:'sharpness'};
    const settings:Record<string,string>={};
    for(const group of PORTRAIT_TEXTURE_GROUPS){
     const label=record(f.portraitOptions)[fields[group.key]],option=group.options.find(o=>o.label===label);
     if(!option)add('invalid-portrait-options',`人物质感参数未保存或无法映射：${group.key}`,original.id);else settings[group.key]=option.value;
    }
    if(Object.keys(settings).length===PORTRAIT_TEXTURE_GROUPS.length)metadata.portraitTexture=settings as PortraitTextureSettings;
   }
   if(kind==='audio'&&!speech&&!music)add('audio-adapter-required',JSON.stringify({scene:f.scene,operation:f.modeType,sourceModel:f.model,reason:'当前音频适配未覆盖此操作或声音控制；不能用普通TTS替代'}),original.id);
   const needsSearch=enabled(f.search_enabled)||enabled(f.searchEnabled)||enabled(f.searchable);
   let cameraPrompt='';
   if(record(f.cameraControl).enabled){
    const camera=record(f.cameraControl);
    try {
     const focalLength=Number(String(camera.focalLength??camera.focal).replace(/mm$/,'')),aperture=Number(String(camera.aperture).replace(/^f\//,''));
     cameraPrompt=buildCameraPrompt({cameraId:camera.camera,lensId:camera.lens,focalLengthMm:focalLength,apertureF:aperture});
     metadata.cameraControl={enabled:true,camera:camera.camera,lens:camera.lens,focalLength,aperture};
    } catch(e){add('camera-control-required',e instanceof Error?e.message:'镜头参数无效',original.id);continue;}
   }
   // Source handleGenerateAngle submits the angle editor as an image edit whose only direction is
   // `images:[originImage]` plus the three angle values; the canvas already owns the same operation
   // (多角度面板 → buildAnglePrompt), so the saved request is translated onto it. A value the canvas
   // cannot express leaves the keys reported instead of being dropped.
    const angle=kind==='image'?mapLtvAngleOperation(f):null;
    const advanced=record(p.advancedSettings);
    const topazParameters=kind==='image'?mapLtvTopazImageOptions(f,{image:1,video:0,audio:0},1):kind==='video'?mapLtvTopazVideoOptions(f,{image:0,video:1,audio:0},1):undefined;
    const wanxPromptExtend=kind==='video'?mapLtvWanxPromptExtend(f,advanced):undefined;
    const wanxPromptExtendSource=kind==='video'&&isLtvWanxPromptExtendModel(f.model);
    if(wanxPromptExtendSource&&!wanxPromptExtend&&Object.hasOwn(advanced,'extendPrompt'))add('invalid-switch-parameter','extendPrompt',original.id);
      // Seedream 组图开关：只有该节点的档位与操作能被宿主 volcengine-ark-seedream 合同等价承接时
      // 才从 advanced-operation 名单豁免；未核验的高档位/非图像操作仍上报，不静默降档。
      const arkSequential=kind==='image'&&ltvArkImageSequentialDeclared(f);
      const unsupported=Object.entries(advanced).filter(([k,v])=>Object.hasOwn(f,k)&&!k.startsWith('_')&&!(topazParameters&&(kind==='video'?['specifiedModel','fps','slowmo']:['style','scale']).includes(k))&&!speech?.consumed.has(k)&&!music?.consumed.has(k)&&!(arkSequential&&k==='sequential')&&!wanxPromptExtend?.consumed.has(k)&&!(nativeScene&&['scene','slashPreset'].includes(k))&&!(panoramic&&['scene','slashPreset'].includes(k))&&!markerKeys(k)&&!['autoCompliance','search_enabled','searchEnabled','searchable','cameraControl'].includes(k)&&active(v));
   const unsupportedAdvanced=unsupported.filter(([key])=>!(key==='background'&&imageBackground)&&!(key==='fastMode'&&mapLtvOmniHuman(f,{image:1,audio:1,video:0},Number(f.count??1))));
   if(unsupportedAdvanced.length)add('advanced-operation',unsupportedAdvanced.map(([k])=>k).join(','),original.id);
   let plan:LtvReferencePlan, textSlots:ReturnType<typeof ltvReferenceSlotNodeIds>|undefined;
   let resolvedMultiPrompt=f.multi_prompt;
   try{
    const refParams=structuredClone(p),mappedIds=new Map<string,string[]>();
    for(const kind of ['image','video','audio'])for(const ref of refParams[`${kind}List`]||[]){
     const oldId=ref._originalNodeId||ref.nodeId,index=resources.get(ref.nodeId)?.urls.indexOf(ref.url)??-1;
     if(index>0)ref.nodeId=`${oldId}::saved::${index}`;
     if(oldId){const values=mappedIds.get(oldId)||[];if(!values.includes(ref.nodeId))values.push(ref.nodeId);mappedIds.set(oldId,values);}
    }
    for(const key of ['imageListOrder','videoListOrder','audioListOrder','mixedListOrder'])if(Array.isArray(refParams[key]))refParams[key]=refParams[key].flatMap((id:string)=>mappedIds.get(id)||[id]);
      // Source 3iphtl71jy_tw.js `ei()` strips the preset tokens from every saved image prompt before
      // submit; the editor writes them to select a preset and they are never model input text.
      // Source 0zme995kos_wy.js submits `{{CameraPreset N}}` markers on video prompts together with
      // the saved cameraPresets array, whose text the adapter appends below, so the index markers are
      // removed for every modality. A marker with no saved preset is reported, never dropped quietly.
      const savedPrompt=typeof f.prompt==='string'
       ?stripLtvCameraPresetToken(kind==='image'?stripLtvSlashPresetToken(stripLtvPanoramaToken(f.prompt)):f.prompt)
       :f.prompt;
      plan=buildLtvReferencePlan({...refParams,prompt:savedPrompt},resources);
      if(kind==='video'&&Array.isArray(f.multi_prompt))resolvedMultiPrompt=f.multi_prompt.map((shot:unknown)=>{
       const value=record(shot);
       return {...value,prompt:buildLtvReferencePlan({...refParams,prompt:value.prompt},resources).prompt};
      });
      textSlots=ltvReferenceSlotNodeIds(refParams,resources);
    }catch(e){add('invalid-reference',e instanceof Error?e.message:'引用无效',original.id);continue;}
   plan.references=plan.references.map(ref=>{
    const version=resources.get(ref.nodeId)?.urls.indexOf(ref.url)??-1;
    if(version>0)return {...ref,nodeId:`${ref.nodeId}::saved::${version}`};
    return String(byId.get(ref.nodeId)?.data?.action||'').endsWith('_generate')?{...ref,url:'',deferred:true}:ref;
   });
   plan.texts=[];
   if(p.textList!==undefined&&!Array.isArray(p.textList)){add('invalid-text-input','文字输入列表格式无效',original.id);continue;}
   for(const value of p.textList||[]){
    const ref=record(value),owner=byId.get(ref.nodeId),parts=list(ref.content),saved=list(owner?.data?.content);
    // Source collectIncomingNodeData keeps { nodeId, content: [] } for a text node whose output
    // has not been generated. Preserve that dependency; the existing runtime resolver requires
    // upstream success and nonempty text before submitting. Malformed/static inputs stay errors.
    const emptyText=(value:unknown)=>value===''||(Array.isArray(value)&&value.length===0);
    if(owner?.type==='text'&&owner.data?.action==='text_generate'&&emptyText(ref.content)
      &&(owner.data.content===undefined||emptyText(owner.data.content))){
     plan.texts.push({nodeId:ref.nodeId,content:'',deferred:true});
     continue;
    }
    if(!owner||owner.type!=='text'||!parts.length||parts.some(part=>!saved.includes(part))){add('invalid-text-input','文字来源、类型或正文不一致',original.id);continue;}
    for(const part of parts){
     const version=saved.indexOf(part);
     // Source 0zme995kos_wy.js normalizes `{{Mixed N}}` and typed markers only on prompt/multi_prompt;
     // textList is forwarded verbatim, so a saved text body can still hold the editor's index markers.
     // The host appends text bodies straight into the model prompt, so they are rewritten here to the
     // same @图片N labels the prompt uses. An index with no saved slot stays reported, never guessed.
     const resolved=textSlots?resolveLtvMentionTokens(part,textSlots):{text:part,unresolved:[] as string[]};
     if(resolved.unresolved.length)add('unresolved-text-mention',`文字输入含无对应素材的引用 ${[...new Set(resolved.unresolved)].join('、')}；原素材未随工程保存，请重新绑定参考后再生成`,original.id);
     plan.texts.push({nodeId:version>0?`${ref.nodeId}::saved::${version}`:ref.nodeId,content:part,...(resolved.text!==part?{resolved:resolved.text}:{}),...(version===0&&String(owner.data?.action).endsWith('_generate')?{deferred:true as const}:{})});
    }
   }
   const cameraPresetTexts=ltvCameraPresetTexts(f.cameraPresets);
   if(Array.isArray(f.cameraPresets)){
    if(f.cameraPresets.some((preset:RecordValue)=>typeof preset?.prompt!=='string'||!preset.prompt.trim()))add('invalid-camera-preset','运镜预设未保存完整指令',original.id);
    else plan.prompt=[plan.prompt,...f.cameraPresets.map((preset:RecordValue)=>preset.prompt)].filter(Boolean).join('\n\n');
   }
   // The source angle request is a prompt-driven image edit, so its instruction joins the node
   // prompt exactly like a saved camera preset does; the canvas angle editor builds the same kind
   // of text and the node keeps it as its editable prompt.
   if(angle)plan.prompt=[plan.prompt,angle.prompt].filter(Boolean).join('\n\n');
   // The marker is an index into cameraPresets; when that index has no saved preset text the source
   // resolved it from the user's global preset store, which the archived project does not carry.
   // The marker is still removed from the prompt, and the missing instruction is reported so the
   // requirement is never silently shortened.
   const unresolvedPresets=typeof f.prompt==='string'?ltvUnresolvedCameraPresetIndexes(f.prompt,cameraPresetTexts):[];
   if(unresolvedPresets.length)add('missing-camera-preset',`运镜预设 ${unresolvedPresets.join('、')} 未随工程保存，请按原运镜重新填写`,original.id);
   const incoming=connections.filter(e=>e.toNodeId===original.id).map(e=>e.fromNodeId);
   for(const input of incoming){
    const owner=byId.get(input);
    if(owner?.type==='text'&&!plan.texts.some(ref=>ref.nodeId===input||ref.nodeId.startsWith(`${input}::saved::`))){
     const content=list(owner.data?.content)[0]||'';
     // A connected text edge the saved textList did not name still carries the same editor markers.
     const resolved=textSlots?resolveLtvMentionTokens(content,textSlots):{text:content,unresolved:[] as string[]};
     if(resolved.unresolved.length)add('unresolved-text-mention',`文字输入含无对应素材的引用 ${[...new Set(resolved.unresolved)].join('、')}；原素材未随工程保存，请重新绑定参考后再生成`,original.id);
     plan.texts.push({nodeId:input,content,...(resolved.text!==content?{resolved:resolved.text}:{}),...(String(owner.data?.action).endsWith('_generate')?{deferred:true as const}:{})});
    }
   }
   // Source 1di1-3y--egfx.js `ei()` / collectIncomingNodeData rebuilds the media lists from the live
   // incoming edges when the request is submitted, so an edge the saved parameter snapshot did not
   // name is still a real input rather than a broken reference. Measured on the archived set, every
   // such edge (443 across the 88 pending cases, plus 98 nodes whose `params` were never written and
   // which the source never executes at all) carries an existing image/video/audio/text owner whose
   // URL is not held by any saved slot under another id, so nothing is duplicated and no author
   // parameter is invented. Saved slots keep their order and their `{{Mixed N}}` index resolution;
   // the live-only inputs are appended after them, so the prompt rewrite cannot shift an index.
   const savedRef=(input:string)=>plan.references.some(r=>r.nodeId===input||r.nodeId.startsWith(`${input}::saved::`))||(plan.texts||[]).some(r=>r.nodeId===input||r.nodeId.startsWith(`${input}::saved::`));
 for(const input of incoming){
  if(savedRef(input))continue;
  // 保存槽位地址在图里已无节点持有时适配层补过一条内嵌素材节点，而该节点的唯一同类型 live 上游
  // 指的就是同一个逻辑输入（源提交时才用 live 入边重建素材列表）。把它再追加成第二条参考会把
  // 一条输入记成两条，让增强/编辑类合同的数量校验失败。已发布 342 份工程里"保存槽位地址无节点
  // 持有"的节点数为 0（.local/cache/w1103-out.txt），所以这条去重不影响任何已发布工程。
  if(mergedInlineUpstreams.get(original.id)?.has(input))continue;
  const owner=byId.get(input),resource=resources.get(input),ownerKind=String(owner?.type||'');
    // An edge whose owner is a node the host has no media input for cannot become a reference; it
    // stays reported instead of being silently dropped.
    if(!owner||!resource||!['image','video','audio'].includes(ownerKind)||!resource.urls.some(url=>mediaUrl(url))){add('unbound-input','连线输入不在原引用参数内',original.id);continue;}
    // An upstream generation node is bound by id and resolved at run time, exactly like a saved
    // slot whose version is zero; a resource node contributes its saved address.
    const generate=String(owner.data?.action||'').endsWith('_generate');
    plan.references.push({nodeId:input,kind:ownerKind as 'image'|'video'|'audio',url:generate?'':resource.urls[0],...(generate?{deferred:true as const}:{})});
   }
   // Explicit saved versions replace that edge; execution must not add the primary version too.
   for(let i=connections.length-1;i>=0;i--){const edge=connections[i];if(edge.toNodeId===original.id&&[...plan.references,...plan.texts].some(r=>r.nodeId.startsWith(`${edge.fromNodeId}::saved::`))&&![...plan.references,...plan.texts].some(r=>r.nodeId===edge.fromNodeId))connections.splice(i,1);}
   for(const ref of plan.references)if(!incoming.includes(ref.nodeId))connections.push({id:`native-ref-${original.id}-${ref.nodeId}`,fromNodeId:ref.nodeId,toNodeId:original.id});
   for(const ref of plan.texts)if(!connections.some(e=>e.fromNodeId===ref.nodeId&&e.toNodeId===original.id))connections.push({id:`native-text-${original.id}-${ref.nodeId}`,fromNodeId:ref.nodeId,toNodeId:original.id});
   if(nativeScene){
    const hasImage=plan.references.some(ref=>ref.kind==='image');
    const hasStory=Boolean(plan.prompt.trim()||plan.texts.some(ref=>ref.content.trim()||ref.deferred));
    if(hasImage)plan.prompt=[nativeScene.prompt,plan.prompt].filter(Boolean).join('\n\n');
    else if(nativeScene.textPrompt&&hasStory)plan.prompt=[nativeScene.textPrompt,plan.prompt].filter(Boolean).join('\n\n');
    // The source i18n declares "支持文生/参考图生成" for every text-capable preset, and the saved
    // project proves it: a preset with `inputRequirement:"prompt_or_image"` is accepted with either
    // input. A node that carries neither description nor picture is therefore the author's empty
    // slot, not a host gap, so it is reported through the same "waiting for creation text" input
    // family as any other empty node. Only the image-only presets keep the reference-image wording.
    else if(nativeScene.textPrompt)add('empty-prompt',`需要补充创作正文；此场景预设支持文生或参考图，当前既没有正文也没有参考图（场景 ${String(nativeScene.scene)}）`,original.id);
    else add('scene-reference-required','此原生场景模板需要真实参考图，不能用封面代替或忽略图像分支',original.id);
   }
   const maskSource=plan.references.length===1 ? (plan.references[0].url || resources.get(plan.references[0].nodeId)?.urls[0] || '') : '';
   const outputInfo=original.resourceMeta?.items?.[0]||d.resourceMeta?.items?.[0];
   const outputSize=Number.isSafeInteger(outputInfo?.width)&&Number.isSafeInteger(outputInfo?.height)&&outputInfo.width>0&&outputInfo.height>0?`${outputInfo.width}x${outputInfo.height}`:'';
   const maskEdit=kind==='image' ? mapLtvMaskEdit(f,plan,maskSource,outputSize) : undefined;
   const maskOptions=maskEdit ? ltvMaskEditOptions(f,maskEdit,Number(f.count??f.n??1)) : undefined;
   if(maskOptions && maskEdit) plan.prompt=ltvMaskEditPrompt(maskEdit,plan.prompt);
   // Enhancement and edit operations (topaz upscale, volcano upscale, subtitle eraser) take media and
   // settings only: the source spec declares no `prompt` property for them, and every observed node
   // carries a media input with an empty prompt. Requiring creation text there would report a missing
   // input the operation never accepts. Models that do declare `prompt` still need real text.
   const sourceSchema=sourceSchemas[`${original.type}:${sourceModel}`];
   // A schema that omits `prompt` proves the operation takes media/settings only; the same is known
   // for the host enhancement contracts, which never accept creation text. An unknown schema with no
   // such contract keeps the previous behaviour, so a text-driven node is never assumed text-free.
   // (The host enhancement contracts must stay listed here: fixtures exercise them without a schema.)
   const enhancementContracts=new Set(['topaz-image-upscaler','topaz-video-upscaler','volcano-video-upscaler','volcano-subtitle-eraser']);
   const declaresPrompt=(!sourceSchema||typeof sourceSchema!=='object')
    ? !enhancementContracts.has(String(f.model||''))
    : Object.hasOwn(record(record(sourceSchema).properties),'prompt');
   const counts={image:plan.references.filter(r=>r.kind==='image').length,video:plan.references.filter(r=>r.kind==='video').length,audio:plan.references.filter(r=>r.kind==='audio').length};
   const count=Number(f.count??f.n??1);if(!Number.isInteger(count)||count<1||(f.count!==undefined&&f.n!==undefined&&Number(f.count)!==Number(f.n))){add('invalid-count','生成数量无效或字段冲突',original.id);continue;}
   // 保存的 modeType 可能属于作者更早用过的模型（实测：kling-video-o3 的文本残留值 text2video / image2video），
   // 源前端在提交前按当前模型 schema 的可见模态重算一次；这里按同一规则归一，只在能唯一确定时才改写。
   // 不改 `f` 本身：项目过滤与未映射参数判定仍按作者保存的字段面走，只有模态落点采用归一结果。
   const schemaDeclaresQuality=ltvSchemaDeclaresQuality(sourceSchema);
   const modeSchema=readLtvModeSchema(sourceSchema);
   const savedModeType=String(f.modeType||'');
   const resolvedMode=kind==='video'?resolveLtvStaleModeType(savedModeType,counts,modeSchema):undefined;
   // 只在与保存值不同时才算改写：相等时保持 undefined，下游看到的就是作者原值，判定面完全不动。
   const modeOverride=resolvedMode&&resolvedMode!==savedModeType?resolvedMode:undefined;
   const happyHorse=kind==='video'&&['happy-horse-1','happy-horse-1.1'].includes(f.model)
    ? configurableLtvOperation(kind,modeOverride??savedModeType,f,counts,count,schemaDeclaresQuality):undefined;
   if(declaresPrompt&&happyHorse?.ltvExecutionContract!==HAPPYHORSE_FIRST_FRAME_CONTRACT&&!plan.prompt.trim()&&!cameraPrompt&&!metadata.portraitTexture&&!plan.texts.some(ref=>ref.content.trim()||ref.deferred))add('empty-prompt',`需要补充创作正文；操作 ${String(d.generatorType||'default')}，源模型 ${String(f.model||'未保存')}`,original.id);
   const topaz=kind==='image'?mapLtvTopazImageOptions(f,counts,count):kind==='video'?mapLtvTopazVideoOptions(f,counts,count):undefined;
   const volcano=kind==='video'?mapLtvVolcanoVideoEnhance(f,counts,count):undefined;
   const subtitleErase=kind==='video'?mapLtvSubtitleErase(f,counts,count):undefined;
   const omniHuman=kind==='video'?mapLtvOmniHuman(f,counts,count):undefined;
   let kling:Partial<CanvasNodeMetadata>|undefined;
   if(kind==='video'){try{kling=mapLtvKlingOptions({...f,multi_prompt:resolvedMultiPrompt,...(modeOverride?{modeType:modeOverride}:{})},counts,count);}catch{}}
   // 增强类节点的"参数是否已映射"与"原片是否绑定"是两件事：源 schema 只声明 resolution/specifiedModel/
   // fps/slowmo（视频）与 style/scale（图像），这些声明的默认值宿主合同都能等价承接，所以原片缺失时
   // 不能再把它们报成未映射参数，也不能把整条节点落到 model-selection-required——那是"已登记模型未
   // 匹配要求"，与本节点无关。缺原片按输入类缺口上报（empty-resource，仍属可发布）。
   const topazVideoMapped=kind==='video'&&ltvTopazVideoDeclaredFieldsAreMapped(f);
   const topazImageMapped=kind==='image'&&ltvTopazImageRequestIsMapped(f);
    // A topaz-image node without a bound original still carries its declared style/scale, which
    // the contract can express; missing media is reported separately and must not turn these
    // declared parameters into unmapped ones.
    const imageDeclaredMapped=kind==='image'&&ltvTopazImageDeclaredFieldsAreMapped(f);
    // Source angle/edit nodes carry the picture they operate on twice: once in the reference list
    // and once in the flat `images` field (source handleGenerateAngle sends `images` directly).
    // Only the same ordered inputs are a mirror; another saved version on the same resource
    // is not selected merely because it exists. Deferred nodes select their first saved output.
    const imagesMirrored=(()=>{
     const values=Array.isArray(f.images)?f.images:[];
     if(!values.length)return false;
     const selected=plan.references.filter(ref=>ref.kind==='image').map(ref=>
      ref.deferred?resources.get(ref.nodeId)?.urls[0]:ref.url);
     return values.length===selected.length&&values.every((value:unknown,index:number)=>
      typeof value==='string'&&value===selected[index]);
    })();
   // Source 0wllgknwomk2u.js saves the storyboard poster in params.image alongside imageList.
   // Deferred storyboard outputs keep their live node binding; compare its current first output.
   const storyboardImageMirrored=kind==='video'&&f.scene==='group-generate'&&f.modeType==='singleImage2video'
    &&typeof f.image==='string'&&plan.references.length===1&&plan.references[0].kind==='image'
    &&f.image===(plan.references[0].deferred?resources.get(plan.references[0].nodeId)?.urls[0]:plan.references[0].url);
   // handleGenerateErase selects originImage explicitly; its _wm mirror never enters that request.
   const maskFields=maskEdit?.scene==='erase'?['originImage','mark','scene','originImage_wm']:['originImage','mark','scene'];
   const extraFields=Object.entries(f).filter(([key,value])=>!key.startsWith('_')&&!mappedFields.has(key)&&!mirroredMediaFields.has(key)&&!((topaz||topazVideoMapped||topazImageMapped)&&(kind==='video'?['specifiedModel','fps','slowmo']:['style','scale']).includes(key))&&!(imageDeclaredMapped&&['style','scale'].includes(key))&&!(imagesMirrored&&key==='images')&&!(kling&&['multi_shot','keep_original_sound',...(kling.videoKling?.multiPrompt?['multi_prompt']:[])].includes(key))&&!(arkSequential&&key==='sequential')&&!wanxPromptExtend?.consumed.has(key)&&!speech?.consumed.has(key)&&!music?.consumed.has(key)&&!(maskOptions&&maskFields.includes(key))&&!(nativeScene&&['scene','slashPreset'].includes(key))&&!(panoramic&&['scene','slashPreset'].includes(key))&&!markerKeys(key)&&!(portrait&&['scene','slashPreset','portraitOptions'].includes(key))&&!(angle&&['horizontal_angle','vertical_angle','zoom'].includes(key))&&active(value));
   const unmappedFields=extraFields.filter(([key])=>!(key==='image'&&storyboardImageMirrored)&&!(key==='background'&&imageBackground)&&!(volcano&&key==='fps')&&!(omniHuman&&key==='fastMode')&&!(subtitleErase&&['mode','erase_ratio_location'].includes(key)));
   if(unmappedFields.length)add('unmapped-production-parameters',unmappedFields.map(([key])=>key).join(','),original.id);
   // 该模型的源 schema 没有声明 `quality` 时，节点上的 quality 是更早模型留下的残留值、不参与提交，
   // 不能据此判成"档位没有落点"（ltv-mode-type.ts 里记了实测口径）。
   if(kind==='video'&&active(f.quality)&&!kling&&schemaDeclaresQuality)add('video-quality-adapter-required',JSON.stringify({quality:f.quality,sourceModel:f.model,reason:'源视频质量档位不能直接当作图片quality，也不能被时长或分辨率替代；当前视频协议尚未映射该档位'}),original.id);
   let selected:NativeModel|undefined, options:Partial<CanvasNodeMetadata>={},operation=modeOverride??String(f.modeType||'');
   if(kind==='image'&&!operation)operation=counts.image?'image2image':'text2image';
    const effectivePrompt=[metadata.portraitTexture?buildPortraitTexturePrompt(plan.prompt,metadata.portraitTexture):plan.prompt,cameraPrompt,...plan.texts.map(ref=>ltvTextReferenceBody(ref))].filter(Boolean).join('\n\n');
   const searchOptions=needsSearch?configurableLtvOperation(kind,operation,f,counts,count,schemaDeclaresQuality):undefined;
   if(needsSearch&&!searchOptions?.imageGrounding&&!searchOptions?.videoWebSearch)add('search-option-unmapped',JSON.stringify({sourceModel:f.model,reason:'此操作的联网辅助尚无完整目标协议，保留原要求，不关闭开关放行'}),original.id);
  if(kind==='video'&&String(f.model).startsWith('omnihuman-')){
   options=omniHuman??{};
  }else if(f.model==='volcano-subtitle-eraser'){
   options=subtitleErase??{};
   if(effectivePrompt.trim()||plan.texts.some(ref=>ref.deferred))add('unmapped-production-parameters','字幕擦除不接收创作文本，不能忽略原文字要求',original.id);
  }else if(f.model==='volcano-video-upscaler'){
   options=volcano??{};
   if(effectivePrompt.trim()||plan.texts.some(ref=>ref.deferred))add('unmapped-production-parameters','视频超分不接收创作文本，不能忽略原文字要求',original.id);
  }else if(f.model==='topaz-video-upscaler'){
   if(topaz){options=topaz;selected=models.find(m=>m.capability==='video'&&m.protocol==='topaz-video-enhance'&&m.modelKey===topaz.videoEnhancement?.model);}
   // 声明的增强参数全部可承接，但节点上没有绑定任何原片：这是缺输入（原片未随工程保存或被上游顶掉），
   // 不是"已登记模型未匹配要求"。按输入类缺口上报；合同选项与渠道缺口由下面的
   // configurableLtvOperation 补齐，作者绑定原片并配置 Topaz 渠道后即可生成。
   else if(topazVideoMapped&&count===1&&!counts.video&&!counts.image&&!counts.audio)add('empty-resource','Topaz视频增强缺少原片，请绑定要增强的视频后再生成',original.id);
   if(effectivePrompt.trim()||plan.texts.some(ref=>ref.deferred))add('unmapped-production-parameters','Topaz视频增强不接收创作文本，不能静默忽略文字要求',original.id);
  }else if(f.model==='topaz-image-upscaler'){
   if(topaz){options=topaz;selected=models.find(m=>m.capability==='image'&&m.protocol==='topaz-image-enhance'&&m.modelKey===topaz.imageEnhancement?.model);}
   else if(topazImageMapped&&count===1&&!counts.image&&!counts.video&&!counts.audio)add('empty-resource','Topaz图像增强缺少原图，请绑定要放大的图片后再生成',original.id);
   if(effectivePrompt.trim()||plan.texts.some(ref=>ref.deferred))add('unmapped-production-parameters','Topaz增强接口不接收提示词，原文字制作要求需要核对，不能静默忽略',original.id);
  }else if(kind==='video'&&/^happy-?horse-/i.test(String(f.model))){
    // An unsupported HappyHorse request must not fall through to a substitute provider.
    options=happyHorse??{};
  }else if(kind==='video'&&/^kling-/.test(String(f.model))){
    // Refusing a source version must not select an unrelated video model.
    options=kling??{};
  }
   else if(searchOptions?.imageGrounding||searchOptions?.videoWebSearch){
    options=searchOptions;
   }else if(maskOptions){
    options=maskOptions;
    // The native multipart edits contract forwards exact pixels independently
    // of quality. Missing model declarations are configuration, not a missing adapter.
    selected=models.find(model=>{
     if(model.capability!=='image'||model.protocol!=='openai-image')return false;
     const cap=record(model.capabilityConfig?.image),refs=record(cap.references),size=record(cap.size);
     return refs.maskSupported===true&&Array.isArray(size.values)&&size.values.includes(outputSize)
      &&Number.isFinite(refs.maxImages)&&refs.maxImages>=counts.image&&Number(refs.minImages??0)<=counts.image
      &&Number.isFinite(refs.promptMaxChars)&&effectivePrompt.length<=refs.promptMaxChars
      &&Number.isInteger(cap.maxOutputs)&&count<=cap.maxOutputs
      &&(imageBackground!=='transparent'||cap.transparentBackground?.supported===true);
    });
   }
   else if(kind==='image'&&arkSequential&&['text2image','image2image'].includes(operation)&&!counts.video&&!counts.audio){
    const configured=configurableLtvOperation(kind,operation,f,counts,count,schemaDeclaresQuality);
    if(configured){
     options=configured;
     // Do not substitute another Seedream version or an OpenAI-compatible protocol.
     selected=models.find(model=>{
      if(!model.available||model.capability!=='image'||model.protocol!=='volcengine-ark-image'||model.modelKey!==f.model)return false;
      const cap=record(model.capabilityConfig?.image),refs=record(cap.references),size=record(cap.size);
      return Array.isArray(size.values)&&size.values.includes(configured.size)
       &&Number.isFinite(refs.maxImages)&&counts.image<=refs.maxImages&&Number(refs.minImages??0)<=counts.image
       &&Number.isFinite(refs.promptMaxChars)&&effectivePrompt.length<=refs.promptMaxChars
       &&Number.isInteger(cap.maxOutputs)&&count<=cap.maxOutputs
       &&(imageBackground!=='transparent'||cap.transparentBackground?.supported===true);
     });
    }
   }
   else if(kind==='image'&&['nebula-ultra','nebula-2-flash'].includes(f.model)&&String(f.ratio).trim().toLowerCase()==='auto'){
    // Automatic framing retains the source Gemini contract, even with OpenAI channels configured.
    // Invalid tiers/references must reach the unmapped gate, not a substitute model.
    options=configurableLtvOperation(kind,operation,f,counts,count,schemaDeclaresQuality)??{};
   }
   else if(kind==='image' && ['text2image','image2image'].includes(operation) && !counts.video&&!counts.audio){
    for(const model of models.filter(m=>m.capability==='image'&&m.protocol==='openai-image')){
     const cap=record(model.capabilityConfig?.image),refs=record(cap.references);
     if(imageBackground==='transparent'&&!cap.transparentBackground?.supported)continue;
     if(counts.image>Number(refs.maxImages)||count>Number(cap.maxOutputs)||effectivePrompt.length>Number(refs.promptMaxChars))continue;
     const ratio=String(f.ratio||'1:1');let size=ratio;
     const resolution=String(f.resolution||(/^[124]K$/.test(String(f.quality))?f.quality:''));
     // OpenAI-compatible sources retain declared auto dimensions and quality.
     // Nebula automatic framing is handled above and must not enter this candidate loop.
     const automaticSize=/^auto$/i.test(ratio.trim());
     // OpenAI quality is not a resolution tier. With automatic framing there are no exact
     // dimensions to carry a separately requested 1K/2K/4K value; do not silently drop it.
     if(automaticSize&&resolution)continue;
     if(resolution&&!automaticSize){
      // Reuse the unbound contract's exact ratio/tier conversion; model availability must not change framing.
      const configured=configurableLtvOperation(kind,operation,f,counts,count,schemaDeclaresQuality);
      if(configured?.ltvExecutionContract!=='openai-image'||typeof configured.size!=='string')continue;
      size=configured.size;
      if(!(cap.size?.values||[]).includes(size)&&cap.size?.allowCustom!==true)continue;
     }else if(!(cap.size?.values||[]).includes(size))continue;
     const quality=['low','medium','high','auto'].includes(f.quality)?f.quality:'high';
     if(!(cap.quality?.values||[]).includes(quality))continue;
     selected=model;options={size,quality,count,ltvExecutionContract:'openai-image',strictGenerationOptions:['model','size','quality','count']};
     break;
    }
   }else if(kind==='video'&&(/^(?:MiniMax-Hailuo-|vidu)/i.test(String(f.model)))){
    // A generic video catalogue must not substitute a different model/version.
    // Keep the provider contract and require an explicit compatible selection.
    options=configurableLtvOperation(kind,operation,f,counts,count,schemaDeclaresQuality)??{};
   }else if(kind==='video'&&count===1){
    const op=({text2video:'text_to_video',image2video:'image_to_video',singleImage2video:'image_to_video',frames2video:'image_to_video',mixed2video:'reference_to_video'} as Record<string,string>)[operation];
    for(const model of models.filter(m=>m.capability==='video'&&(wanxPromptExtendSource?m.protocol===LTV_WANX_PROMPT_EXTEND_PROVIDER:['ctmo-video','wan968-video','autodl-h3-video','newapi-channel-2'].includes(m.protocol)))){
     if(wanxPromptExtendSource&&!wanxPromptExtend)continue;
     // Only the documented Artdance contract preserves an explicit false sound option.
     if(model.protocol==='newapi-channel-2'&&!/^Artdance 2\.5-(480p|720p|1080p)$/.test(model.modelKey))continue;
     if(operation==='frames2video'&&(model.protocol!=='newapi-channel-2'||counts.image<1||counts.image>2||counts.video||counts.audio))continue;
     const cap=record(model.capabilityConfig?.video),refs=record(cap.references),seconds=Number(f.duration),duration=record(cap.duration);
     const resolution=(cap.resolutions||[]).find((value:unknown)=>typeof value==='string'&&value.toLowerCase()===String(f.resolution).toLowerCase());
     if(!op||!(cap.operations||[]).includes(op)||!(cap.ratios||[]).includes(f.ratio)||!resolution)continue;
     if(!Number.isFinite(seconds)||(Array.isArray(duration.values)?!duration.values.includes(seconds):!(seconds>=duration.min&&seconds<=duration.max&&(!duration.step||(seconds-duration.min)%duration.step===0))))continue;
     if(enabled(f.enableSound)&&!cap.generateAudio?.supported)continue;
     if(counts.image<Number(refs.minImages||0))continue;
     // This older H3 workflow does not transmit the prompt; it cannot carry a prompted case.
     if(model.protocol==='autodl-h3-video'&&model.modelKey==='minimax_h3_image_audio_to_video')continue;
     if(effectivePrompt.length>Number(refs.promptMaxChars)||counts.image>Number(refs.maxImages)||counts.video>Number(refs.maxVideos)||counts.audio>Number(refs.maxAudios))continue;
     if(model.protocol==='ctmo-video'&&counts.audio&&!counts.image)continue;
     if(plan.references.some(r=>r.kind!=='image'&&!r.deferred&&(!r.durationSec||r.durationSec>Number(refs[r.kind==='video'?'maxVideoDurationSeconds':'maxAudioDurationSeconds']))))continue;
     selected=model;options={size:f.ratio,seconds:String(seconds),vquality:resolution,generateAudio:enabled(f.enableSound)?'true':'false',videoEditOperation:op as CanvasNodeMetadata['videoEditOperation'],strictGenerationOptions:['model','size','seconds','vquality','generateAudio'],...(wanxPromptExtend?{wanxPromptExtend:wanxPromptExtend.wanxPromptExtend,ltvExecutionContract:LTV_WANX_PROMPT_EXTEND_CONTRACT}:{})};break;
    }
   }else if(kind==='text'&&!counts.audio&&count<=15){
    selected=models.find(m=>{
     const refs=record(m.capabilityConfig?.text?.references);
     return m.capability==='text'&&m.protocol==='openai-response'&&effectivePrompt.length<=Number(refs.promptMaxChars)&&counts.image<=Number(refs.maxImages||0)&&counts.video<=Number(refs.maxVideos||0);
    });
    options={textCount:count,strictGenerationOptions:['model']};
   }
   else if(kind==='audio'&&speech&&count===1&&!counts.image&&!counts.video&&!counts.audio){
    selected=models.find(m=>m.capability==='audio'&&(f.model==='vocal-v3'?m.protocol==='elevenlabs-v3-audio'&&m.modelKey==='eleven_v3':f.model==='speech-2.8-hd'?m.protocol==='minimax-speech28-audio'&&m.modelKey==='speech-2.8-hd':m.protocol==='openai-audio'));options=speech.options;
   }
   if(!selected){
    const configurable=maskOptions??kling??configurableLtvOperation(kind,operation,f,counts,count,schemaDeclaresQuality);
    if(music&&count===1&&!counts.image&&!counts.video&&!counts.audio){
     if(music.options.ltvExecutionContract==='mureka-instrumental'&&(!effectivePrompt.trim()||Array.from(effectivePrompt).length>1024)){add('audio-adapter-required','Mureka原音乐描述超出非空及1024字符合同，不能截断',original.id);continue;}
     options=music.options;add('channel-configuration-required',JSON.stringify({channelId:'',modelKey:music.options.audioMusic?.provider==='mureka-instrumental'?'mureka-8':'',protocol:music.options.ltvExecutionContract,reason:'保留音乐曲长和描述；请配置音乐渠道并明确选择实际模型版本，不自动替换原模型'}),original.id);
    }
    else if(configurable){options=configurable;add('channel-configuration-required',JSON.stringify({channelId:'',modelKey:'',protocol:configurable.ltvExecutionContract,operation,references:counts,promptChars:effectivePrompt.length,options:configurable,reason:'映雪已有该操作的提交链路，当前目录未匹配全部规格；配置满足参数与参考要求的模型后，在此节点明确选择，提交前仍检查协议与能力'}),original.id);}
    else if(kind==='text'&&!counts.audio&&count<=15)add('channel-configuration-required',JSON.stringify({channelId:'',modelKey:'',protocol:'openai-response',references:counts,promptChars:effectivePrompt.length,textCount:count,reason:'原生文字任务支持图文与视频参考；需配置并选择已登记对应参考能力的文字模型，未选择或能力不足时阻止生成'}),original.id);
    else if(kind==='audio'&&speech&&count===1&&!counts.image&&!counts.video&&!counts.audio)add('channel-configuration-required',JSON.stringify({channelId:'',modelKey:'',protocol:speech.options.ltvExecutionContract??'openai-audio',voice:options.audioVoice,reason:'已保留语音参数，请配置支持该音色的语音渠道并在节点选择模型；未选择前严格阻止生成'}),original.id);
    else {add('model-selection-required',JSON.stringify({kind,operation,generator:String(d.generatorType||'default'),sourceModel:String(f.model||''),ratio:f.ratio,resolution:f.resolution,quality:f.quality,duration:f.duration,sound:f.enableSound,count,references:counts,promptChars:effectivePrompt.length,reason:'已登记模型未匹配这些要求；需区分渠道配置、规格和转换器映射，不代表映雪底座不支持'}),original.id);continue;}
   }
   if(selected&&!selected.available)add('channel-configuration-required',JSON.stringify({channelId:selected.channelId,modelKey:selected.modelKey,reason:'参数和执行适配已匹配，渠道或模型未启用'}),original.id);
   if(kind==='video'&&(operation==='frames2video'||operation==='singleImage2video'&&['kling-o1-video','kling-v3-turbo-video','kling-v26-video','minimax-hailuo02-video','vidu-q2-pro-video'].includes(options.ltvExecutionContract||''))){
    const frames=plan.references.filter(ref=>ref.kind==='image');
    Object.assign(options,{videoEditOperation:'image_to_video',videoStartFrameNodeId:frames[0]?.nodeId,videoEndFrameNodeId:frames[1]?.nodeId});
   }
   Object.assign(metadata,options,{generationMode:kind,prompt:plan.prompt,composerContent:plan.prompt,model:selected?`${selected.channelId}::${selected.modelKey}`:'',ltvReferencePlan:plan});
   adaptations.push({nodeId:original.id,sourceModel:String(f.model||''),targetModel:metadata.model!,operation});
  }
  nodes.push({id:original.id,type:(kind==='group'?CanvasNodeType.Frame:kind) as CanvasNodeType,title:d.name||kind,position:{x,y},width,height,...(parent?{parentId:parent}:{}),metadata});
  for(let version=1;version<contents.length;version++){
   const saved=contents[version],versionId=`${original.id}::saved::${version}`;
   if(byId.has(versionId)||!saved||(kind!=='text'&&!mediaUrl(saved))){add('invalid-saved-output','历史产物地址或ID无效',original.id);continue;}
   nodes.push({id:versionId,type:kind as CanvasNodeType,title:`${d.name||kind} · 版本 ${version+1}`,position:{x:x+version*(width+32),y},width,height,...(parent?{parentId:parent}:{}),metadata:{content:saved,status:'success'}});
  }
 }
 if(new Set(nodes.map(node=>node.id)).size!==nodes.length)add('invalid-ids','转换后的节点ID冲突，不发布不完整工程');
 const project={version:1,id,title,nodes,connections,...(previsScenes.length?{previsScenes}:{}),adaptation:{engine:'yingxue',sourceNodeCount:originalNodeCount,generationNodes:adaptations.length,models:adaptations,...(ignoredConnections.length?{ignoredConnections}:{})}};
 for(const node of nodes)for(const clip of node.metadata?.timelineComposition?.clips??[]){
  if(!nodes.some(source=>source.id===clip.nodeId&&source.type===clip.kind))add('timeline-adaptation-required','时间线源节点尚未完整适配，保留剪辑但不计为可用工程',node.id);
 }
 const finalDegrees=new Map(nodes.map(n=>[n.id,0]));
 for(const e of connections)finalDegrees.set(e.toNodeId,(finalDegrees.get(e.toNodeId)||0)+1);
 const pending=[...finalDegrees].filter(([,degree])=>degree===0).map(([key])=>key);let reachable=0;
 while(pending.length){const current=pending.pop();reachable++;for(const e of connections.filter(e=>e.fromNodeId===current)){const degree=finalDegrees.get(e.toNodeId)!-1;finalDegrees.set(e.toNodeId,degree);if(!degree)pending.push(e.toNodeId);}}
 if(sourceNodes.every(n=>nodes.some(node=>node.id===n.id)) && reachable!==nodes.length)add('cyclic-reference-dependency','参数引用形成循环，不能执行');
 if(new TextEncoder().encode(JSON.stringify({project})).length>5*1024*1024)add('project-size-limit','超过映雪5MiB保存限制');
 const readiness=summarizeLtvReadiness(issues);
 const adoptable=['ready','input-required','configuration-required'].includes(readiness.status);
 return {supported:issues.length===0,adoptable,issues,project,readiness};
}
