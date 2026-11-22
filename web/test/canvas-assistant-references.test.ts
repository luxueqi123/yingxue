import { expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { CanvasNodeType, type CanvasNodeData } from "@/types/canvas";
import type { Skill } from "@/services/api/skills";
import * as skills from "@/lib/canvas/skill-resources";
import { buildAssistantReferences, buildToolAgentMessages } from "@/components/canvas/canvas-assistant-online-tools";

const referencesUrl = new URL("../src/lib/canvas/canvas-assistant-references.ts", import.meta.url);
const references = existsSync(referencesUrl) ? await import(referencesUrl.href) : null;

test("在线 Agent 可读取画布保存的原始技能及全部配套文件，不受全局技能更新或未加入影响", () => {
    expect(typeof skills.canvasSkillResources).toBe("function");
    const fullFile = "原始配套规范".repeat(5000);
    const nodes = [{ id: "skill-node", type: CanvasNodeType.Skill, title: "原始技能", position: { x: 0, y: 0 }, width: 100, height: 100, metadata: {
        skillSnapshot: { id: "original", name: "原始技能", description: "完整规范", template: "原始主文件", files: [{ path: "shots/full.md", content: fullFile }], version: 3, category: "utility", outputMode: "workflow", outputContract: "" },
    } }] as CanvasNodeData[];
    const catalog = skills.canvasSkillResources([{ skillId: "original", skillName: "新版", instruction: "被修改", isAdded: true } as Skill], JSON.parse(JSON.stringify(nodes)));
    expect(catalog).toHaveLength(1);
    const source = catalog[0];
    expect(source.skillName).toBe("原始技能");
    expect(skills.readSkillResource(source)).toMatchObject({ instruction: "原始主文件", version: "3" });
    let text = "";
    let offset: number | null = 0;
    while (offset !== null) {
        const page = skills.readSkillResource(source, "shots/full.md", offset);
        text += page.content;
        offset = page.nextOffset;
    }
    expect(text).toBe(fullFile);
    expect(() => skills.readSkillResource(source, "../outside.md")).toThrow();
});

test("选中的真实视频音频进入引用栏与文本上下文，不作为图片发送", () => {
    expect(references).not.toBeNull();
    const nodes = [CanvasNodeType.Video, CanvasNodeType.Audio].map((type, index) => ({ id: `media-${index}`, type, title: type, position: { x: 0, y: 0 }, width: 100, height: 100, metadata: { content: `/api/resources/${type}/file`, storageKey: `resource:${type}`, durationMs: 1500 } }));
    const result = references!.buildAssistantReferences(nodes, new Set(nodes.map(node => node.id)));
    expect(result).toHaveLength(2);
    for (const reference of result) {
        expect(reference.dataUrl).toBeUndefined();
        expect(reference.storageKey).toBeUndefined();
        expect(reference.text).toContain(reference.id);
        expect(reference.text).toContain("1.5 秒");
    }
});

test("工作台实际入口保留视频音频节点并将原引用送入Agent消息", async () => {
    const nodes = [CanvasNodeType.Video, CanvasNodeType.Audio].map((type, index) => ({
        id: `media-${index}`, type, title: type, position: { x: 0, y: 0 }, width: 100, height: 100,
        metadata: { storageKey: `resource:${type}`, durationMs: 1500 },
    }));
    const selected = nodes.map(node => node.id);
    const refs = buildAssistantReferences(nodes, new Set(selected));
    expect(refs).toHaveLength(2);
    const messages = await buildToolAgentMessages({ projectId: 'test', title: '制作', nodes, connections: [], selectedNodeIds: selected, viewport: { x: 0, y: 0, k: 1 } }, [], {
        id: 'user', role: 'user', text: '使用选中的素材', references: refs,
    });
    const user = messages.findLast(message => message.role === 'user');
    expect(JSON.stringify(user)).toContain('media-0');
    expect(JSON.stringify(user)).toContain('media-1');
    expect(JSON.stringify(user)).not.toContain('image_url');
});

test("仅有服务端资源标识的图片仍进入真实工作台引用链路", async () => {
    const node = { id: 'image', type: CanvasNodeType.Image, title: '参考图', position: { x: 0, y: 0 }, width: 100, height: 100, metadata: { storageKey: 'resource:reference-image' } };
    const refs = buildAssistantReferences([node], new Set([node.id]));
    expect(refs).toHaveLength(1);
    const messages = await buildToolAgentMessages({ projectId: 'test', title: '制作', nodes: [node], connections: [], selectedNodeIds: [node.id], viewport: { x: 0, y: 0, k: 1 } }, [], {
        id: 'user', role: 'user', text: '分析参考图', references: refs,
    });
    expect(JSON.stringify(messages.findLast(message => message.role === 'user'))).toContain('resource:reference-image');
    await expect(buildToolAgentMessages({ projectId: 'test', title: '制作', nodes: [node], connections: [], selectedNodeIds: [], viewport: { x: 0, y: 0, k: 1 } }, [], {
        id: 'user', role: 'user', text: '分析', references: [{ ...refs[0], storageKey: undefined, dataUrl: 'https://example.test/unsaved.png' }],
    })).rejects.toThrow('尚未同步到服务器');
});
