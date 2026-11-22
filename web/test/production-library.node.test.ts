import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { readSkillResource } from "../src/lib/canvas/skill-resources";
import { buildProductionWorkflow, productionWorkflows } from "../src/lib/production-workflows";
import type { Skill } from "../src/services/api/skills";
import { buildNodeGenerationContext } from "../src/components/canvas/canvas-node-generation";
import { buildCanvasWorkflowOps, type CanvasWorkflowNodeInput } from "../src/lib/canvas/canvas-workflow-builder";
import { applyCanvasOperations, type CanvasSnapshot } from "../src/lib/canvas/canvas-operation-contract";
import { assertCanvasGenerationRequirements, buildGenerationConfig } from "../src/lib/canvas/canvas-project-generation";
import { defaultConfig, type AiConfig } from "../src/stores/use-config-store";
import { CanvasNodeType } from "../src/types/canvas";
import { normalizeAudioVoiceValue } from "../src/lib/audio-generation";

test("unconfigured speech template blocks the global default and preserves a custom voice ID", () => {
    const node = { id: "speech", type: CanvasNodeType.Audio, title: "旁白", position: { x: 0, y: 0 }, width: 350, height: 240, metadata: { generationMode: "audio" as const, model: "", audioVoice: "narrator-custom", audioSpeed: "1.25", audioFormat: "mp3", strictGenerationOptions: ["model", "audioVoice", "audioSpeed", "audioFormat"] as const } };
    const metadata = { ...node.metadata, strictGenerationOptions: [...node.metadata.strictGenerationOptions] };
    assert.throws(() => assertCanvasGenerationRequirements({ ...defaultConfig, model: "global-audio" }, { ...node, metadata }, "audio"), /模型.*停止生成/);
    assert.equal(normalizeAudioVoiceValue(" narrator-custom "), "narrator-custom");
});

const legacySeed = JSON.parse(fs.readFileSync(new URL("../../backend/internal/skills/seed/production-skills.json", import.meta.url), "utf8")) as Array<Record<string, unknown>>;
const seed = legacySeed.map((item) => ({
    ...item,
    skillId: String(item.skill_id || ""),
    skillName: String(item.skill_name || ""),
    version: String(item.version || 1),
    isAdded: true,
})) as Skill[];
const catalog = JSON.parse(fs.readFileSync(new URL("../public/production-library/catalog.json", import.meta.url), "utf8"));
const luxRealNativeSeedIds = legacySeed
    .filter(item => typeof item.extra_info === "string"
        && item.extra_info.includes("来源：LuxReal 本地创作规则")
        && /来源标识：luxreal-rule:[A-Z0-9]+/.test(item.extra_info))
    .map(item => String(item.skill_id || ""));

test("catalog deduplicates sources and every usable item has complete native skill data", () => {
    assert.equal(new Set(catalog.items.map((item: { id: string }) => item.id)).size, catalog.items.length);
    const usable = catalog.items.filter((item: { available: boolean }) => item.available);
    const usableIds = usable.map((item: { id: string }) => item.id);
    const luxRealNativeSeedIdSet = new Set(luxRealNativeSeedIds);
    const productionSeedIds = seed.filter(skill => !luxRealNativeSeedIdSet.has(skill.skillId)).map(skill => skill.skillId);
    assert.equal(seed.length, 611);
    assert.equal(luxRealNativeSeedIds.length, 23, "the pre-existing LuxReal native seeds are not entries from the LTV asset source");
    assert.equal(luxRealNativeSeedIdSet.size, 23, "each LuxReal native seed must have a distinct stable ID");
    assert.equal(catalog.stats.communitySkills, 16, "community imports remain part of the complete native catalog");
    assert.equal(usable.length, 588);
    assert.equal(new Set(usableIds).size, 588);
    assert.deepEqual([...usableIds].sort(), [...productionSeedIds].sort(), "every non-LuxReal production seed is represented exactly once by the public skill catalog");
    assert.ok(luxRealNativeSeedIds.every(id => !usableIds.includes(id)), "LuxReal seeds stay out of the LTV-backed public skill catalog");
    assert.ok(usable.every((item: { id: string }) => seed.some(skill => skill.skillId === item.id && skill.instruction)));
    assert.equal(catalog.stats.referenceSkills, 589);
});

test("large skill resources can be read completely by the existing agent tool", () => {
    const skill = seed.reduce((a, b) => (a.files?.length || 0) > (b.files?.length || 0) ? a : b);
    assert.ok(skill.files!.length > 30);
    for (const file of skill.files!) {
        let offset: number | null = 0;
        let restored = "";
        while (offset !== null) {
            const part = readSkillResource(skill, file.path, offset);
            assert.ok("content" in part);
            restored += part.content;
            offset = part.nextOffset;
        }
        assert.equal(restored, file.content);
    }
    assert.throws(() => readSkillResource(skill, "../outside.txt"));
});

test("production workflows preserve the brief and native skill snapshot without submitting generation", () => {
    for (const workflow of productionWorkflows) {
        const skill = seed.find(item => item.skillName === workflow.skill);
        let id = 0;
        const result = buildProductionWorkflow(workflow, "测试简报，需要保留全部要求", skill, () => `test-${++id}`);
        assert.equal(new Set(result.nodes.map(node => node.id)).size, result.nodes.length);
        assert.equal(result.nodes[0].metadata?.content, "测试简报，需要保留全部要求");
        assert.ok(result.connections.every(edge => result.nodes.some(node => node.id === edge.fromNodeId) && result.nodes.some(node => node.id === edge.toNodeId)));
        assert.equal(result.nodes.filter(node => node.metadata?.status === "idle").length, workflow.stages.length);
        const stages = result.nodes.filter(node => node.metadata?.status === "idle");
        for (let index = 1; index < stages.length; index++) {
            assert.ok(stages[index].position.x >= stages[index - 1].position.x + stages[index - 1].width + 100, "native media nodes must not overlap adjacent stages");
            const target = stages[index];
            const inputs = result.connections.filter(edge => edge.toNodeId === target.id).map(edge => edge.fromNodeId);
            if (target.type === "audio") {
                assert.deepEqual(inputs, [stages[index - 1].id], "TTS must not read the brief or skill instructions");
                assert.equal(target.metadata?.prompt, "");
            } else {
                assert.ok(inputs.includes(result.nodes[0].id), "the original brief must remain an input");
                assert.ok(inputs.includes(stages[0].id), "media generation must retain the approved text plan");
                if (target.type === "video") {
                    assert.equal(target.metadata?.includeConnectedText, true);
                    assert.equal(target.metadata?.composerContent, target.metadata?.prompt, "retries must use the editable prompt, not append context repeatedly");
                }
            }
        }
        if (skill) assert.deepEqual(result.nodes.find(node => node.type === "skill")?.metadata?.skillSnapshot?.files, skill.files);
    }
    assert.throws(() => buildProductionWorkflow(productionWorkflows[0], "", undefined));
});

test("native generation receives the approved plan and frame, while TTS receives narration only", () => {
    const workflow = productionWorkflows[0];
    const result = buildProductionWorkflow(workflow, "保持红色外套", seed.find(skill => skill.skillName === workflow.skill));
    const plan = result.nodes.find(node => node.title === "导演与分镜")!;
    plan.metadata!.content = "已确认镜头：雨中跟拍，六秒，保持轴线";
    const frame = result.nodes.find(node => node.title === "关键帧")!;
    frame.metadata!.content = "data:image/png;base64,AA==";
    const video = result.nodes.find(node => node.title === "镜头视频")!;
    const context = buildNodeGenerationContext(video.id, result.nodes, result.connections, video.metadata!.composerContent!, [], video.metadata?.includeConnectedText !== true);
    assert.ok(context.prompt.includes(plan.metadata!.content));
    assert.ok(context.prompt.includes("保持红色外套"));
    assert.equal(context.referenceImages.length, 1);
    const originalVideoContext = buildNodeGenerationContext(video.id, result.nodes, result.connections, "手写镜头要求", [], true);
    assert.equal(originalVideoContext.prompt, "手写镜头要求");
    const voice = buildProductionWorkflow(productionWorkflows.find(item => item.id === "voice")!, "温暖自然", undefined);
    const narration = voice.nodes.find(node => node.title === "旁白文案")!;
    narration.metadata!.content = "欢迎来到映雪。";
    const audio = voice.nodes.find(node => node.title === "旁白配音")!;
    const spoken = buildNodeGenerationContext(audio.id, voice.nodes, voice.connections, audio.metadata!.composerContent!, []);
    assert.equal(spoken.prompt.trim(), "欢迎来到映雪。");
});

const emptyCanvas: CanvasSnapshot = { projectId: "compatibility-fixture", title: "制作兼容", nodes: [], connections: [], selectedNodeIds: [], viewport: { x: 0, y: 0, k: 1 } };

test("agent workflow parameters survive native operations and canvas save/restore without starting generation", () => {
    const config = { ...defaultConfig, imageModel: "default-image", videoModel: "default-video", audioModel: "default-audio" };
    const nodes: CanvasWorkflowNodeInput[] = [
        { ref: "image", kind: "image", title: "商品主视觉", prompt: "保留产品外观", model: "relay::product-image", size: "9:16", quality: "high", count: 2, transparentBackground: "false" },
        { ref: "video", kind: "video", title: "广告镜头", prompt: "六秒缓推", referenceRefs: ["image"], model: "relay::product-video", size: "9:16", seconds: "6", vquality: "1080", generateAudio: "false", watermark: "false" },
        { ref: "voice", kind: "audio", title: "旁白", prompt: "欢迎体验", model: "relay::voice", audioVoice: "approved-voice", audioFormat: "wav", audioSpeed: "0.9", audioInstructions: "温暖自然" },
        { ref: "legacy", kind: "image", title: "自由创作", prompt: "自由构图" },
    ];
    const ops = buildCanvasWorkflowOps({ nodes }, emptyCanvas, config);
    const after = JSON.parse(JSON.stringify(applyCanvasOperations(emptyCanvas, ops))) as CanvasSnapshot;
    const [image, video, voice, legacy] = after.nodes;
    assert.equal(image.metadata?.model, nodes[0].model);
    assert.equal(image.metadata?.size, "9:16");
    assert.equal(image.metadata?.quality, "high");
    assert.equal(image.metadata?.count, 2);
    assert.equal(image.metadata?.transparentBackground, "false");
    assert.deepEqual([video.metadata?.model, video.metadata?.seconds, video.metadata?.vquality, video.metadata?.generateAudio, video.metadata?.watermark], [nodes[1].model, "6", "1080", "false", "false"]);
    assert.deepEqual([voice.metadata?.model, voice.metadata?.audioVoice, voice.metadata?.audioFormat, voice.metadata?.audioSpeed, voice.metadata?.audioInstructions], [nodes[2].model, "approved-voice", "wav", "0.9", "温暖自然"]);
    assert.equal(video.metadata?.audioVoice, undefined);
    assert.equal(voice.metadata?.size, undefined);
    assert.equal(legacy.metadata?.model, "default-image");
    assert.equal(legacy.metadata?.strictGenerationOptions, undefined);
    assert.ok(video.metadata?.strictGenerationOptions?.includes("seconds"));
    assert.ok(after.connections.some(edge => edge.fromNodeId === image.id && edge.toNodeId === video.id));
    assert.equal(ops.some(op => op.type === "run_generation"), false);
});

test("explicit production model requirements reject a fallback but follow the user's current node selection", () => {
    const model = "relay::gpt-image-2";
    const config: AiConfig = {
        ...defaultConfig, model, imageModel: model, models: [model], imageModels: [model],
        channels: [{ id: "relay", name: "测试渠道", baseUrl: "/api", apiKey: "fixture-only", apiFormat: "openai", enabled: true, models: ["gpt-image-2"], modelCosts: [{ model: "gpt-image-2", capability: "image", billingMode: "fixed_request", unitPriceMicrocredits: 1 }] }],
    };
    const ops = buildCanvasWorkflowOps({ nodes: [{ ref: "identity", kind: "image", title: "身份卡", prompt: "保留角色", model: "source-only-model" }] }, emptyCanvas, config);
    const node = applyCanvasOperations(emptyCanvas, ops).nodes[0];
    const fallback = buildGenerationConfig(config, node, "image");
    assert.equal(fallback.model, model, "existing routing still produces its normal fallback");
    assert.throws(() => assertCanvasGenerationRequirements(fallback, node, "image"), /模型.*停止生成/);
    node.metadata!.model = model;
    assert.doesNotThrow(() => assertCanvasGenerationRequirements(buildGenerationConfig(config, node, "image"), node, "image"));
    node.metadata!.strictGenerationOptions = undefined;
    node.metadata!.model = "source-only-model";
    assert.doesNotThrow(() => assertCanvasGenerationRequirements(fallback, node, "image"), "ordinary nodes keep the original routing behavior");
});

test("production checks reject altered duration, aspect ratio and voice before dispatch", () => {
    const node = applyCanvasOperations(emptyCanvas, buildCanvasWorkflowOps({ nodes: [{ ref: "shot", kind: "video", title: "镜头", prompt: "跟拍", size: "9:16", seconds: "6" }] }, emptyCanvas, defaultConfig)).nodes[0];
    const matching = { ...defaultConfig, size: "9:16", videoSeconds: "6" };
    assert.doesNotThrow(() => assertCanvasGenerationRequirements(matching, node, "video"));
    assert.throws(() => assertCanvasGenerationRequirements({ ...matching, videoSeconds: "5" }, node, "video"), /视频时长/);
    assert.throws(() => assertCanvasGenerationRequirements({ ...matching, size: "16:9" }, node, "video"), /画幅/);
    assert.doesNotThrow(() => assertCanvasGenerationRequirements(defaultConfig, node, "image"), "a new generation mode does not inherit an unrelated mode's constraints");
    node.type = CanvasNodeType.Audio;
    node.metadata = { generationMode: "audio", audioVoice: "approved-voice", strictGenerationOptions: ["audioVoice"] };
    assert.throws(() => assertCanvasGenerationRequirements({ ...defaultConfig, audioVoice: "different-voice" }, node, "audio"), /音色/);
    assert.doesNotThrow(() => assertCanvasGenerationRequirements({ ...defaultConfig, audioVoice: "approved-voice" }, node, "audio"));
    for (const invalid of [{ model: " " }, { count: 0 }, { count: 1.5 }, { transparentBackground: "maybe" }]) {
        assert.throws(() => buildCanvasWorkflowOps({ nodes: [{ ref: "bad", kind: "image", title: "非法参数", prompt: "测试", ...invalid }] }, emptyCanvas, defaultConfig));
    }
});
