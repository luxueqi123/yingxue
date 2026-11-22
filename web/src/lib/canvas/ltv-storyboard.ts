import type { StoryboardDialogueLine, StoryboardDialogueLineIssue, StoryboardRow, StoryboardColumn } from '../../types/canvas';

type SourceObject = Record<string, unknown>;
const object = (value: unknown): SourceObject => value && typeof value === 'object' && !Array.isArray(value) ? value as SourceObject : {};
const fields = ['plotDescription','dialogue','shotSize','emotion','lightingAndAtmosphere','audioEffects','imageGenerationPrompt','videoMotionPrompt','sceneTags','propTags'] as const;
const sourceRowKeys = new Set<string>([...fields,'id','hiddenUuid','shotNumber','durationSeconds','characters','characterAction','videoReference','voiceover','dialogueLines']);

// Source 36r2or3hxiguz.js writes the newer screenplay as type `script-v2`. These extra row keys are
// internal bookkeeping or redundant copies of the flat fields above, so they carry no separate
// production requirement:
// - textHash / payloadHash / imagePromptState / videoPromptState: cache and dirty-state markers.
// - cinematics: the same shot size / camera movement / lighting values already present in the flat
//   shotSize and lightingAndAtmosphere fields (measured: 338/338 rows filled flat, 335/335 agreeing).
// - imageToVideoMotionPrompt: reserved slot; every observed row leaves it empty.
// - plotDescriptionEntityRefs / finalImagePromptEntityRefs / finalVideoPromptEntityRefs: inline
//   mention spans already resolved through the scene/prop binding path.
//
// Flat dialogue/voiceover are validated as redundant mirrors when dialogueLines is present; the
// ordered typed lines are canonical. Standalone legacy voiceover is kept separately on the row.
const sourceRowBookkeepingKeys = new Set<string>([
    'textHash','payloadHash','imagePromptState','videoPromptState','cinematics','imageToVideoMotionPrompt',
    'plotDescriptionEntityRefs','finalImagePromptEntityRefs','finalVideoPromptEntityRefs',
    'sceneAssetIds','propAssetIds',
]);

const sourceColumnFields = new Set(['shot_number','duration_seconds','plot_description','shot_size','character_action','emotion','scene_tags','prop_tags','lighting_and_atmosphere','audio_effects','dialogue','image_generation_prompt','video_motion_prompt','characters','video_reference']);
export function ltvStoryboardSourceColumns(value: unknown): Array<{field:string;label:string;description:string}> {
    if (value === undefined || value === null) return [];
    if (!Array.isArray(value) || value.length > sourceColumnFields.size) throw new Error('原分镜列定义格式不完整');
    const seen=new Set<string>();
    return value.map(input=>{
        const column=object(input);
        if(typeof column.field!=='string'||!sourceColumnFields.has(column.field)||seen.has(column.field)
            ||typeof column.label!=='string'||typeof column.description!=='string'
            ||Object.keys(column).some(key=>!['field','label','description'].includes(key))) throw new Error('原分镜列定义含未映射字段');
        seen.add(column.field);
        return {field:column.field,label:column.label,description:column.description};
    });
}

export type LtvStoryboardMappingOptions = { assets?: unknown; resolveReferences?: boolean };

/** The legacy script rows are an editable table, not a flattened text result. */
export function mapLtvStoryboardRows(scriptId: string, value: unknown, options: LtvStoryboardMappingOptions = {}) {
    const issues: Array<{ path: string; reason: string }> = [];
    const media: Array<{ id: string; url: string; title: string }> = [];
    const aliases = new Map<string,string>();
    const ids = new Set<string>();
    const mediaIds = new Map<string,string>();
    if (!Array.isArray(value)) return { rows: [], media, aliases, issues: [{path:'rows',reason:'缺少原分镜行数组'}] };
    const rows: StoryboardRow[] = value.map((input, index) => {
        const source = object(input), path = `rows[${index}]`;
        const id = typeof source.hiddenUuid === 'string' && source.hiddenUuid ? source.hiddenUuid : typeof source.id === 'string' && source.id ? source.id : `${scriptId}:row:${index}`;
        if (ids.has(id)) issues.push({path,reason:'分镜行ID重复'});
        ids.add(id);
        for (const key of ['id','hiddenUuid']) if (typeof source[key] === 'string' && source[key]) aliases.set(source[key],id);
        const row: StoryboardRow = {
            id, shotNumber: Number(source.shotNumber ?? index + 1), durationSeconds: Number(source.durationSeconds),
            plotDescription:'',dialogue:'',characters:[],narrativeIntent:'',viewerPOV:'',performanceBlocking:'',shotSize:'',emotion:'',
            lightingAndAtmosphere:'',audioEffects:'',camera:'',motion:'',timeBeats:'',imageGenerationPrompt:'',videoMotionPrompt:'',
            mustHave:[],optionalDetails:[],continuityOut:'',negativePrompt:'',assetBindings:[],status:'idle',
        };
        if (!Number.isInteger(row.shotNumber) || row.shotNumber < 1 || !Number.isFinite(row.durationSeconds) || row.durationSeconds <= 0) issues.push({path,reason:'镜号或时长无效，不能用默认值替代'});
        for (const key of fields) {
            const text=source[key];
            if (text === undefined || text === null) continue;
            if (typeof text !== 'string') { issues.push({path:`${path}.${key}`,reason:'字段不是文字，尚未映射该格式'}); continue; }
            row[key]=text;
        }
        if (source.voiceover !== undefined && source.voiceover !== null && typeof source.voiceover !== 'string') {
            issues.push({path:`${path}.voiceover`,reason:'旁白字段不是文字'});
        }
        const lineReviews: StoryboardDialogueLineIssue[] = [];
        const dialogueLineValue = source.dialogueLines;
        if (dialogueLineValue !== undefined && dialogueLineValue !== null) {
            if (!Array.isArray(dialogueLineValue)) {
                issues.push({path:`${path}.dialogueLines`,reason:'结构化台词必须是数组'});
            } else if (dialogueLineValue.length === 0) {
                if ((typeof source.dialogue === 'string' && source.dialogue !== '') || (typeof source.voiceover === 'string' && source.voiceover !== '')) {
                    issues.push({path:`${path}.dialogueLines`,reason:'空结构化台词与非空平铺对白/旁白冲突'});
                }
            } else {
                const mappedLines: StoryboardDialogueLine[] = [];
                let validLines = true;
                for (const [lineIndex, inputLine] of dialogueLineValue.entries()) {
                    const line = object(inputLine), linePath = `${path}.dialogueLines[${lineIndex}]`;
                    let validLine = true;
                    if (line.kind !== 'speech' && line.kind !== 'voiceover') {
                        issues.push({path:`${linePath}.kind`,reason:'未知台词类型'}); validLine = false;
                    }
                    if (typeof line.text !== 'string') {
                        issues.push({path:`${linePath}.text`,reason:'台词正文不是文字'}); validLine = false;
                    }
                    if (line.characterRef !== undefined && typeof line.characterRef !== 'string') {
                        issues.push({path:`${linePath}.characterRef`,reason:'说话人引用不是文字'}); validLine = false;
                    }
                    if (line.entityRefs !== undefined && !Array.isArray(line.entityRefs)) {
                        issues.push({path:`${linePath}.entityRefs`,reason:'实体引用必须是数组'}); validLine = false;
                    }
                    for (const key of Object.keys(line)) {
                        if (!['kind','text','characterRef','entityRefs'].includes(key)) {
                            issues.push({path:`${linePath}.${key}`,reason:'结构化台词含未映射字段'}); validLine = false;
                        }
                    }
                    const entityRefs: Array<{text:string;assetId:string}> = [];
                    for (const [referenceIndex, inputReference] of (Array.isArray(line.entityRefs) ? line.entityRefs : []).entries()) {
                        const reference = object(inputReference), referencePath = `${linePath}.entityRefs[${referenceIndex}]`;
                        if (typeof reference.text !== 'string' || !reference.text.trim() || typeof reference.assetId !== 'string' || !reference.assetId.trim()
                            || Object.keys(reference).some(key => !['text','assetId'].includes(key))) {
                            issues.push({path:referencePath,reason:'实体引用必须只含非空 text 与 assetId 字符串'}); validLine = false; continue;
                        }
                        entityRefs.push({text:reference.text,assetId:reference.assetId});
                    }
                    if (!validLine) { validLines = false; continue; }
                    const mappedLine: StoryboardDialogueLine = {
                        kind: line.kind as StoryboardDialogueLine['kind'],
                        text: line.text as string,
                        ...(line.characterRef !== undefined ? {characterRef:line.characterRef as string} : {}),
                        ...(line.entityRefs !== undefined ? {entityRefs} : {}),
                    };
                    if (mappedLine.entityRefs?.some(reference => !mappedLine.text.includes(reference.text))) {
                        const detail = '实体引用文字不在当前台词正文中';
                        lineReviews.push({lineIndex,field:'entityRefs',status:'needs-review',detail});
                        issues.push({path:`${linePath}.entityRefs`,reason:detail});
                    }
                    mappedLines.push(mappedLine);
                }
                if (validLines && mappedLines.length === dialogueLineValue.length) {
                    const sourceDialogue = source.dialogue;
                    const sourceVoiceover = source.voiceover;
                    const speechText = mappedLines.filter(line => line.kind === 'speech').map(line => line.text).join('\n');
                    const voiceoverText = mappedLines.filter(line => line.kind === 'voiceover').map(line => line.text).join('\n');
                    if (sourceDialogue !== undefined && sourceDialogue !== null && typeof sourceDialogue === 'string' && sourceDialogue !== speechText) {
                        issues.push({path:`${path}.dialogue`,reason:'平铺对白与结构化对白不一致'});
                    }
                    if (sourceVoiceover !== undefined && sourceVoiceover !== null && typeof sourceVoiceover === 'string' && sourceVoiceover !== voiceoverText) {
                        issues.push({path:`${path}.voiceover`,reason:'平铺旁白与结构化旁白不一致'});
                    }
                    row.dialogue = '';
                    row.dialogueLines = mappedLines;
                    validateStoryboardDialogueReferences(mappedLines, options.assets, options.resolveReferences === true, path, issues, lineReviews);
                    if (lineReviews.length) row.dialogueLineIssues = lineReviews;
                }
            }
        } else if (typeof source.voiceover === 'string' && source.voiceover) {
            row.voiceover = source.voiceover;
        }
        if (source.characterAction !== undefined) {
            if (typeof source.characterAction === 'string') row.performanceBlocking=source.characterAction;
            else issues.push({path:`${path}.characterAction`,reason:'角色动作格式无效'});
        }
        if (source.characters !== undefined && !Array.isArray(source.characters)) issues.push({path:`${path}.characters`,reason:'人物列表格式无效'});
        for (const [characterIndex, inputCharacter] of (Array.isArray(source.characters)?source.characters:[]).entries()) {
            const character=object(inputCharacter), characterPath=`${path}.characters[${characterIndex}]`;
            if (typeof character.characterName !== 'string' || (character.characterDescription !== undefined && typeof character.characterDescription !== 'string')) {
                issues.push({path:characterPath,reason:'人物名称或描述格式无效'});continue;
            }
            const reference={characterName:character.characterName,characterDescription:character.characterDescription as string|undefined,characterImageNodeId:undefined as string|undefined};
            const url=character.characterImageUrl;
            if (url) {
                let valid=false;
                try { valid=typeof url==='string'&&new URL(url).protocol==='https:'; } catch { /* Report below; never replace a missing reference with a cover. */ }
                if (!valid) issues.push({path:characterPath+'.characterImageUrl',reason:'人物参考图地址无效'});
                else {
                    let resourceId=mediaIds.get(url as string);
                    if (!resourceId) { resourceId=`${scriptId}:character:${index}:${characterIndex}`;mediaIds.set(url as string,resourceId);media.push({id:resourceId,url:url as string,title:character.characterName}); }
                    reference.characterImageNodeId=resourceId;
                    // LTV collectShotRefImages resolves characterAssetId against the script
                    // asset map. A legacy characterImageUrl alone is only a preview.
                }
            }
            for (const key of Object.keys(character)) {
                if (key === 'characterAssetId' && (character[key] === '' || character[key] === null)) continue;
                if (!['characterName','characterDescription','characterImageUrl'].includes(key)) issues.push({path:characterPath+'.'+key,reason:'人物扩展字段尚未映射'});
            }
            row.characters.push(reference);
        }
        if (source.videoReference && (!Array.isArray(source.videoReference) || source.videoReference.length)) {
            const reference = object(source.videoReference);
            let validUrl = false;
            try { validUrl = reference.referenceFrameImage === '' || (typeof reference.referenceFrameImage === 'string' && new URL(reference.referenceFrameImage).protocol === 'https:'); } catch { /* Invalid source stays blocked. */ }
            if (typeof reference.startTime !== 'number' || typeof reference.endTime !== 'number'
                || !Number.isFinite(reference.startTime) || !Number.isFinite(reference.endTime)
                || reference.startTime < 0 || reference.endTime < reference.startTime || !validUrl
                || Object.keys(reference).some(key => !['startTime','endTime','referenceFrameImage'].includes(key))) {
                issues.push({path:path+'.videoReference',reason:'分镜参考片段或参考帧格式尚未完整映射'});
            } else {
                // Source UI uses this frame for preview/export, not as an implicit generation input.
                row.videoReference = {startTime:reference.startTime,endTime:reference.endTime,referenceFrameImage:reference.referenceFrameImage as string};
            }
        }
        for (const key of Object.keys(source)) if (!sourceRowKeys.has(key) && !sourceRowBookkeepingKeys.has(key)) issues.push({path:path+'.'+key,reason:'分镜扩展字段尚未映射'});
        return row;
    });
    return {rows,media,aliases,issues};
}

function validateStoryboardDialogueReferences(
    lines: StoryboardDialogueLine[],
    assetsValue: unknown,
    resolveReferences: boolean,
    rowPath: string,
    issues: Array<{path:string;reason:string}>,
    reviews: StoryboardDialogueLineIssue[],
) {
    if (!resolveReferences) return;
    const assets = object(assetsValue);
    const records: Array<{id:string;name:string;group:string}> = [];
    for (const group of ['characters','scenes','props']) {
        const source = assets[group];
        if (source !== undefined && !Array.isArray(source)) continue;
        for (const input of Array.isArray(source) ? source : []) {
            const asset = object(input);
            if (typeof asset.id === 'string' && asset.id && typeof asset.name === 'string') records.push({id:asset.id,name:asset.name,group});
        }
    }
    const addReview = (lineIndex:number, field:StoryboardDialogueLineIssue['field'], status:StoryboardDialogueLineIssue['status'], detail:string) => {
        reviews.push({lineIndex,field,status,detail});
        issues.push({path:`${rowPath}.dialogueLines[${lineIndex}].${field}`,reason:detail});
    };
    for (const [lineIndex,line] of lines.entries()) {
        if (line.characterRef) {
            const byId = records.filter(asset => asset.group === 'characters' && asset.id === line.characterRef);
            const byName = records.filter(asset => asset.group === 'characters' && asset.name === line.characterRef);
            if (byId.length !== 1 && byName.length !== 1) {
                addReview(lineIndex,'characterRef','unresolved',`说话人引用「${line.characterRef}」未唯一匹配原角色资产，保留原值`);
            }
        }
        for (const reference of line.entityRefs || []) {
            const matches = records.filter(asset => asset.id === reference.assetId);
            if (matches.length !== 1) {
                const named = records.filter(asset => asset.name === reference.text);
                const hint = named.length === 1 ? `文字匹配资产「${reference.text}」，但原资产ID「${reference.assetId}」未匹配；需核对后手动修复` : `实体引用资产ID「${reference.assetId}」未唯一匹配原资产`;
                addReview(lineIndex,'entityRefs','unresolved',hint);
            }
        }
    }
}

export const ltvStoryboardColumns: StoryboardColumn[] = ['shotNumber','durationSeconds','videoReference','characters','plotDescription','performanceBlocking','sceneTags','propTags','dialogue','shotSize','emotion','lightingAndAtmosphere','audioEffects','imageGenerationPrompt','videoMotionPrompt','assets'];
