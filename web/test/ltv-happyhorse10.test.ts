import {expect,test} from 'bun:test';
import {mapLtvHappyHorseFirstFrame,mapLtvHappyHorseReferences,assertHappyHorseFirstFrame,assertHappyHorseReferences,happyHorseReferenceTaskMetadata} from '../src/lib/canvas/ltv-happyhorse-options';
import type {CanvasNodeMetadata} from '../src/types/canvas';

test('existing 1.1 runtime accepts the normalized resolution submitted by the canvas',()=>{
 const options=mapLtvHappyHorseReferences({model:'happy-horse-1.1',modeType:'image2video',resolution:'720P',duration:5,ratio:'16:9'},{image:2,video:0,audio:0},1)!;
 expect(()=>assertHappyHorseReferences('happyhorse-1.1-r2v','720','5','16:9','false',options,{image:2,video:0,audio:0})).not.toThrow();
});

test('original Happy Horse 1.0 maps both original modes without upgrading to 1.1',()=>{
 const first=mapLtvHappyHorseFirstFrame({model:'happy-horse-1',modeType:'frames2video',resolution:'1080P',duration:3},{image:1,video:0,audio:0},1);
 expect(first).toMatchObject({ltvHappyHorseModel:'happy-horse-1',ltvExecutionContract:'happyhorse-first-frame-video',seconds:'3'});
 const ref=mapLtvHappyHorseReferences({model:'happy-horse-1',modeType:'image2video',resolution:'720P',duration:5,ratio:'16:9'},{image:2,video:0,audio:0},1);
 expect(ref).toMatchObject({ltvHappyHorseModel:'happy-horse-1',ltvExecutionContract:'happyhorse-reference-video'});
 const metadata={...first,videoStartFrameNodeId:'first',ltvReferencePlan:{prompt:'',references:[{kind:'image',nodeId:'first',url:'https://example.com/a.png'}]}} as CanvasNodeMetadata;
 expect(()=>assertHappyHorseFirstFrame('happyhorse-1.0-i2v','1080','3','adaptive','false',metadata,{image:1,video:0,audio:0})).not.toThrow();
 expect(()=>assertHappyHorseFirstFrame('happyhorse-1.1-i2v','1080','3','adaptive','false',metadata,{image:1,video:0,audio:0})).toThrow();
 expect(()=>assertHappyHorseReferences('happyhorse-1.0-r2v','720','5','16:9','false',ref!,{image:2,video:0,audio:0})).not.toThrow();
 expect(happyHorseReferenceTaskMetadata(ref,'@图片2走向@图片1',2)).toEqual({providerOptions:{'dashscope-happyhorse-reference-video':{prompt:'[Image 2]走向[Image 1]'}}});
});
