import { expect, test } from "bun:test";
import { assessCaseModels } from "../src/lib/canvas/production-case-model-readiness";
import { defaultConfig, type AiConfig } from "../src/stores/use-config-store";
import { adaptLtvNativeProject } from "../src/lib/canvas/ltv-native-project";
import { readFileSync } from "node:fs";
import support from "../src/lib/production-case-support.json";

test("Seed Audio协议语义缺口先于账号模型配置显示", () => {
    const node: any = {id:"seed",type:"audio",title:"源音效",position:{x:0,y:0},width:350,height:240,metadata:{generationMode:"audio",ltvReferencePlan:{prompt:"描述雨声",references:[]},generationModelProvenance:{sourceModel:"seed-audio-1.0",convertedModel:"",operation:"text2audio"}}};
    const before=JSON.stringify(node);
    const result=assessCaseModels([node],{...defaultConfig,channels:[]});
    expect(result).toHaveLength(1);
    expect(result[0].status).toBe("mismatch");
    expect(result[0].reason).toContain("音效");
    expect(result[0].models).toEqual([]);
    expect(JSON.stringify(node)).toBe(before);
});

function fixture() {
    const converted = adaptLtvNativeProject({ nodes: [{ id: "v", type: "video", position: { x: 0, y: 0 }, data: { action: "video_generate", params: { model: "star-video2", modeType: "text2video", prompt: "雨夜镜头", ratio: "16:9", resolution: "4k", duration: 5, enableSound: "off", search_enabled: 1, count: 1 } } }], edges: [] }, { channels: [] }, "case", "案例");
    const name = "doubao-seedance-2-0-260128";
    const profile = { version: 1, video: { defaultRatio: "16:9", defaultResolution: "2160p", defaultOperation: "text_to_video", references: { promptMaxChars: 2000, maxImages: 9, maxVideos: 3, maxAudios: 3, minImages: 0, maxVideoDurationSeconds: 15, maxAudioDurationSeconds: 15 }, operations: ["text_to_video"], ratios: ["16:9"], resolutions: ["2160p"], duration: { selection: "enum", values: [5], default: 5 }, generateAudio: { supported: true, default: true }, watermark: { supported: false, default: false } } };
    const config = { ...defaultConfig, channels: [{ id: "ark", name: "fixture", enabled: true, baseUrl: "https://example.test", apiKey: "fixture", models: [name], interfaceType: "volcengine-ark-video", modelCosts: [{ model: name, capability: "video", protocol: "volcengine-ark-video", capabilityConfig: profile }] }] } as AiConfig;
    return { nodes: converted.project.nodes, config };
}

test("fresh matching protocol resolves static waiting records without changing source or executing models", () => {
    const { nodes, config } = fixture();
    const original = JSON.stringify(nodes);
    expect(assessCaseModels(nodes, { ...config, channels: [] })[0].status).toBe("unconnected");
    expect(assessCaseModels(nodes, config)[0].status).toBe("ready");
    expect(JSON.stringify(nodes)).toBe(original);
    expect(nodes[0].metadata?.model).toBe("");
});

test("matching protocol with unsupported duration is not reported ready", () => {
    const { nodes, config } = fixture();
    nodes[0].metadata!.seconds = "30";
    expect(assessCaseModels(nodes, config)[0].status).toBe("mismatch");
});

test("模型预检保留来源和转换目标，不把协议匹配当作模型等价", () => {
    const { nodes, config } = fixture();
    const provenance = { sourceModel: "source-video", convertedModel: "legacy::converted-video", operation: "text2video" };
    nodes[0].metadata = { ...nodes[0].metadata, generationModelProvenance: provenance };
    const before = JSON.stringify(nodes);
    expect(assessCaseModels(nodes, config)[0].provenance).toEqual(provenance);
    expect(assessCaseModels(nodes, { ...config, channels: [] })[0].provenance).toEqual(provenance);
    expect(JSON.stringify(nodes)).toBe(before);
    delete nodes[0].metadata.generationModelProvenance;
    expect(assessCaseModels(nodes, config)[0].provenance).toBeUndefined();
});

test("disabled, unauthenticated and wrong-protocol channels are not connected models", () => {
    const { nodes, config } = fixture();
    config.channels[0].enabled = false;
    expect(assessCaseModels(nodes, config)[0].status).toBe("unconnected");
    config.channels[0].enabled = true;
    config.channels[0].apiKey = "";
    expect(assessCaseModels(nodes, config)[0].status).toBe("unconnected");
    config.channels[0].apiKey = "fixture";
    config.channels[0].modelCosts![0].protocol = "minimax-video";
    expect(assessCaseModels(nodes, config)[0].status).toBe("unconnected");
});

test("source media without generation requirements is not a pending model", () => {
    const { nodes, config } = fixture();
    nodes[0].metadata = { content: "https://example.test/video.mp4" };
    expect(assessCaseModels(nodes, config)).toEqual([]);
});

test("all archived generation nodes are assessed without treating media-only nodes as models", () => {
    for (const entry of support) {
        const project = JSON.parse(readFileSync(new URL("../public" + entry.snapshotPath, import.meta.url), "utf8"));
        expect(assessCaseModels(project.nodes, { ...defaultConfig, channels: [] }).length).toBe(entry.generationNodeCount);
    }
});

test("原生首帧视频按图生视频合同核对，不把参考媒体算作制作节点", () => {
    const { nodes, config } = fixture();
    const target = { ...nodes[0], metadata: { generationMode: "video" as const, prompt: "新镜头", generationInputRequirements: { image: 1, text: 1 }, videoEditOperation: "image_to_video" as const, seconds: "5", strictGenerationOptions: ["seconds" as const] } };
    const input = { ...nodes[0], id: "reference", type: "image" as any, metadata: { content: "/reference.webp" } };
    const edges = [{ id: "edge", fromNodeId: input.id, toNodeId: target.id }];
    const unconnected = assessCaseModels([input, target], { ...config, channels: [] }, edges);
    expect(unconnected).toHaveLength(1);
    expect(unconnected[0].status).toBe("unconnected");
    const before = JSON.stringify(target);
    expect(assessCaseModels([input, target], config, edges)[0].status).toBe("mismatch");
    expect(JSON.stringify(target)).toBe(before);
});
