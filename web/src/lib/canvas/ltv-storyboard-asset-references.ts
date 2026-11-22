type SourceObject = Record<string, any>;
const object = (value: unknown): SourceObject => value && typeof value === 'object' && !Array.isArray(value) ? value as SourceObject : {};
type Role = 'character' | 'scene' | 'prop';

/** Source collectRowAssetReferences + buildAssetLinkedNodeMap, without source service IDs. */
export function mapLtvStoryboardReferenceTracks(rowValue: unknown, assetsValue: unknown, nodes: SourceObject[]) {
    const row=object(rowValue),assets=object(assetsValue),issues:string[]=[];
    const byId=new Map<string,{role:Role;name:string;nodeId:string}>(),names=new Map<string,string>();
    for(const [group,role] of [['characters','character'],['scenes','scene'],['props','prop']] as const){
        const entries=assets[group];
        if(entries!==undefined&&!Array.isArray(entries)){issues.push(`assets.${group} 不是数组`);continue;}
        for(const input of entries||[]){
            const asset=object(input);
            if(typeof asset.id!=='string'||!asset.id||typeof asset.name!=='string'||byId.has(asset.id)){
                issues.push(`assets.${group} 的资产标识或名称无效`);continue;
            }
            byId.set(asset.id,{role,name:asset.name,nodeId:typeof asset.linkedNodeId==='string'?asset.linkedNodeId:''});
            if(asset.name.trim())names.set(asset.name.trim(),asset.id);
        }
    }
    const nameOrder=[...names.keys()].sort((a,b)=>b.length-a.length);
    const tracks={image:[] as string[],video:[] as string[]};
    for(const mode of ['image','video'] as const){
        const grouped:Record<Role,string[]>={character:[],scene:[],prop:[]},seen=new Set<string>();
        const add=(id:unknown,fallback?:Role)=>{
            if(typeof id!=='string'||!id||seen.has(id))return;
            const asset=byId.get(id),role=asset?.role||fallback;
            if(!role)return;
            seen.add(id);
            if(!asset){issues.push(`${mode}: 资产 ${id} 不在原资产表中`);return;}
            const linked=nodes.find(node=>node.id===asset.nodeId);
            if(!asset.nodeId||!linked||linked.type!=='image'){
                issues.push(`${mode}: 资产 ${id} 缺少关联图片节点，不能使用封面代替`);return;
            }
            grouped[role].push(asset.nodeId);
        };
        if(row.characters!==undefined&&!Array.isArray(row.characters))issues.push(`${mode}: 人物列表无效`);
        for(const character of Array.isArray(row.characters)?row.characters:[])add(object(character).characterAssetId,'character');
        const key=mode==='image'?'finalImagePromptEntityRefs':'finalVideoPromptEntityRefs';
        if(row[key]!==undefined&&!Array.isArray(row[key]))issues.push(`${mode}: 提示词实体引用无效`);
        for(const input of Array.isArray(row[key])?row[key]:[]){
            const ref=object(input);
            if(typeof ref.assetId!=='string'||typeof ref.text!=='string')issues.push(`${mode}: 提示词实体缺少标识或文字`);
            else if(!byId.has(ref.assetId))issues.push(`${mode}: 提示词实体 ${ref.assetId} 缺少资产定义`);
            else add(ref.assetId);
        }
        for(const [key,role] of [['sceneAssetIds','scene'],['propAssetIds','prop']] as const){
            if(row[key]!==undefined&&!Array.isArray(row[key]))issues.push(`${mode}: ${key} 无效`);
            for(const id of Array.isArray(row[key])?row[key]:[])add(id,role);
        }
        const prompt=row[mode==='image'?'imageGenerationPrompt':'videoMotionPrompt']||row.plotDescription||'';
        if(typeof prompt!=='string'){issues.push(`${mode}: 提示词不是文字`);continue;}
        // Longest asset name wins; ASCII word boundaries prevent matching Ann inside Anna.
        for(let index=0;index<prompt.length;index++){
            if(!['@','＠'].includes(prompt[index])||(index>0&&/[A-Za-z0-9]/.test(prompt[index-1])))continue;
            const name=nameOrder.find(name=>prompt.startsWith(name,index+1)&&!(/[A-Za-z0-9]/.test(name.at(-1)||'')&&/[A-Za-z0-9]/.test(prompt[index+name.length+1]||'')));
            if(name){add(names.get(name));index+=name.length;}
        }
        for(const match of prompt.matchAll(/[@＠]([A-Za-z0-9_-]+)/g))add(match[1]);
        tracks[mode]=[...new Set([...grouped.character,...grouped.scene,...grouped.prop])];
    }
    return {tracks,issues:[...new Set(issues)]};
}
