import {expect,test} from 'bun:test';
import {mapLtvStoryboardReferenceTracks} from '../src/lib/canvas/ltv-storyboard-asset-references';

const assets={characters:[{id:'actor',name:'映雪',linkedNodeId:'actor-image'}],scenes:[{id:'scene',name:'庭院',linkedNodeId:'scene-image'}],props:[{id:'prop',name:'红伞',linkedNodeId:'prop-image'}]};
const nodes=['actor-image','scene-image','prop-image'].map(id=>({id,type:'image',data:{action:'image_generate',url:[]}}));

test('source image and video entity references resolve independently with role order and node deduplication',()=>{
 const row={characters:[{characterAssetId:'actor'}],finalImagePromptEntityRefs:[{assetId:'scene',text:'庭院'}],finalVideoPromptEntityRefs:[{assetId:'prop',text:'红伞'}],imageGenerationPrompt:'映雪静立',videoMotionPrompt:'映雪撑伞'};
 const before=JSON.stringify({row,assets,nodes}),result=mapLtvStoryboardReferenceTracks(row,assets,nodes);
 expect(result.issues).toEqual([]);
 expect(result.tracks).toEqual({image:['actor-image','scene-image'],video:['actor-image','prop-image']});
 expect(JSON.stringify({row,assets,nodes})).toBe(before);
});

test('source named mentions and structured scene references resolve without thumbnail substitution',()=>{
 const row={sceneAssetIds:['scene'],imageGenerationPrompt:'@映雪 拿着 @红伞',videoMotionPrompt:'@prop 在 @庭院'};
 expect(mapLtvStoryboardReferenceTracks(row,assets,nodes).tracks).toEqual({image:['actor-image','scene-image','prop-image'],video:['scene-image','prop-image']});
 const broken={...assets,props:[{id:'prop',name:'红伞',thumbnailUrl:'https://example.test/cover.png'}]};
 const result=mapLtvStoryboardReferenceTracks(row,broken,nodes);
 expect(result.issues.some(issue=>issue.includes('不能使用封面代替'))).toBe(true);
 expect(result.tracks.image).not.toContain('prop-image');
});

test('unknown entities and malformed lists remain explicit adaptation failures',()=>{
 const result=mapLtvStoryboardReferenceTracks({finalImagePromptEntityRefs:[{assetId:'missing',text:'未知'}],sceneAssetIds:'scene'},assets,nodes);
 expect(result.issues.some(issue=>issue.includes('missing'))).toBe(true);
 expect(result.issues.some(issue=>issue.includes('sceneAssetIds'))).toBe(true);
});
