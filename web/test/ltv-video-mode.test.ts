import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildVideoGenerationMetadata} from '../src/lib/canvas/canvas-project-generation';
import {resolveVideoOperation} from '../src/lib/model-selection';
import {resolveVideoImageReferences} from '../src/services/api/video-reference-roles';
import type {CanvasNodeData} from '../src/types/canvas';

test('two imported reference images remain references through native metadata and provider roles',()=>{
 const images=[{id:'a',url:'https://example.test/a',dataUrl:'',type:'image/png',name:'a'},{id:'b',url:'https://example.test/b',dataUrl:'',type:'image/png',name:'b'}];
 const node={id:'video',type:'video',metadata:{videoEditOperation:'reference_to_video',ltvReferencePlan:{prompt:'移动',references:images.map(image=>({nodeId:image.id,kind:'image',url:image.url}))}}} as CanvasNodeData;
 const context={referenceImages:images,referenceVideos:[],referenceAudios:[]};
 const metadata=buildVideoGenerationMetadata(node,context);
 assert.equal(metadata.videoEditOperation,'reference_to_video');
 assert.deepEqual(resolveVideoImageReferences(images,metadata).map(item=>item.role),['reference_image','reference_image']);
 const input={textCount:1,imageCount:2,videoCount:0,audioCount:0,characterCount:0};
 assert.equal(resolveVideoOperation(input,'reference_to_video',true),'reference_to_video');
 assert.equal(resolveVideoOperation(input,'reference_to_video'),'image_to_video');
 node.metadata!.videoEditOperation='image_to_video';node.metadata!.videoStartFrameNodeId='a';node.metadata!.videoEndFrameNodeId='b';
 assert.deepEqual(resolveVideoImageReferences(images,buildVideoGenerationMetadata(node,context)).map(item=>item.role),['first_frame','last_frame']);
});
