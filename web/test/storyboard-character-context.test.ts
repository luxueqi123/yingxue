import { expect,test } from "bun:test";
import { createCanvasNode,createStoryboardRow,storyboardPromptTemplateMetadata } from "../src/lib/canvas/canvas-project-domain";
import { storyboardRowPrompt } from "../src/lib/canvas/storyboard-character-context";
import { synchronizeStoryboardReferencePlan } from "../src/lib/canvas/canvas-storyboard-materializer";
import { bindLtvCurrentReferences } from "../src/lib/canvas/ltv-runtime-references";
import { CanvasNodeType } from "../src/types/canvas";

test("当前人物描述进入普通提示词和模板变量，保留原文且不重复污染变量",()=>{
    const row=createStoryboardRow(1,{imageGenerationPrompt:'原始复杂画面描述',videoMotionPrompt:'原始运镜',characters:[{characterName:'映雪',characterDescription:'白衣红伞'}],imagePromptTemplateVariables:{首帧构图:'完整原画面'}});
    expect(storyboardRowPrompt(row,'image')).toContain('原始复杂画面描述');
    expect(storyboardRowPrompt(row,'video')).toContain('白衣红伞');
    expect(storyboardPromptTemplateMetadata(row,'image').promptTemplateVariables?.首帧构图).toContain('白衣红伞');
    row.characters[0].characterDescription='黑衣蓝伞';
    expect(storyboardPromptTemplateMetadata(row,'image').promptTemplateVariables?.首帧构图).not.toContain('白衣红伞');
    expect(row.imagePromptTemplateVariables?.首帧构图).toBe('完整原画面');
});

test("新增人物制作引用可撤销，同时保留原案例参考顺序",()=>{
    const nodes=['原参考二','原参考一','人物图'].map(title=>({...createCanvasNode(CanvasNodeType.Image,{x:0,y:0},{content:`https://example.test/${encodeURIComponent(title)}.png`}),id:title}));
    const original={ltvReferencePlan:bindLtvCurrentReferences('原提示词',['原参考二','原参考一'],nodes)};
    const bound=synchronizeStoryboardReferencePlan(original,'更新提示词',['人物图'],nodes);
    expect(bound.ltvReferencePlan?.references.map(ref=>ref.nodeId)).toEqual(['原参考二','原参考一','人物图']);
    const unbound=synchronizeStoryboardReferencePlan(bound,'再次更新',[],nodes);
    expect(unbound.ltvReferencePlan?.references.map(ref=>ref.nodeId)).toEqual(['原参考二','原参考一']);
    expect(original.ltvReferencePlan.prompt).toBe('原提示词');
    expect(unbound.ltvReferencePlan?.prompt).toBe('再次更新');
});
