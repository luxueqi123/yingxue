import { mapLtvStoryboardRows, ltvStoryboardColumns, ltvStoryboardSourceColumns } from './ltv-storyboard';
import type { CanvasConnection, StoryboardData, StoryboardRow } from '../../types/canvas';
import { mapLtvStoryboardViews } from './ltv-storyboard-views';
import { mapLtvStoryboardReferenceTracks } from './ltv-storyboard-asset-references';

type SourceNode = Record<string, any>;
type Issue = { nodeId?: string; code: string; detail: string };
const videoStoryColumns = new Set(['shot_number','start_time','end_time','duration','visual_description','content','shot_size','camera_angle','camera_movement','focal_depth','lighting','audio_music','audio_voice','image_generation_prompt','video_motion_prompt','frameUrl']);
const videoStoryNodeFields = new Set(['type','name','rows','shotColumns','sourceVideoNodeId','action','nodeWidth','nodeHeight','_updatedAtMs','_lastAppliedFullyAtMs']);
const videoStoryTextFields = ['visual_description','content','shot_size','camera_angle','camera_movement','focal_depth','lighting','audio_music','audio_voice','image_generation_prompt','video_motion_prompt'] as const;

// Source row normalization accepts decimal strings. Do not inherit parseFloat's partial parsing
// ("0.8 seconds"), or Number's coercion of null/empty text into a valid zero-second boundary.
function videoStoryNumber(value: unknown): number {
    if(typeof value==='number')return value;
    return typeof value==='string'&&/^\d+(?:\.\d+)?$/.test(value.trim())?Number(value):NaN;
}

function mapVideoStory(source: SourceNode, nodes: SourceNode[], issues: Issue[]) {
    const data=source.data || {}, rows: StoryboardRow[]=[];
    const add=(code:string,detail:string)=>issues.push({nodeId:source.id,code,detail});
    if(data.action!=='video_story_resource') add('video-story-field-unmapped',`操作 ${String(data.action)} 不是原视频故事资源`);
    for(const key of Object.keys(data))if(!videoStoryNodeFields.has(key))add('video-story-field-unmapped',`节点字段 ${key} 尚未映射`);
    const sourceVideo=nodes.find(node=>node.id===data.sourceVideoNodeId);
    if(!sourceVideo || sourceVideo.type!=='video')add('video-story-source-unmapped',`原视频节点 ${String(data.sourceVideoNodeId)} 缺失或不是视频`);
    if(!Array.isArray(data.shotColumns)||data.shotColumns.some((input:unknown)=>{
        const column=input as Record<string,unknown>;
        return !column||typeof column!=='object'||typeof column.field!=='string'||!videoStoryColumns.has(column.field)
            ||typeof column.label!=='string'||typeof column.description!=='string'||Object.keys(column).some(key=>!['field','label','description'].includes(key));
    })||new Set(data.shotColumns.map((column:SourceNode)=>column.field)).size!==data.shotColumns.length) add('video-story-field-unmapped','原视频故事列定义不完整或含未知列');
    if(!Array.isArray(data.rows))add('video-story-field-unmapped','原视频故事缺少镜头行数组');
    for(const [index,input] of (Array.isArray(data.rows)?data.rows:[]).entries()){
        const row=input && typeof input==='object'&&!Array.isArray(input)?input as SourceNode:{};
        const path=`rows[${index}]`;
        for(const key of Object.keys(row))if(!videoStoryColumns.has(key))add('video-story-field-unmapped',`${path}.${key} 尚未映射`);
        for(const key of videoStoryTextFields)if(row[key]!==undefined&&typeof row[key]!=='string')add('video-story-field-unmapped',`${path}.${key} 不是文字`);
        const start=videoStoryNumber(row.start_time),end=videoStoryNumber(row.end_time),duration=videoStoryNumber(row.duration),shot=videoStoryNumber(row.shot_number);
        if(typeof start!=='number'||typeof end!=='number'||typeof duration!=='number'||typeof shot!=='number'
            ||!Number.isFinite(start)||!Number.isFinite(end)||!Number.isFinite(duration)||!Number.isInteger(shot)
            ||start<0||end<=start||duration<=0||shot<1||Math.abs((end-start)-duration)>0.001)
            add('video-story-field-unmapped',`${path} 镜号或秒级时序无效`);
        const frame=row.frameUrl===undefined?'':row.frameUrl;
        // The source may save timing/analysis without extracting a frame. The native reference
        // cell supports an empty image with real timing; never fabricate a frame from a cover.
        let validFrame=frame==='';
        if(!validFrame)try{validFrame=typeof frame==='string'&&new URL(frame).protocol==='https:';}catch{ /* Invalid source frame stays blocked. */ }
        if(!validFrame)add('video-story-field-unmapped',`${path}.frameUrl 不是可恢复的 HTTPS 关键帧`);
        const camera=[row.camera_angle, row.focal_depth?`景深：${row.focal_depth}`:''].filter(Boolean).join('；');
        const audio=[row.audio_music?`背景音乐：${row.audio_music}`:'',row.audio_voice?`人声/音效：${row.audio_voice}`:''].filter(Boolean).join('；');
        rows.push({
            id:`${source.id}:row:${index}`,shotNumber:shot,durationSeconds:duration,
            plotDescription:row.visual_description||'',narrativeIntent:row.content||'',dialogue:'',characters:[],viewerPOV:'',performanceBlocking:'',
            shotSize:row.shot_size||'',emotion:'',lightingAndAtmosphere:row.lighting||'',audioEffects:audio,camera,motion:row.camera_movement||'',timeBeats:'',
            imageGenerationPrompt:row.image_generation_prompt||'',videoMotionPrompt:row.video_motion_prompt||'',
            mustHave:[],optionalDetails:[],continuityOut:'',negativePrompt:'',assetBindings:[],status:'idle',
            sourceStartMs:start*1000,sourceEndMs:end*1000,keyframeTimeMs:start*1000,
            videoReference:{startTime:start,endTime:end,referenceFrameImage:frame},
        });
    }
    return {rows,sourceVideoNodeId:data.sourceVideoNodeId as string};
}

/** Legacy scripts use the native storyboard executor; unmapped source fields remain explicit blockers. */
export function prepareLtvStoryboardGraph(snapshot: Record<string, any>) {
    const nodes: SourceNode[] = structuredClone(Array.isArray(snapshot.nodes) ? snapshot.nodes : []);
    const issues: Issue[] = [];
    const scripts = new Map<string, { storyboard: StoryboardData; sourceColumns: unknown; imageConfig: unknown; viewState: ReturnType<typeof mapLtvStoryboardViews>; sourceKind?: 'video-story'; videoStory?: {sourceVideoNodeId:string;rows:unknown;columns:unknown} }>();
    const outputConnections: CanvasConnection[] = [];
    const referenceConnections: CanvasConnection[] = [];
    const ids = new Set(nodes.map(node => node.id));
    for (const source of nodes.slice()) {
        if(source.type==='video-story'){
            const data=source.data||{}, mapped=mapVideoStory(source,nodes,issues);
            const visibleColumns: StoryboardData['visibleColumns']=['shotNumber','durationSeconds','videoReference','plotDescription','narrativeIntent','shotSize','camera','motion','lightingAndAtmosphere','audioEffects','imageGenerationPrompt','videoMotionPrompt'];
            scripts.set(source.id,{sourceKind:'video-story',storyboard:{rows:mapped.rows,visibleColumns,referenceNodeIds:[]},
                sourceColumns:structuredClone(data.shotColumns),imageConfig:undefined,
                viewState:{views:[{id:'video-story',name:'视频故事',type:'table',visibleColumns}],activeId:'video-story',issues:[]},
                videoStory:{sourceVideoNodeId:mapped.sourceVideoNodeId,rows:structuredClone(data.rows),columns:structuredClone(data.shotColumns)}});
            if(ids.has(mapped.sourceVideoNodeId)&&!(Array.isArray(snapshot.edges)&&snapshot.edges.some((edge:SourceNode)=>edge.source===mapped.sourceVideoNodeId&&edge.target===source.id)))
                referenceConnections.push({id:`video-story-source-${source.id}`,fromNodeId:mapped.sourceVideoNodeId,toNodeId:source.id});
            source.type='text';source.data={...data,action:'text_resource',content:['视频故事资源']};
            continue;
        }
        // The newer source screenplay is written as `script-v2` and keeps the same `rows` table,
        // so the legacy storyboard mapping applies to both node types.
        if (source.type !== 'script' && source.type !== 'script-v2') continue;
        const data = source.data || {}, mapped = mapLtvStoryboardRows(source.id, data.rows, { assets: data.assets, resolveReferences: true });
        if(data.assets)for(const [index,row] of mapped.rows.entries()){
            const references=mapLtvStoryboardReferenceTracks(data.rows[index],data.assets,nodes);
            row.generationReferenceNodeIds=references.tracks;
            for(const detail of references.issues)issues.push({nodeId:source.id,code:'storyboard-asset-unmapped',detail:`镜头 ${row.shotNumber}: ${detail}`});
        }
        const viewState=mapLtvStoryboardViews(data);
        for(const detail of viewState.issues)issues.push({nodeId:source.id,code:'storyboard-view-unmapped',detail});
        try { ltvStoryboardSourceColumns(data.shotColumns); }
        catch(error) { issues.push({nodeId:source.id,code:'storyboard-columns-unmapped',detail:error instanceof Error?error.message:'原分镜列定义不完整'}); }
        if(mapped.rows.length>512)issues.push({nodeId:source.id,code:'storyboard-capacity-required',detail:'导入分镜超过当前单任务512镜容量，需要分段执行适配，不能截断'});
        for (const issue of mapped.issues) issues.push({nodeId:source.id,code:'storyboard-field-unmapped',detail:`${issue.path}: ${issue.reason}`});
        for (const media of mapped.media) {
            if (ids.has(media.id)) { issues.push({nodeId:source.id,code:'invalid-ids',detail:'人物预览节点ID冲突'}); continue; }
            ids.add(media.id);
            nodes.push({id:media.id,type:'image',position:{x:Number(source.position?.x)-380,y:Number(source.position?.y)+mapped.media.indexOf(media)*260},
                data:{name:media.title,action:'image_resource',url:[media.url]},width:320,height:240});
        }
        const group = nodes.find(node => node.id === data.linkedImageGroupId && node.type === 'group');
        if (group) {
            const savedOrder=group.data?.childNodeIds;
            if(savedOrder!==undefined&&(!Array.isArray(savedOrder)||savedOrder.some((id:unknown)=>typeof id!=='string'))){
                issues.push({nodeId:source.id,code:'storyboard-output-unmapped',detail:'原图像组顺序格式无效'});
            }
            const orderedIds: string[] = Array.isArray(savedOrder)?savedOrder.filter((id:unknown)=>typeof id==='string'):[];
            // Source buildStoryboardGroupRunPlan first selects actual children, then image nodes.
            // A stale child list cannot claim another group's image or shift the row index via text nodes.
            const children = nodes.filter(node => node.parentId === group.id && node.type==='image').sort((a,b) => {
                const left=orderedIds.indexOf(a.id),right=orderedIds.indexOf(b.id);
                if (left>=0 || right>=0) return (left<0?Infinity:left)-(right<0?Infinity:right);
                return String(a.data?.name || '').localeCompare(String(b.data?.name || ''), undefined, {numeric:true});
            });
            const outputsByRow = new Map<string, SourceNode[]>();
            for (const [index,child] of children.entries()) {
                const alias = child.data?.scriptRowHiddenUuid;
                const row = alias ? mapped.rows.find(row => row.id === mapped.aliases.get(alias)) : mapped.rows[index];
                if (!row || child.type !== 'image') {
                    issues.push({nodeId:source.id,code:'storyboard-output-unmapped',detail:`分镜输出无法唯一关联：${String(child.id)}`});
                    continue;
                }
                const outputs=outputsByRow.get(row.id)||[];
                outputs.push(child);outputsByRow.set(row.id,outputs);
                if(!row.imageNodeId)row.imageNodeId=child.id;
                outputConnections.push({id:`storyboard-output-${source.id}-${row.id}-${child.id}`,fromNodeId:source.id,toNodeId:child.id,
                    fromHandleId:`row:${row.id}`,storyboardRowId:row.id,relation:'storyboard-output'});
                // group-generate is the source routing scene, not an additional model parameter.
                if (child.data?.params?.scene === 'group-generate') delete child.data.params.scene;
            }
            for(const row of mapped.rows){
                const outputs=outputsByRow.get(row.id);
                if(!outputs||outputs.length<2)continue;
                // Source eH sorts by numeric name, then eB chooses the first image with a saved URL.
                // Native edit, batch and progress consumers enumerate every storyboard-output edge.
                const firstReady=[...outputs].sort((a,b)=>String(a.data?.name||'').localeCompare(String(b.data?.name||''),undefined,{numeric:true}))
                    .find(node=>node.data?.scriptRowHiddenUuid&&mapped.aliases.get(node.data.scriptRowHiddenUuid)===row.id&&Array.isArray(node.data?.url)&&node.data.url.some((url:unknown)=>typeof url==='string'&&url.trim()));
                if(firstReady)row.imageNodeId=firstReady.id;
            }
        }
        scripts.set(source.id,{storyboard:{rows:mapped.rows,visibleColumns:[...ltvStoryboardColumns],referenceNodeIds:[]},
            sourceColumns:structuredClone(data.shotColumns),imageConfig:structuredClone(data.imageGenConfig),viewState});
        source.type='text';
        source.data={...data,action:'text_generate',content:[],params:{...data.params}};
        // script-generate / script-generate-v2 are the source routing scenes for this node type,
        // not model parameters, so they are dropped together with the legacy value.
        if (source.data.params.scene === 'script-generate' || source.data.params.scene === 'script-generate-v2') delete source.data.params.scene;
    }
    // Source links must enter the ordinary graph validator before it checks cycles and ownership.
    const edges=[...(Array.isArray(snapshot.edges)?snapshot.edges:[]),...referenceConnections.map(edge=>({id:edge.id,source:edge.fromNodeId,target:edge.toNodeId}))];
    return {snapshot:{...snapshot,nodes,edges},scripts,issues,outputConnections,referenceConnections};
}
