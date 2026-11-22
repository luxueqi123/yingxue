import { expect, test } from "bun:test";
import { resolveLtvSourceModel, normalizeLtvVideoEnhancementFields } from "../src/lib/canvas/ltv-parameter-layers";
import { adaptLtvNativeProject } from "../src/lib/canvas/ltv-native-project";

test('视频增强按源提交规则继承fps优先级及原模型别名，保持源记录不变', () => {
    const source = {model:'topaz-video-upscaler',specifiedModel:'apf-2',frameRate:60,frame_rate:30};
    expect(normalizeLtvVideoEnhancementFields(source)).toEqual({model:'topaz-video-upscaler',specifiedModel:'apo-8',fps:60});
    expect(source.specifiedModel).toBe('apf-2');
    expect(normalizeLtvVideoEnhancementFields({...source,fps:24})).toEqual({model:'topaz-video-upscaler',specifiedModel:'apo-8',fps:24});
    expect(normalizeLtvVideoEnhancementFields({...source,frameRate:null})).toEqual({model:'topaz-video-upscaler',specifiedModel:'apo-8',fps:30});
    expect(normalizeLtvVideoEnhancementFields({...source,model:'other'})).toEqual({...source,model:'other'});
});

test("原图像提交封套恢复真实模型，不改动源数据或其它节点类型", () => {
    const node = { id: "angle", type: "image", position: { x: 0, y: 0 }, data: { action: "image_generate", params: { model: "generic", settings: { model: "selected" }, modeType: "image2image", horizontal_angle: "270", vertical_angle: "15", zoom: "5", prompt: "" }, _retryMeta: { provider: "comfyai", model: "multiple-angles", taskType: "image" } } };
    const before = JSON.stringify(node);
    expect(resolveLtvSourceModel(node)).toBe("multiple-angles");
    expect(resolveLtvSourceModel({ ...node, type: "video" })).toBe("selected");
    expect(resolveLtvSourceModel({ ...node, data: { ...node.data, _retryMeta: { model: "wrong", taskType: "audio" } } })).toBe("selected");
    const result = adaptLtvNativeProject({ nodes: [node], edges: [] }, { channels: [] }, "case", "多角度");
    // The source model name stays recorded in the adaptation log; the request itself is now carried
    // by the canvas' own 多角度 prompt instead of being reported as an unmapped parameter.
    expect(JSON.stringify(result.project.adaptation.models)).toContain("multiple-angles");
    expect(JSON.stringify(result.issues)).not.toContain("horizontal_angle");
    expect(result.adoptable).toBe(true);
    expect(result.project.nodes[0].metadata!.prompt).toContain("向左旋转 90 度");
    expect(result.project.nodes[0].metadata!.prompt).toContain("俯视 15 度");
    expect(JSON.stringify(node)).toBe(before);
});
