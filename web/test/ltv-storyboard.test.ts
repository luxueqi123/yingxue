import {test,expect} from 'bun:test';
import {mapLtvStoryboardRows} from '../src/lib/canvas/ltv-storyboard';

test('legacy screenplay preserves editable row fields and character image bindings',()=>{
 const source=[{hiddenUuid:'original-row',shotNumber:3,durationSeconds:4.5,characterAction:'转身，抬手',sceneTags:'室内，雨夜',propTags:'红伞',imageGenerationPrompt:'完整原图片提示词',videoMotionPrompt:'完整原运镜',characters:[{characterName:'甲',characterDescription:'原人物设定',characterImageUrl:'https://example.test/character.png'}]}];
 const before=JSON.stringify(source),result=mapLtvStoryboardRows('script',source);
 expect(result.issues).toEqual([]);expect(JSON.stringify(source)).toBe(before);
 expect(result.rows[0].performanceBlocking).toBe('转身，抬手');expect(result.rows[0].sceneTags).toBe('室内，雨夜');expect(result.rows[0].propTags).toBe('红伞');expect(result.rows[0].durationSeconds).toBe(4.5);
 expect(result.rows[0].imageGenerationPrompt).toBe('完整原图片提示词');expect(result.rows[0].characters[0].characterImageNodeId).toBe(result.media[0].id);
 expect(result.rows[0].assetBindings).toEqual([]);expect(result.aliases.get('original-row')).toBe('original-row');
});

test('unmapped screenplay data stays a blocker rather than being silently discarded',()=>{
 const result=mapLtvStoryboardRows('script',[{id:'same',shotNumber:1,durationSeconds:0,customDirection:{motion:'orbit'},videoReference:{url:'https://example.test/video.mp4'}},{id:'same',shotNumber:2,durationSeconds:4}]);
 expect(result.issues.some(x=>x.path.endsWith('customDirection'))).toBe(true);
 expect(result.issues.some(x=>x.path.endsWith('videoReference'))).toBe(true);
 expect(result.issues.some(x=>x.reason.includes('ID重复'))).toBe(true);
 expect(result.rows[0].durationSeconds).toBe(0);
});

test('reference segment remains preview data and empty foreign asset ids do not invent bindings',()=>{
 const reference={startTime:0,endTime:3.5,referenceFrameImage:'https://example.test/frame.jpg'};
 const result=mapLtvStoryboardRows('script',[{id:'row',shotNumber:1,durationSeconds:3.5,videoReference:reference,characters:[{characterName:'甲',characterAssetId:''}]}]);
 expect(result.issues).toEqual([]);
 expect(result.rows[0].videoReference).toEqual(reference);
 expect(result.rows[0].assetBindings).toEqual([]);
 expect(result.media).toEqual([]);
 const unresolved=mapLtvStoryboardRows('script',[{id:'row',shotNumber:1,durationSeconds:3.5,characters:[{characterName:'甲',characterAssetId:'foreign-id'}]}]);
 expect(unresolved.issues.some(issue=>issue.path.endsWith('characterAssetId'))).toBe(true);
});
