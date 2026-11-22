import { expect, test } from "bun:test";
import { validateProductionCaseMediaAssets, type ProductionCaseMediaAsset } from "../src/lib/production-case-media-contract";
import type { CanvasNodeData } from "../src/types/canvas";
import type { PrevisScene } from "../src/types/previs";
const id = "case-"+"a".repeat(32);
const sha256="b".repeat(64);
const source="https://media.example/image.png";
const nodes=[{id:"image",type:"image",metadata:{content:source}}] as CanvasNodeData[];
const asset:ProductionCaseMediaAsset={source,path:`/production-library/case-media/${id}/${sha256}.png`,kind:"image",mimeType:"image/png",bytes:12,sha256};
test("案例完整媒体清单严格绑定源引用、当前案例路径和文件哈希",()=>{
    expect(validateProductionCaseMediaAssets(id,nodes,undefined)).toBeUndefined();
    expect(validateProductionCaseMediaAssets(id,nodes,[asset])).toEqual([asset]);
    for(const list of [[],[asset,asset],[{...asset,path:'https://untrusted.example/file'}],[{...asset,path:asset.path.replace(id,'other')}],[{...asset,bytes:0}],[{...asset,kind:'video'}],[{...asset,source:'https://media.example/other.png'}],[{...asset,sha256:'bad'}]]) {
        expect(()=>validateProductionCaseMediaAssets(id,nodes,list)).toThrow('清单');
    }
});
test("局部编辑蒙版也是必须完整登记的素材，不以原图代替",()=>{
    const maskSource="https://media.example/mask.png";
    const masked=structuredClone(nodes);
    masked[0].metadata!.ltvMaskEdit={sourceUrl:source,maskUrl:maskSource} as NonNullable<CanvasNodeData['metadata']>['ltvMaskEdit'];
    expect(()=>validateProductionCaseMediaAssets(id,masked,[asset])).toThrow('清单');
    expect(validateProductionCaseMediaAssets(id,masked,[asset,{...asset,source:maskSource}])).toHaveLength(2);
    expect(()=>validateProductionCaseMediaAssets(id,masked,[asset,{...asset,source:maskSource,bytes:13}])).toThrow('清单');
});

test("原始 QuickTime 视频保留 MOV 路径和 MIME，不能标成 MP4",()=>{
    const videoSource="https://media.example/original.mov";
    const videoNodes=[{id:"video",type:"video",metadata:{content:videoSource}}] as CanvasNodeData[];
    const video:ProductionCaseMediaAsset={...asset,source:videoSource,kind:"video",mimeType:"video/quicktime",path:`/production-library/case-media/${id}/${sha256}.mov`};
    expect(validateProductionCaseMediaAssets(id,videoNodes,[video])).toEqual([video]);
    expect(()=>validateProductionCaseMediaAssets(id,videoNodes,[{...video,mimeType:"video/mp4"}])).toThrow("清单");
    expect(()=>validateProductionCaseMediaAssets(id,videoNodes,[{...video,path:video.path.replace(".mov",".mp4")}])).toThrow("清单");
});

test("导演台模型必须完整登记为当前案例文件，不能漏掉或冒充图片",()=>{
    const modelSource = '/production-library/director-assets/actor.glb';
    const scenes = [{objects:[{kind:'model',url:modelSource}]}] as PrevisScene[];
    const model = {...asset, source:modelSource, path:`/production-library/case-media/${id}/${sha256}.glb`,kind:'file',mimeType:'model/gltf-binary'} as ProductionCaseMediaAsset;
    expect(validateProductionCaseMediaAssets(id,nodes,[asset,model],scenes)).toEqual([asset,model]);
    for (const list of [[asset], [asset,{...model,mimeType:'application/javascript'}], [asset,{...model,kind:'image'}]]) {
        expect(()=>validateProductionCaseMediaAssets(id,nodes,list,scenes)).toThrow('清单');
    }
});
