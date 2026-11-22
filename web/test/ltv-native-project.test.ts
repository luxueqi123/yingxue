import {test} from 'node:test';
import assert from 'node:assert/strict';
import {adaptLtvNativeProject} from '../src/lib/canvas/ltv-native-project';
const catalog={channels:[{id:'native',models:[{modelKey:'native-image',available:true,capability:'image',protocol:'openai-image',capabilityConfig:{image:{maxOutputs:4,references:{maxImages:4,promptMaxChars:1000},size:{values:['1:1','2048x2048']},quality:{values:['high','medium','auto']}}}}]}]};
const snapshot=()=>({nodes:[{id:'image',type:'image',position:{x:10,y:20},data:{action:'image_generate',name:'海报',url:[],params:{model:'source-private-name',modeType:'text2image',prompt:'海报',count:1,settings:{ratio:'1:1',resolution:'2K'},advancedSettings:{autoCompliance:1}}}}],edges:[] as any[]});

test('same-project asset locator reaches the native reference graph without replacing its version',()=>{
 const source:any=snapshot();
 source.nodes[0].data.params.modeType='image2image';
 source.nodes[0].data.params.imageList=[{nodeId:'asset://asset-one',url:'asset://asset-one'}];
 const donor=structuredClone(source.nodes[0]);donor.id='donor';
 donor.data.params.imageList=[{nodeId:'external',assetId:'asset-one',url:'https://example.test/original.png'}];
 source.nodes.push(donor);
 const before=JSON.stringify(source);
 const result=adaptLtvNativeProject(source,catalog,'case','案例');
 assert.equal(result.supported,true,JSON.stringify(result.issues));
 const target=result.project.nodes.find(node=>node.id==='image')!;
 const ref=target.metadata!.ltvReferencePlan!.references[0];
 assert.equal(ref.url,'https://example.test/original.png');
 assert.ok(result.project.connections.some(edge=>edge.fromNodeId===ref.nodeId&&edge.toNodeId==='image'));
 assert.equal(JSON.stringify(source),before);
});
test('adapts by native operation instead of requiring source model identity',()=>{
 const source=snapshot(),before=JSON.stringify(source);const result=adaptLtvNativeProject(source,catalog,'case','案例');
 assert.equal(result.supported,true);assert.equal(result.project.nodes[0].metadata?.model,'native::native-image');
 assert.equal(result.project.nodes[0].metadata?.size,'2048x2048');assert.equal(JSON.stringify(source),before);
 assert.equal(result.project.nodes[0].metadata?.generationMode,'image');
});

test('serialized search requirements are retained and invalid switches reject the case',()=>{
 for(const value of ['1','true']){
  const source:any=snapshot();source.nodes[0].data.params.advancedSettings.searchable=value;
  const result=adaptLtvNativeProject(source,catalog,'case','案例');
  assert.equal(result.project.nodes[0].metadata?.imageGrounding?.provider,'google-search');
 }
 const source:any=snapshot();source.nodes[0].data.params.advancedSettings.searchable='unknown';
 const result=adaptLtvNativeProject(source,catalog,'case','案例');
 assert.equal(result.adoptable,false);
 assert.ok(result.issues.some(issue=>issue.code==='invalid-switch-parameter'));
});

test('image action without a saved mode uses its actual reference inputs',()=>{
 const s:any=snapshot();delete s.nodes[0].data.params.modeType;
 const result=adaptLtvNativeProject(s,catalog,'case','案例');
 assert.equal(result.supported,true);assert.equal(result.project.adaptation.models[0].operation,'text2image');
});

test('group membership follows the source parentId rule and ignores stale child ids',()=>{
 // Source 0wllgknwomk2u.js ty() resolves children through the child's own parentId and drops ids
 // that no longer resolve. A stale id or a second group merely listing an already-parented child
 // must not be reported as a conflict, but two groups really claiming an unparented child must be.
 const owned=(id:string,parentId?:string)=>({id,type:'image',...(parentId?{parentId}:{}),position:{x:0,y:0},data:{action:'image_resource',url:[`https://example.test/${id}`]}});
 const stale:any=snapshot();
 stale.nodes.push({id:'g1',type:'group',position:{x:0,y:0},data:{childNodeIds:['child','ghost']}},
  {id:'g2',type:'group',position:{x:0,y:0},data:{childNodeIds:['child']}},
  owned('child','g1'),owned('ghost','g1'));
 stale.nodes.at(-1).data.action='image_resource';
 const source:any=structuredClone(stale);
 source.nodes=source.nodes.filter((node:any)=>node.id!=='ghost');
 const resolved=adaptLtvNativeProject(source,catalog,'case','案例');
 assert.ok(!resolved.issues.some(issue=>issue.code==='multiple-parents'),JSON.stringify(resolved.issues));
 assert.equal(resolved.project.nodes.find(node=>node.id==='child')?.parentId,'g1');
 const ambiguous:any=snapshot();
 ambiguous.nodes.push({id:'g1',type:'group',position:{x:0,y:0},data:{childNodeIds:['child']}},
  {id:'g2',type:'group',position:{x:0,y:0},data:{childNodeIds:['child']}},owned('child'));
 const conflict=adaptLtvNativeProject(ambiguous,catalog,'case','案例');
 assert.ok(conflict.issues.some(issue=>issue.code==='multiple-parents'&&issue.nodeId==='child'));
});

test('video resolution case is normalized without dropping a source quality tier',()=>{
 const s:any=snapshot();s.nodes[0].type='video';s.nodes[0].data.action='video_generate';
 s.nodes[0].data.params={prompt:'场景',modeType:'text2video',ratio:'16:9',resolution:'1080P',duration:5,count:1};
 const native={channels:[{id:'video',models:[{modelKey:'Artdance 2.5-1080p',capability:'video',protocol:'newapi-channel-2',capabilityConfig:{video:{operations:['text_to_video'],ratios:['16:9'],resolutions:['1080p'],duration:{values:[5]},references:{promptMaxChars:1000,maxImages:30,maxVideos:10,maxAudios:10}}}}]}]};
 const result=adaptLtvNativeProject(s,native,'case','案例');assert.equal(result.supported,true,JSON.stringify(result.issues));
 assert.equal(result.project.nodes[0].metadata?.vquality,'1080p');
 s.nodes[0].data.params.quality='high';
 assert.ok(adaptLtvNativeProject(s,native,'case','案例').issues.some(issue=>issue.code==='video-quality-adapter-required'));
});

test('text output count uses the native text batch field',()=>{
 const s:any=snapshot();s.nodes[0].type='text';s.nodes[0].data.action='text_generate';
 s.nodes[0].data.params={prompt:'写三个方案',count:3};
 const native={channels:[{id:'text',models:[{modelKey:'writer',capability:'text',protocol:'openai-response',capabilityConfig:{text:{references:{promptMaxChars:1000}}}}]}]};
 const result=adaptLtvNativeProject(s,native,'case','案例');
 assert.equal(result.supported,true,JSON.stringify(result.issues));assert.equal(result.project.nodes[0].metadata?.textCount,3);
});

test('multimodal text uses native references and missing vision configuration retains the graph',()=>{
 const s:any=snapshot();s.nodes[0].type='text';s.nodes[0].data.action='text_generate';
 s.nodes[0].data.params={prompt:'根据 {{Image 1}} 分析构图',count:1,imageList:[{nodeId:'ref',url:'https://example.test/ref.png'}]};
 const pending=adaptLtvNativeProject(s,{channels:[]},'case','案例');
 assert.equal(pending.adoptable,true,JSON.stringify(pending.issues));assert.equal(pending.readiness.status,'configuration-required');
 assert.equal(pending.project.nodes[0].metadata?.model,'');assert.equal(pending.project.nodes.length,2);
 assert.equal(pending.project.nodes[0].metadata?.ltvReferencePlan?.references[0].nodeId,'ref');
 const native={channels:[{id:'text',models:[{modelKey:'vision',capability:'text',protocol:'openai-response',capabilityConfig:{text:{references:{promptMaxChars:1000,maxImages:1,maxVideos:0}}}}]}]};
 const result=adaptLtvNativeProject(s,native,'case','案例');
 assert.equal(result.supported,true,JSON.stringify(result.issues));assert.equal(result.project.nodes[0].metadata?.model,'text::vision');
 s.nodes[0].data.params.count=16;
 assert.equal(adaptLtvNativeProject(s,native,'case','案例').adoptable,false);
});

test('legacy reference URL arrays select the source first version while keeping all saved outputs',()=>{
 const s:any=snapshot();s.nodes[0].data.params={prompt:'参考 {{Image 1}}',modeType:'image2image',ratio:'1:1',imageList:[{nodeId:'ref',url:['https://example.test/one','https://example.test/two']}]};
 s.nodes.push({id:'ref',type:'image',position:{x:0,y:0},data:{action:'image_resource',url:['https://example.test/one','https://example.test/two']}});
 const result=adaptLtvNativeProject(s,catalog,'case','案例');
 assert.equal(result.supported,true,JSON.stringify(result.issues));
 assert.equal(result.project.nodes[0].metadata?.ltvReferencePlan?.references[0].url,'https://example.test/one');
 assert.ok(result.project.nodes.some(node=>node.metadata?.content==='https://example.test/two'));
});

test('first and last frames use the existing explicit-frame video protocol',()=>{
 const source={nodes:[{id:'video',type:'video',position:{x:0,y:0},data:{action:'video_generate',params:{modeType:'frames2video',prompt:'连续过渡',ratio:'16:9',resolution:'720p',duration:5,enableSound:'on',imageList:[{nodeId:'first',url:'https://example.test/first'},{nodeId:'last',url:'https://example.test/last'}]}}}],edges:[]};
 const native={channels:[{id:'native',models:[{modelKey:'Artdance 2.5-720p',protocol:'newapi-channel-2',capability:'video',capabilityConfig:{video:{operations:['image_to_video'],ratios:['16:9'],resolutions:['720p'],duration:{values:[5]},generateAudio:{supported:true},references:{promptMaxChars:1000,maxImages:30,maxVideos:10,maxAudios:10}}}}]}]};
 const result=adaptLtvNativeProject(source,native,'case','案例');
 assert.equal(result.supported,true,JSON.stringify(result.issues));
 const metadata=result.project.nodes[0].metadata!;
 assert.equal(metadata.videoStartFrameNodeId,'first');assert.equal(metadata.videoEndFrameNodeId,'last');assert.equal(metadata.videoEditOperation,'image_to_video');assert.equal(metadata.generateAudio,'true');
});

test('mixed video imports uploaded inputs with matching nodes, order and executable edges',()=>{
 const source={nodes:[{id:'video',type:'video',position:{x:0,y:0},data:{action:'video_generate',params:{modeType:'mixed2video',prompt:'{{Mixed 1}} 的运镜，{{Mixed 2}} 的主体',ratio:'16:9',resolution:'1080P',duration:5,mixedList:[{mediaType:'video',url:'https://example.test/motion',durationSec:4},{mediaType:'image',url:'https://example.test/subject'}]}}}],edges:[]};
 const native={channels:[{id:'native',models:[{modelKey:'Artdance 2.5-1080p',protocol:'newapi-channel-2',capability:'video',capabilityConfig:{video:{operations:['reference_to_video'],ratios:['16:9'],resolutions:['1080p'],duration:{values:[5]},references:{promptMaxChars:1000,maxImages:30,maxVideos:10,maxAudios:10,maxVideoDurationSeconds:15}}}}]}]};
 const result=adaptLtvNativeProject(source,native,'case','案例');
 assert.equal(result.supported,true,JSON.stringify(result.issues));
 assert.equal(result.project.nodes.length,3);assert.equal(result.project.connections.length,2);
 assert.equal(result.project.nodes[0].metadata?.prompt,'@视频1 的运镜，@图片1 的主体');
 for(const ref of result.project.nodes[0].metadata!.ltvReferencePlan!.references)assert.equal(result.project.nodes.find(node=>node.id===ref.nodeId)?.metadata?.content,ref.url);
});
test('drops orphan edges like the source reader and still rejects unsupported active creative options',()=>{
 // Source 1di1-3y--egfx.js collectIncomingNodeDataForTarget rebuilds inputs with
 // `map(e=>i.get(e.source)).filter(e=>!!e)`, so an edge whose endpoint node is gone is dropped
 // rather than failing the node. A self-loop still has both endpoints and must stay rejected.
 const s=snapshot();s.edges.push({id:'missing',source:'missing',target:'image'});
 const dropped=adaptLtvNativeProject(s,catalog,'case','案例');
 assert.equal(dropped.supported,true,JSON.stringify(dropped.issues));
 assert.ok(!dropped.project.connections.some(edge=>edge.fromNodeId==='missing'));
 assert.ok(dropped.project.adaptation.ignoredConnections?.some(entry=>entry.fromNodeId==='missing'&&entry.toNodeId==='image'));
 const loop=snapshot();loop.edges.push({id:'loop',source:'image',target:'image'});
 assert.equal(adaptLtvNativeProject(loop,catalog,'case','案例').supported,false);
 const advanced=snapshot();Object.assign(advanced.nodes[0].data.params.advancedSettings,{search_enabled:1});
 const converted=adaptLtvNativeProject(advanced,catalog,'case','案例');
 assert.ok(converted.issues.some(x=>x.code==='channel-configuration-required'));
 assert.equal(converted.project.nodes[0].metadata?.imageGrounding?.provider,'google-search');
 assert.equal(converted.project.nodes[0].metadata?.model,'');
});
test('text inputs and camera direction survive conversion without changing source',()=>{
 const s:any=snapshot();s.nodes.push({id:'text',type:'text',position:{x:0,y:0},data:{action:'text_resource',content:['剧本第一段','剧本第二段']}});
 s.nodes[0].data.params.textList=[{nodeId:'text',content:['剧本第二段','剧本第一段']}];
 s.nodes[0].data.params.cameraControl={enabled:true,camera:'arri_alexa_65',lens:'canon_k35',focal:'75mm',aperture:'f/4'};
 const before=JSON.stringify(s),result=adaptLtvNativeProject(s,catalog,'case','案例');
 assert.equal(result.supported,true,JSON.stringify(result.issues));
 const meta=result.project.nodes[0].metadata!;
 assert.deepEqual(meta.ltvReferencePlan!.texts!.map(x=>x.content),['剧本第二段','剧本第一段']);
 assert.equal(meta.cameraControl?.camera,'arri_alexa_65');assert.equal(meta.cameraControl?.focalLength,75);
 assert.equal(meta.prompt,'海报');
 assert.equal(JSON.stringify(s),before);
});
test('explicit saved media versions and inline uploads are bound to their own nodes',()=>{
 const s:any=snapshot();s.nodes.push({id:'ref',type:'image',position:{x:0,y:0},data:{action:'image_resource',url:['https://example.test/a','https://example.test/b']}});
 s.nodes[0].data.params.imageList=[{nodeId:'ref',url:'https://example.test/b'},{url:'https://example.test/upload'}];
 s.nodes[0].data.params.prompt='@图片1 和 @图片2';s.edges.push({source:'ref',target:'image'});
 const result=adaptLtvNativeProject(s,catalog,'case','案例');assert.equal(result.supported,true,JSON.stringify(result.issues));
 const refs=result.project.nodes[0].metadata!.ltvReferencePlan!.references;
 assert.equal(refs[0].nodeId,'ref::saved::1');
 for(const ref of refs){assert.equal(result.project.nodes.find(n=>n.id===ref.nodeId)?.metadata?.content,ref.url);assert.ok(result.project.connections.some(e=>e.fromNodeId===ref.nodeId&&e.toNodeId==='image'));}
 assert.ok(!result.project.connections.some(e=>e.fromNodeId==='ref'&&e.toNodeId==='image'));
});
test('does not publish a partial project or lose multiple saved outputs',()=>{
 const s=snapshot();Object.assign(s.nodes[0].data,{url:['https://example.test/1.png','https://example.test/2.png']});
 const multi=adaptLtvNativeProject(s,catalog,'case','案例');
 assert.equal(multi.supported,true);assert.equal(multi.project.nodes.length,2);
 assert.equal(multi.project.nodes[1].metadata?.content,'https://example.test/2.png');
 const special=snapshot();special.nodes[0].type='director-console-3d';
 assert.ok(adaptLtvNativeProject(special,catalog,'case','案例').issues.some(x=>x.code==='unsupported-node'));
});
test('unavailable native channels never become a runnable preselection',()=>{
 const disabled=JSON.parse(JSON.stringify(catalog));disabled.channels[0].models[0].available=false;
 const result=adaptLtvNativeProject(snapshot(),disabled,'case','案例');
 assert.equal(result.supported,false);
 assert.equal(result.readiness.status,'configuration-required');
 assert.deepEqual(result.issues.map(issue=>issue.code),['channel-configuration-required']);
 assert.equal(result.project.nodes.length,1);
 assert.equal(result.adoptable,true);
});

test('configuration and missing input may coexist without discarding the production graph',()=>{
 const disabled=JSON.parse(JSON.stringify(catalog));disabled.channels[0].enabled=false;
 const s=snapshot();s.nodes[0].data.params.prompt='';
 const result=adaptLtvNativeProject(s,disabled,'case','案例');
 assert.equal(result.readiness.status,'configuration-required');
 assert.equal(result.adoptable,true);
 assert.equal(result.project.nodes[0].metadata?.model,'native::native-image');
});

test('plain reference nodes preserve the full text and are available as native text inputs',()=>{
 const s:any=snapshot();s.nodes.push({id:'ref',type:'reference',position:{x:0,y:0},data:{action:'reference_node',content:['镜头要求原文']}});
 s.edges.push({source:'ref',target:'image'});
 const result=adaptLtvNativeProject(s,catalog,'case','案例');
 assert.equal(result.supported,true,JSON.stringify(result.issues));
 assert.equal(result.project.nodes.find(n=>n.id==='ref')?.type,'text');
 assert.equal(result.project.nodes[0].metadata?.ltvReferencePlan?.texts?.[0].content,'镜头要求原文');
 assert.equal(s.nodes[1].type,'reference');
});

test('search option does not short circuit source and parameter checks',()=>{
 const s:any=snapshot();s.nodes[0].data.params.advancedSettings.search_enabled=true;
 s.nodes[0].data.params.prompt='';
 const result=adaptLtvNativeProject(s,catalog,'case','案例');
 assert.ok(result.issues.some(issue=>issue.code==='channel-configuration-required'));
 assert.ok(result.issues.some(issue=>issue.code==='empty-prompt'));
 assert.equal(result.readiness.status,'configuration-required');
 assert.ok(result.readiness.requirements.some(issue=>issue.category==='input'));
 assert.equal(result.readiness.permanentlyIncompatible,false);
});

test('audio adapter work is not misreported as absent host audio capability',()=>{
 const s:any=snapshot();s.nodes[0].type='audio';s.nodes[0].data.action='audio_generate';
 s.nodes[0].data.params={model:'mureka-8',scene:'Music',modeType:'lyrics2audio',prompt:''};
 const result=adaptLtvNativeProject(s,{channels:[]},'case','案例');
 assert.ok(result.issues.some(issue=>issue.code==='audio-adapter-required'));
 assert.ok(result.issues.some(issue=>issue.code==='empty-prompt'));
 assert.ok(!result.issues.some(issue=>['unconfigured-audio','native-capability-missing'].includes(issue.code)));
});

test('unregistered matching model remains unresolved rather than proven incompatible',()=>{
 const result=adaptLtvNativeProject(snapshot(),{channels:[]},'case','案例');
 assert.equal(result.readiness.status,'configuration-required');
 assert.equal(result.project.nodes[0].metadata?.model,'');
 assert.equal(result.project.nodes[0].metadata?.size,'2048x2048');
 assert.equal(result.project.nodes[0].metadata?.ltvExecutionContract,'openai-image');
 assert.equal(result.readiness.permanentlyIncompatible,false);
});

test('fillable prompt templates retain their executable node and strict model settings',()=>{
 const s=snapshot();s.nodes[0].data.params.prompt='';
 const result=adaptLtvNativeProject(s,catalog,'case','案例');
 assert.equal(result.supported,false);
 assert.equal(result.adoptable,true);
 assert.equal(result.readiness.status,'input-required');
 assert.equal(result.project.nodes[0].metadata?.generationMode,'image');
 assert.equal(result.project.nodes[0].metadata?.prompt,'');
 assert.equal(result.project.nodes[0].metadata?.model,'native::native-image');
 assert.ok(result.project.nodes[0].metadata?.strictGenerationOptions?.includes('model'));
});
test('portrait settings use the existing native operation and reject unknown labels',()=>{
 const s:any=snapshot();Object.assign(s.nodes[0].data.params,{scene:'portrait_texture_adjustment',slashPreset:{scene:'portrait_texture_adjustment'},portraitOptions:{subject_scene_fusion:'自然融合',lighting_fusion:'自然匹配',skin_texture:'自然肤质',surface_texture:'自然纹理',sharpness:'标准清晰'}});
 const result=adaptLtvNativeProject(s,catalog,'case','案例');assert.equal(result.supported,true,JSON.stringify(result.issues));
 assert.equal(result.project.nodes[0].metadata!.portraitTexture!.personSceneFusion,'natural');
 s.nodes[0].data.params.portraitOptions.skin_texture='未知';
 assert.ok(adaptLtvNativeProject(s,catalog,'case','案例').issues.some(i=>i.code==='invalid-portrait-options'));
});

test('explicitly cleared portrait preset keeps ordinary generation without inventing portrait controls',()=>{
 const s:any=snapshot();Object.assign(s.nodes[0].data.params,{scene:'portrait_texture_adjustment',slashPreset:null,portraitOptions:{skin_texture:'未知'}});
 const before=JSON.stringify(s);
 const result=adaptLtvNativeProject(s,catalog,'case','案例');
 assert.equal(result.supported,true,JSON.stringify(result.issues));
 assert.equal(result.project.nodes[0].metadata?.portraitTexture,undefined);
 assert.equal(result.project.nodes[0].metadata?.prompt,'海报');
 assert.equal(JSON.stringify(s),before);
 delete s.nodes[0].data.params.slashPreset;
 assert.ok(adaptLtvNativeProject(s,catalog,'case','案例').issues.some(i=>i.code==='invalid-portrait-options'));
});
test('historical URLs remain independent snapshots instead of silently substituting current outputs',()=>{
 const s:any=snapshot();s.nodes.push({id:'ref',type:'image',position:{x:0,y:0},data:{action:'image_resource',url:['https://example.test/new']}});
 s.nodes[0].data.params.imageList=[{nodeId:'ref',url:'https://example.test/old'}];s.nodes[0].data.params.imageListOrder=['ref'];s.edges.push({source:'ref',target:'image'});
 const result=adaptLtvNativeProject(s,catalog,'case','案例');assert.equal(result.supported,true,JSON.stringify(result.issues));
 const ref=result.project.nodes[0].metadata!.ltvReferencePlan!.references[0];
 assert.equal(ref.url,'https://example.test/old');assert.notEqual(ref.nodeId,'ref');
 assert.equal(result.project.nodes.find(n=>n.id===ref.nodeId)!.metadata!.content,ref.url);
});

test('historical text references retain the exact submitted versions without using current text',()=>{
 const s:any=snapshot();s.nodes.push({id:'text',type:'text',position:{x:0,y:0},data:{action:'text_generate',name:'剧本',content:['现在的剧本'],params:{prompt:'重写剧本'}}});
 s.nodes[0].data.params.textList=[{nodeId:'text',content:['当时的剧本','当时的补充']}];s.edges.push({source:'text',target:'image'});
 const result=adaptLtvNativeProject(s,catalog,'case','案例');
 const refs=result.project.nodes.find(n=>n.id==='image')!.metadata!.ltvReferencePlan!.texts!;
 assert.deepEqual(refs.map(r=>r.content),['当时的剧本','当时的补充']);
 assert.ok(refs.every(r=>r.nodeId!=='text'&&!r.deferred));
 assert.ok(refs.every(r=>result.project.nodes.some(n=>n.id===r.nodeId&&n.metadata?.content===r.content)));
 assert.ok(!result.project.connections.some(e=>e.fromNodeId==='text'&&e.toNodeId==='image'));
 assert.equal(s.nodes[1].data.content[0],'现在的剧本');
});

test('saved reference payloads recover missing resource nodes and their original edges',()=>{
 const s:any=snapshot();s.nodes[0].data.params.imageList=[{nodeId:'missing-image',url:'https://example.test/reference.png'}];
 s.nodes[0].data.params.textList=[{nodeId:'missing-text',content:['原始参考文字']}];
 s.edges.push({source:'missing-image',target:'image'},{source:'missing-text',target:'image'});
 const result=adaptLtvNativeProject(s,catalog,'case','案例');
 assert.equal(result.supported,true,JSON.stringify(result.issues));
 assert.equal(result.project.nodes.find(n=>n.id==='missing-image')?.metadata?.content,'https://example.test/reference.png');
 assert.equal(result.project.nodes.find(n=>n.id==='missing-text')?.metadata?.content,'原始参考文字');
 assert.equal(result.project.nodes.find(n=>n.id==='missing-image')?.metadata?.generationMode,undefined);
 assert.equal(s.nodes.length,1);
});

test('speech template without a channel retains controls and cannot select a default model silently',()=>{
 const s:any=snapshot();s.nodes[0].type='audio';s.nodes[0].data.action='audio_generate';
 s.nodes[0].data.params={model:'source-speech',scene:'Text-to-Speech',modeType:'text2audio',prompt:'原始旁白',advancedSettings:{voice_setting_voice_id:{voiceId:'narrator'},voice_setting_speed:1.25,voice_setting_vol:1}};
 const result=adaptLtvNativeProject(s,{channels:[]},'case','案例');
 assert.equal(result.adoptable,true,JSON.stringify(result.issues));
 assert.equal(result.readiness.status,'configuration-required');
 const metadata=result.project.nodes[0].metadata!;
 assert.equal(metadata.audioVoice,'narrator');assert.equal(metadata.audioSpeed,'1.25');
 assert.equal(metadata.model,'');assert.ok(metadata.strictGenerationOptions?.includes('model'));
 s.nodes[0].data.params.advancedSettings.voice_modify_pitch=2;
 assert.equal(adaptLtvNativeProject(s,{channels:[]},'case','案例').adoptable,false);
});

test('a saved reference slot whose id the snapshot no longer carries is not counted twice',()=>{
 // 源提交时才用 live 入边重建素材列表；保存槽位地址在整张图里没有节点持有时，适配层补一条
 // 内嵌素材节点，它和同节点的 live 入边是同一条逻辑输入，必须只算一条参考。
 // 实测 2026-09-19：case-cdd799b0 的 kling-video-o3 节点因此把 2 张参考记成 4 张，frames2video
 // 数量超限，误落 model-selection-required；已发布 357 份工程里该形状命中 0。
 const native={channels:[{id:'native',models:[{modelKey:'Artdance 2.5-720p',protocol:'newapi-channel-2',capability:'video',capabilityConfig:{video:{operations:['image_to_video'],ratios:['16:9'],resolutions:['720p'],duration:{values:[5]},generateAudio:{supported:true},references:{promptMaxChars:1000,maxImages:1,maxVideos:10,maxAudios:10}}}}]}]};
 const url='https://example.test/one.png';
 const video=(id:string)=>({id,type:'video',position:{x:0,y:0},data:{action:'video_generate',params:{modeType:'frames2video',model:'source-video',prompt:'过渡',ratio:'16:9',resolution:'720p',duration:5,imageList:[{nodeId:'ghost',url}]}}});
 const source:any={nodes:[video('first'),video('second'),{id:'live',type:'image',position:{x:0,y:0},data:{action:'image_resource',url:[url]}}],edges:[{source:'live',target:'second'}]};
 const result=adaptLtvNativeProject(source,native,'case','案例');
 // 没有 live 入边的节点本来就只有保存槽位这一条参考。
 assert.equal(result.project.nodes.find(n=>n.id==='first')?.metadata?.ltvReferencePlan?.references?.length,1,JSON.stringify(result.issues));
 // 有 live 入边持有同一地址时，内嵌槽位与那条入边是同一条输入。
 assert.equal(result.project.nodes.find(n=>n.id==='second')?.metadata?.ltvReferencePlan?.references?.length,1,JSON.stringify(result.issues));
 assert.equal(result.adoptable,true,JSON.stringify(result.issues));
});
