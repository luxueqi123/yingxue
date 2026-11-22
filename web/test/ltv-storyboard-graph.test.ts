import { expect, test } from 'bun:test';
import { adaptLtvNativeProject } from '../src/lib/canvas/ltv-native-project';
import { prepareLtvStoryboardGraph } from '../src/lib/canvas/ltv-storyboard-graph';

const snapshot = () => ({nodes:[
    {id:'script',type:'script',position:{x:0,y:0},width:800,height:400,data:{name:'原分镜',action:'script_generate',
        params:{model:'source-text',scene:'script-generate',prompt:'原拆镜要求',count:1},
        imageGenConfig:{model:'source-image',settings:{ratio:'9:16',quality:'4K'}},
        linkedImageGroupId:'group',shotColumns:[{field:'duration_seconds',label:'时长',description:'保留浮点时长'}],
        rows:[{id:'display-id',hiddenUuid:'stable-row',shotNumber:1,durationSeconds:4.5,imageGenerationPrompt:'原图像提示词',
            characters:[{characterName:'人物',characterAssetId:'',characterImageUrl:'https://example.test/actor.png'}]}]}},
    {id:'group',type:'group',position:{x:900,y:0},width:500,height:400,data:{name:'图像组',childNodeIds:['image']}},
    {id:'image',type:'image',parentId:'group',position:{x:40,y:40},width:320,height:240,data:{name:'镜头1',action:'image_generate',
        scriptRowHiddenUuid:'stable-row',url:[],params:{model:'source-image',scene:'group-generate',modeType:'text2image',prompt:'原图像提示词',
            count:2,settings:{ratio:'16:9',quality:'2K'},imageList:[]}}},
],edges:[]});

test('source script becomes an editable native table with stable existing output ids and original child parameters',()=>{
    const source=snapshot(),before=JSON.stringify(source);
    const result=adaptLtvNativeProject(source,{channels:[]},'case','分镜案例');
    const script=result.project.nodes.find(node=>node.id==='script')!, image=result.project.nodes.find(node=>node.id==='image')!;
    expect(JSON.stringify(source)).toBe(before);
    expect(script.type).toBe('script');
    expect(script.metadata?.storyboard?.rows[0].imageNodeId).toBe('image');
    expect(script.metadata?.storyboard?.rows[0].durationSeconds).toBe(4.5);
    expect(script.metadata?.storyboard?.rows[0].assetBindings).toEqual([]);
    expect(script.metadata?.ltvStoryboardSource?.imageGenerationConfig).toEqual(source.nodes[0].data.imageGenConfig);
    expect(image.metadata?.count).toBe(2);
    expect(script.metadata?.storyboardImageDefaults?.count).toBe(1);
    const [defaultWidth,defaultHeight]=script.metadata!.storyboardImageDefaults!.size!.split('x').map(Number);
    expect(defaultWidth/defaultHeight).toBe(9/16);
    const [width,height]=image.metadata!.size!.split('x').map(Number);
    expect(width/height).toBe(16/9);
    expect(image.metadata?.ltvReferencePlan?.references).toEqual([]);
    expect(result.project.connections.some(edge=>edge.fromNodeId==='script'&&edge.toNodeId==='image'&&edge.storyboardRowId==='stable-row'&&edge.relation==='storyboard-output')).toBe(true);
    expect(result.project.adaptation.sourceNodeCount).toBe(3);
    expect(result.adoptable).toBe(true);
    expect(result.issues.filter(issue=>issue.code!=='channel-configuration-required')).toEqual([]);
    expect(script.metadata?.storyboardViews?.map(view=>view.type)).toEqual(['table','creative']);
});

test('missing source image selection remains explicit configuration and private template controls do not become defaults',()=>{
    const source=snapshot();delete source.nodes[0].data.imageGenConfig;
    const missing=adaptLtvNativeProject(source,{channels:[]},'case','分镜案例');
    expect(missing.project.nodes.find(node=>node.id==='script')?.metadata?.storyboardImageDefaults?.model).toBe('');
    for(const issue of missing.issues.filter(issue=>issue.code==='channel-configuration-required')) expect(()=>JSON.parse(issue.detail)).not.toThrow();
    const templated=snapshot();Object.assign(templated.nodes[0].data.imageGenConfig!,{fineTuneType:'template',fineTuneModels:[{uuid:'private-template',weight:0.8}]});
    const blocked=adaptLtvNativeProject(templated,{channels:[]},'case','分镜案例');
    expect(blocked.project.nodes.find(node=>node.id==='script')?.metadata?.storyboardImageDefaults).toBeUndefined();
    expect(blocked.issues.some(issue=>issue.detail.includes('fineTuneModels'))).toBe(true);
    expect(blocked.adoptable).toBe(false);
});

test('unknown row output id does not silently fall back to row position',()=>{
    const source=snapshot();source.nodes[2].data.scriptRowHiddenUuid='foreign-row';
    const result=prepareLtvStoryboardGraph(source);
    expect(result.scripts.get('script')?.storyboard.rows[0].imageNodeId).toBeUndefined();
    expect(result.issues.some(issue=>issue.code==='storyboard-output-unmapped')).toBe(true);
    expect(result.outputConnections).toEqual([]);
});

test('legacy positional fallback follows actual image children and ignores stale group membership',()=>{
    const source:any=snapshot();delete source.nodes[2].data.scriptRowHiddenUuid;
    source.nodes[1].data.childNodeIds=['foreign-image','note','image'];
    source.nodes.push(
        {id:'foreign-image',type:'image',parentId:'other',data:{name:'0',action:'image_resource',url:[]}},
        {id:'note',type:'text',parentId:'group',data:{name:'0',action:'text_resource',content:'组内说明'}},
    );
    const result=prepareLtvStoryboardGraph(source);
    expect(result.scripts.get('script')?.storyboard.rows[0].imageNodeId).toBe('image');
    expect(result.outputConnections.map(edge=>edge.toNodeId)).toEqual(['image']);
    expect(result.issues).toEqual([]);
});

test('malformed source group order is explicit rather than crashing the whole catalogue',()=>{
    const source:any=snapshot();source.nodes[1].data.childNodeIds={image:1};
    const result=prepareLtvStoryboardGraph(source);
    expect(result.issues.some(issue=>issue.code==='storyboard-output-unmapped')).toBe(true);
});

test('multiple explicit outputs retain all row links and source first frame for the native multi-output consumers',()=>{
    const source:any=snapshot();
    source.nodes[2].data.name='分镜 #9';
    source.nodes[2].data.url=['https://example.test/nine.png'];
    const alternate=structuredClone(source.nodes[2]);
    alternate.id='alternate';alternate.data.name='分镜 #6';alternate.data.url=['https://example.test/six.png'];
    source.nodes.push(alternate);
    source.nodes[1].data.childNodeIds=['image','alternate'];
    const before=JSON.stringify(source);
    const prepared=prepareLtvStoryboardGraph(source);
    expect(prepared.scripts.get('script')?.storyboard.rows[0].imageNodeId).toBe('alternate');
    expect(prepared.outputConnections.map(edge=>edge.toNodeId)).toEqual(['image','alternate']);
    expect(new Set(prepared.outputConnections.map(edge=>edge.id)).size).toBe(2);
    expect(prepared.outputConnections.every(edge=>edge.storyboardRowId==='stable-row')).toBe(true);
    expect(prepared.issues).toEqual([]);
    const adapted=adaptLtvNativeProject(source,{channels:[]},'case','多输出');
    expect(adapted.project.connections.filter(edge=>edge.relation==='storyboard-output')).toHaveLength(2);
    expect(adapted.project.nodes.find(node=>node.id==='image')?.metadata?.content).toBe('https://example.test/nine.png');
    expect(adapted.project.nodes.find(node=>node.id==='alternate')?.metadata?.content).toBe('https://example.test/six.png');
    expect(adapted.adoptable).toBe(true);
    expect(JSON.stringify(source)).toBe(before);
    alternate.data.url=[];
    expect(prepareLtvStoryboardGraph(source).scripts.get('script')?.storyboard.rows[0].imageNodeId).toBe('image');
});

test('positional legacy output never replaces an explicit first-frame binding merely because its name sorts first',()=>{
    const source:any=snapshot();
    source.nodes[0].data.rows.unshift({hiddenUuid:'other',shotNumber:1,plotDescription:'Other row'});
    source.nodes[0].data.rows[1].shotNumber=2;
    source.nodes[2].data.name='分镜 #9';source.nodes[2].data.url=['https://example.test/explicit.png'];
    const positional=structuredClone(source.nodes[2]);positional.id='positional';positional.data.name='分镜 #1';delete positional.data.scriptRowHiddenUuid;
    source.nodes.push(positional);source.nodes[1].data.childNodeIds=['image','positional'];
    const result=prepareLtvStoryboardGraph(source);
    expect(result.outputConnections.filter(edge=>edge.storyboardRowId==='stable-row')).toHaveLength(2);
    expect(result.scripts.get('script')?.storyboard.rows[1].imageNodeId).toBe('image');
});

test('video-story resource retains source frame, exact timing, column schema and independent audio/camera semantics',()=>{
    const source={nodes:[
        {id:'video',type:'video',position:{x:0,y:0},data:{action:'video_resource',url:['https://example.test/source.mp4']}},
        {id:'story',type:'video-story',position:{x:400,y:0},data:{action:'video_story_resource',name:'视频故事',sourceVideoNodeId:'video',shotColumns:[{field:'start_time',label:'开始',description:'秒'}],rows:[
            {shot_number:1,start_time:1.25,end_time:3.75,duration:2.5,visual_description:'画面',content:'叙事',shot_size:'近景',camera_angle:'俯拍',camera_movement:'横移',focal_depth:'浅景深',lighting:'冷光',audio_music:'弦乐',audio_voice:'对白',image_generation_prompt:'image',video_motion_prompt:'motion',frameUrl:'https://example.test/frame.jpg'},
        ]}},
    ],edges:[]};
    const before=JSON.stringify(source);
    const mapped=prepareLtvStoryboardGraph(source);
    expect(JSON.stringify(source)).toBe(before);
    expect(mapped.issues).toEqual([]);
    expect(mapped.scripts.get('story')?.sourceKind).toBe('video-story');
    expect(mapped.scripts.get('story')?.storyboard.rows[0]).toMatchObject({
        durationSeconds:2.5,sourceStartMs:1250,sourceEndMs:3750,keyframeTimeMs:1250,
        narrativeIntent:'叙事',motion:'横移',
        videoReference:{startTime:1.25,endTime:3.75,referenceFrameImage:'https://example.test/frame.jpg'},
    });
    expect(mapped.scripts.get('story')?.storyboard.rows[0].audioEffects).toContain('背景音乐：弦乐');
    expect(mapped.scripts.get('story')?.storyboard.rows[0].audioEffects).toContain('人声/音效：对白');
    expect(mapped.scripts.get('story')?.storyboard.rows[0].camera).toContain('景深：浅景深');
    expect(mapped.scripts.get('story')?.storyboard.visibleColumns).toContain('narrativeIntent');
    expect(mapped.snapshot.nodes[1].data.action).toBe('text_resource');
    expect(mapped.referenceConnections).toMatchObject([{fromNodeId:'video',toNodeId:'story'}]);
    const adapted=adaptLtvNativeProject(source,{channels:[]},'case','案例');
    expect(adapted.issues).toEqual([]);
    expect(adapted.project.nodes.find(node=>node.id==='story')?.metadata?.ltvStoryboardSource?.videoStory?.rows).toEqual(source.nodes[1].data.rows);
    expect(adapted.project.connections.some(edge=>edge.fromNodeId==='video'&&edge.toNodeId==='story')).toBe(true);
});

test('video-story malformed or missing original semantics remain explicit blockers',()=>{
    const source:any={nodes:[{id:'story',type:'video-story',position:{x:0,y:0},data:{action:'video_story_resource',sourceVideoNodeId:'missing',shotColumns:[{field:'future',label:'?',description:''}],rows:[{shot_number:1,start_time:2,end_time:1,duration:2,frameUrl:'http://example.test/frame'}]}}],edges:[]};
    const result=adaptLtvNativeProject(source,{channels:[]},'case','案例');
    expect(result.issues.some(issue=>issue.code==='video-story-source-unmapped')).toBe(true);
    expect(result.issues.some(issue=>issue.code==='video-story-field-unmapped')).toBe(true);
    expect(result.issues.some(issue=>issue.code==='unsupported-node')).toBe(false);
    expect(result.adoptable).toBe(false);
});

test('video-story decimal time strings and an absent optional frame retain the original table',()=>{
    const source:any={nodes:[
        {id:'video',type:'video',position:{x:0,y:0},data:{action:'video_resource',url:['https://example.test/source.mp4']}},
        {id:'story',type:'video-story',position:{x:400,y:0},data:{action:'video_story_resource',sourceVideoNodeId:'video',shotColumns:[],rows:[
            {shot_number:1,start_time:'0.0',end_time:'0.8',duration:'0.8',visual_description:'开场'},
            {shot_number:2,start_time:'0.8',end_time:'1.8',duration:'1.0',frameUrl:''},
        ]}},
    ],edges:[]};
    const before=JSON.stringify(source);
    const result=adaptLtvNativeProject(source,{channels:[]},'case','原视频分析');
    expect(result.issues).toEqual([]);
    const metadata=result.project.nodes.find(node=>node.id==='story')!.metadata!;
    expect(metadata.storyboard!.rows[0]).toMatchObject({durationSeconds:0.8,sourceStartMs:0,sourceEndMs:800,
        videoReference:{startTime:0,endTime:0.8,referenceFrameImage:''}});
    expect(metadata.storyboard!.rows[1]).toMatchObject({durationSeconds:1,sourceStartMs:800,sourceEndMs:1800});
    expect(metadata.ltvStoryboardSource!.videoStory!.rows).toEqual(source.nodes[1].data.rows);
    expect(JSON.stringify(source)).toBe(before);
    for(const invalid of ['', ' ', '0.8 seconds', '0x10', null, true]){
        const changed=structuredClone(source);changed.nodes[1].data.rows[0].duration=invalid;
        expect(adaptLtvNativeProject(changed,{channels:[]},'case','bad').issues.some(issue=>issue.code==='video-story-field-unmapped')).toBe(true);
    }
    for(const frame of [null, {}, 'http://example.test/frame', 'asset://unresolved']){
        const changed=structuredClone(source);changed.nodes[1].data.rows[0].frameUrl=frame;
        expect(adaptLtvNativeProject(changed,{channels:[]},'case','bad').issues.some(issue=>issue.detail.includes('frameUrl'))).toBe(true);
    }
});

test('restored video-story source edge participates in graph cycle validation',()=>{
    const source:any={nodes:[
        {id:'video',type:'video',position:{x:0,y:0},data:{action:'video_resource',url:['https://example.test/source.mp4']}},
        {id:'story',type:'video-story',position:{x:0,y:0},data:{action:'video_story_resource',sourceVideoNodeId:'video',shotColumns:[],rows:[]}},
    ],edges:[{id:'reverse',source:'story',target:'video'}]};
    const result=adaptLtvNativeProject(source,{channels:[]},'case','案例');
    expect(result.issues.some(issue=>issue.code==='cyclic-workflow')).toBe(true);
    expect(result.adoptable).toBe(false);
});
