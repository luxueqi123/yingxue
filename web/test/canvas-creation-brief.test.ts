import { expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { strToU8, zipSync } from "fflate";
import { CanvasNodeType } from "@/types/canvas";
import type { Skill } from "@/services/api/skills";
import { buildCreationMentionReferences } from "@/pages/create/creation-references";
import { canvasResourceMentionToken } from "@/lib/canvas/canvas-resource-references";

const moduleUrl = new URL("../src/lib/canvas/canvas-creation-brief.ts", import.meta.url);
const bridge = existsSync(moduleUrl) ? await import(moduleUrl.href) : null;
const skill = {
    skillId: "original-skill", skillName: "完整技能", description: "说明", instruction: "原始制作规范\n".repeat(200),
    files: [{ path: "workflows/shot.md", content: "完整分镜文件\n".repeat(500) }],
    version: "1", tag: "影视", isAdded: false,
} as Skill;
const models = { text: "configured-text", image: "configured-image", video: "configured-video" };

test("账号切换或不支持的文档在创建项目之前失败，保留原简报以便重试", async () => {
    let scope = "alice";
    let projects = 0;
    const navigations: string[] = [];
    const launcher = bridge!.createCanvasCreationBriefLauncher({
        readSession: () => ({ userId: scope, scope, hydrated: true }),
        validateModels: () => undefined,
        createProject: async () => { projects += 1; return { id: "unexpected" }; },
        hasProject: () => true,
        flush: async () => undefined,
        navigate: (url: string) => navigations.push(url),
        warn: () => undefined,
    });
    const input = { prompt: "完整私有正文", attachments: [], skills: [], models, confirmTools: true };
    const switching = launcher.launch(input);
    scope = "bob";
    await expect(switching).rejects.toThrow("登录账号已变化");
    expect(projects).toBe(0);
    const unsupported = { ...input, attachments: [{ id: "pdf", name: "原稿.pdf", type: "application/pdf", url: "/unread.pdf", previewUrl: "", storageKey: "resource:pdf" }] };
    await expect(launcher.launch(unsupported)).rejects.toThrow("暂不支持解析");
    expect(unsupported.prompt).toBe("完整私有正文");
    expect(unsupported.attachments).toHaveLength(1);
    expect(projects).toBe(0);
    expect(navigations).toHaveLength(0);
});

test("消费状态保存失败只回滚消费标记，保留并发编辑并可再次恢复", async () => {
    expect(typeof bridge?.consumeCanvasCreationBrief).toBe("function");
    const created = await bridge!.buildCanvasCreationBrief({ prompt: "原始简报", attachments: [], skills: [], models, confirmTools: true }, { scope: "alice" });
    let current = created.nodes;
    let fail = true;
    const draft = bridge!.readCanvasCreationBrief(current, created.briefId, "alice")!;
    const dependencies = {
        isCurrent: () => true,
        readNodes: () => current,
        writeNodes: (next: typeof current) => { current = next; },
        persist: async () => {
            if (fail) {
                current = current.map((node: any) => ({ ...node, metadata: { ...node.metadata, content: "用户刚编辑的简报" } }));
                current.push({ ...current[0], id: "concurrent-node", metadata: { content: "并发新节点" } });
                throw new Error("保存失败");
            }
        },
    };
    await expect(bridge!.consumeCanvasCreationBrief(draft, dependencies)).rejects.toThrow("保存失败");
    expect(current).toHaveLength(2);
    expect(current[0].metadata.content).toBe("用户刚编辑的简报");
    expect(current[0].metadata.creationBrief.consumedAt).toBeUndefined();
    expect(bridge!.readCanvasCreationBrief(current, created.briefId, "alice").prompt).toContain("用户刚编辑的简报");
    fail = false;
    await bridge!.consumeCanvasCreationBrief(draft, dependencies);
    expect(bridge!.readCanvasCreationBrief(current, created.briefId, "alice")).toBeNull();
    expect(current).toHaveLength(2);
});

test("创作框实际上传与素材引用 token 映射到新节点，文档原件与正文分开持久化", async () => {
    const attachments = [
        { id: "upload:photo", name: "照片.png", type: "image/png", url: "/api/resources/photo/file", previewUrl: "/api/resources/photo/file", storageKey: "resource:photo" },
        { id: "asset:script", name: "原始剧本.txt", type: "text/plain", url: "/api/resources/script/file", previewUrl: "", storageKey: "resource:script" },
    ];
    const tokens = buildCreationMentionReferences([], attachments).map(canvasResourceMentionToken);
    const result = await bridge!.buildCanvasCreationBrief({ prompt: tokens.join(" 与 "), attachments, skills: [], models, confirmTools: true }, { scope: "alice", readDocumentBlob: async () => new Blob(["完整剧本正文"]) });
    const [image, document, brief] = result.nodes;
    expect(result.title).toBe("照片.png 与 原始剧本.txt");
    expect(brief.metadata.content).toBe(`@[node:${image.id}] 与 @[node:${document.id}]`);
    expect(document.metadata.content).toBe("完整剧本正文");
    expect(document.metadata.storageKey).toBeUndefined();
    expect(document.metadata.documentSource.storageKey).toBe("resource:script");
    expect(document.metadata.documentSource.url).toBe("/api/resources/script/file");
    await expect(bridge!.buildCanvasCreationBrief({ prompt: "@[skill:missing]", attachments: [], skills: [], models, confirmTools: true }, { scope: "alice" })).rejects.toThrow("没有对应技能");
});

test("创建简报的重复点击和持久化失败重试只创建一个项目，保存成功后才导航", async () => {
    expect(typeof bridge?.createCanvasCreationBriefLauncher).toBe("function");
    let projects = 0;
    let writes = 0;
    const navigations: string[] = [];
    const warnings: unknown[] = [];
    const launcher = bridge!.createCanvasCreationBriefLauncher({
        readSession: () => ({ userId: "alice", scope: "alice", hydrated: true }),
        validateModels: () => undefined,
        createProject: async () => { projects += 1; return { id: "project-one", syncError: new Error("offline") }; },
        hasProject: () => true,
        flush: async () => { writes += 1; if (writes === 1) throw new Error("disk full"); },
        navigate: (url: string) => navigations.push(url),
        warn: (error: unknown) => warnings.push(error),
    });
    const input = { prompt: "完整私有正文", attachments: [], skills: [skill], models, confirmTools: true };
    const first = launcher.launch(input);
    const concurrent = launcher.launch(input);
    expect(concurrent).toBe(first);
    await expect(first).rejects.toThrow("disk full");
    expect(projects).toBe(1);
    expect(navigations).toHaveLength(0);
    await launcher.launch(input);
    expect(projects).toBe(1);
    expect(navigations).toHaveLength(1);
    expect(navigations[0]).toMatch(/^\/canvas\/project-one\?brief=[\w-]+$/);
    expect(navigations[0]).not.toContain("私有");
    expect(warnings).toHaveLength(1);
});

test("创作简报保留真实媒体、完整技能文件与实际引用，不创建生成占位模板", async () => {
    expect(bridge).not.toBeNull();
    const result = await bridge!.buildCanvasCreationBrief({
        prompt: "用 @[attachment:photo] 及 @[skill:original-skill] 制作短片", models, confirmTools: true, skills: [skill],
        attachments: [
            { id: "photo", name: "照片.png", type: "image/png", url: "/api/resources/image/file", dataUrl: "/api/resources/image/file", previewUrl: "/api/resources/image/file", storageKey: "resource:image", width: 1200, height: 800, bytes: 123 },
            { id: "clip", name: "片段.mp4", type: "video/mp4", url: "/api/resources/video/file", previewUrl: "/api/resources/video/file", storageKey: "resource:video", durationMs: 18000 },
            { id: "music", name: "音乐.wav", type: "audio/wav", url: "/api/resources/audio/file", previewUrl: "/api/resources/audio/file", storageKey: "resource:audio", durationMs: 32000 },
        ],
    }, { scope: "alice", now: 1000, id: "brief-one" });
    expect(result.nodes.map((node: { type: string }) => node.type)).toEqual([CanvasNodeType.Image, CanvasNodeType.Video, CanvasNodeType.Audio, CanvasNodeType.Skill, CanvasNodeType.Text]);
    const [image, video, audio, skillNode, brief] = result.nodes;
    expect(image.metadata.content).toBe("/api/resources/image/file");
    expect(image.width / image.height).toBeCloseTo(1.5);
    expect(video.metadata.storageKey).toBe("resource:video");
    expect(audio.metadata.durationMs).toBe(32000);
    expect(skillNode.metadata.skillSnapshot.template).toBe(skill.instruction);
    expect(skillNode.metadata.skillSnapshot.files).toEqual(skill.files);
    expect(brief.metadata.content).toContain(`@[node:${image.id}]`);
    expect(brief.metadata.content).toContain("@[skill:original-skill]");
    expect(brief.metadata.creationBrief.models).toEqual(models);
    expect(brief.metadata.creationBrief.confirmTools).toBe(true);
    expect(brief.metadata.creationBrief.autoSend).toBe(false);
    expect(brief.metadata.creationBrief.referenceNodeIds).toEqual(result.nodes.slice(0, -1).map((node: { id: string }) => node.id));
    expect(result.connections).toHaveLength(4);
    expect(result.nodes.every((node: { metadata?: { status?: string } }) => node.metadata?.status !== "loading")).toBe(true);
    expect(skill.files![0].content).toBe("完整分镜文件\n".repeat(500));
});

test("文本与 DOCX 文档完整解析入真实文本节点，未用文件名或摘要代替", async () => {
    const fullText = "完整文档段落，保留所有内容。\n".repeat(3000);
    const docxText = "DOCX完整正文".repeat(1200);
    const docx = zipSync({
        "[Content_Types].xml": strToU8('<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'),
        "_rels/.rels": strToU8('<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'),
        "word/document.xml": strToU8(`<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>${docxText}</w:t></w:r></w:p></w:body></w:document>`),
    });
    const result = await bridge!.buildCanvasCreationBrief({ prompt: "阅读两份文档", models, confirmTools: false, skills: [], attachments: [
        { id: "text", name: "剧本.md", type: "text/markdown", url: "/text", previewUrl: "/text", storageKey: "resource:text", bytes: fullText.length },
        { id: "docx", name: "简报.docx", type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", url: "/docx", previewUrl: "/docx", storageKey: "resource:docx", bytes: docx.length },
    ] }, { scope: "alice", readDocumentBlob: async (attachment: { id: string }) => attachment.id === "text" ? new Blob([fullText]) : new Blob([docx]) });
    expect(result.nodes[0].metadata.content).toBe(fullText);
    expect(result.nodes[1].metadata.content.trim()).toBe(docxText);
    expect(result.nodes[1].metadata.documentSource.storageKey).toBe("resource:docx");
    expect(result.nodes.slice(0, 2).every((node: { type: string }) => node.type === CanvasNodeType.Text)).toBe(true);
});

test("大厅对话承接不保留简报占位节点，保存完整草稿且保留真实引用", async () => {
    const built = await bridge!.buildCanvasCreationBrief({ prompt: "制作一段雪景短片", attachments: [], skills: [skill], models, confirmTools: true }, { scope: "alice", now: 1000 });
    const content = bridge!.canvasConversationContent(built, "alice", 1100);
    expect(content.nodes).toHaveLength(1);
    expect(content.nodes[0].type).toBe(CanvasNodeType.Skill);
    expect(content.connections).toEqual([]);
    expect(content.agentDraft.prompt).toContain("制作一段雪景短片");
    expect(content.agentDraft.models).toEqual(models);
    expect(content.agentDraft.scope).toBe("alice");
    expect(content.agentDraft.referenceNodeIds).toEqual(content.nodes.map((node: { id: string }) => node.id));
    expect(() => bridge!.canvasConversationContent(built, "bob", 1100)).toThrow();
    expect(() => bridge!.canvasConversationContent(built, "alice", 1000 + bridge!.CANVAS_CREATION_BRIEF_TTL)).toThrow();
});

test("草稿按用户与有效期恢复，保留模型和手动自动语义，消费后刷新不再次恢复", async () => {
    const built = await bridge!.buildCanvasCreationBrief({ prompt: "完整用户简报", attachments: [], skills: [skill], models, confirmTools: false }, { scope: "alice", now: 1000, id: "opaque-draft" });
    expect(bridge!.readCanvasCreationBrief(built.nodes, "opaque-draft", "bob", 1100)).toBeNull();
    expect(bridge!.readCanvasCreationBrief(built.nodes, "opaque-draft", "alice", 100)).toBeNull();
    expect(bridge!.readCanvasCreationBrief(built.nodes, "opaque-draft", "alice", 1000 + bridge!.CANVAS_CREATION_BRIEF_TTL)).toBeNull();
    const restored = bridge!.readCanvasCreationBrief(built.nodes, "opaque-draft", "alice", 1100);
    expect(restored.models).toEqual(models);
    expect(restored.confirmTools).toBe(false);
    expect(restored.autoSend).toBe(false);
    expect(restored.prompt).toContain("完整用户简报");
    expect(restored.prompt).toContain("@[skill:original-skill]");
    expect(restored.prompt).not.toContain("configured-video");
    expect(restored.models).toEqual(models);
    expect(restored.prompt).toContain("自动模式");
    const consumed = bridge!.markCanvasCreationBriefConsumed(built.nodes, "opaque-draft", "alice", 1100);
    expect(bridge!.readCanvasCreationBrief(consumed, "opaque-draft", "alice", 1200)).toBeNull();
    expect(bridge!.readCanvasCreationBrief(built.nodes, "opaque-draft", "alice", 1200)).not.toBeNull();
    expect(consumed.length).toBe(built.nodes.length);
    expect(consumed.map((node: { id: string }) => node.id)).toEqual(built.nodes.map((node: { id: string }) => node.id));
});
