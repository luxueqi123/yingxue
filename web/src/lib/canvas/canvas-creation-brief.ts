import { nanoid } from "nanoid";
import { getNodeSpec } from "@/constant/canvas";
import { decodeNovelText } from "@/lib/canvas/canvas-document";
import type { CreationAttachment } from "@/pages/create/creation-assets";
import type { Skill } from "@/services/api/skills";
import { CanvasNodeType, type CanvasConnection, type CanvasCreationBriefDraft, type CanvasNodeData, type CanvasNodeMetadata } from "@/types/canvas";

export type CanvasCreationBriefInput = {
    prompt: string;
    attachments: CreationAttachment[];
    skills: Skill[];
    models: CanvasCreationBriefDraft["models"];
    confirmTools: boolean;
    entryMode?: NonNullable<CanvasCreationBriefDraft["entryMode"]>;
    requireTextModel?: boolean;
};

export const CANVAS_CREATION_BRIEF_TTL = 30 * 60 * 1000;
export type CanvasCreationBriefPrefill = CanvasCreationBriefDraft & { nodeId: string; prompt: string };

type BriefBuildOptions = { scope: string; now?: number; id?: string; readDocumentBlob?: (attachment: CreationAttachment) => Promise<Blob> };

async function loadDocumentBlob(attachment: CreationAttachment) {
    if (attachment.storageKey) {
        const { getMediaBlob } = await import("@/services/file-storage");
        const stored = await getMediaBlob(attachment.storageKey);
        if (stored) return stored;
    }
    if (!attachment.url) throw new Error(`无法读取文档「${attachment.name}」，请重新上传。`);
    const response = await fetch(attachment.url, { credentials: "same-origin" });
    if (!response.ok) throw new Error(`读取文档「${attachment.name}」失败（${response.status}）。`);
    return response.blob();
}

export async function readCreationDocument(attachment: CreationAttachment, readBlob: NonNullable<BriefBuildOptions["readDocumentBlob"]> = loadDocumentBlob) {
    const name = attachment.name.toLowerCase();
    const docx = name.endsWith(".docx");
    const text = /\.(txt|md|markdown|csv|tsv|json|html?|xml|srt|vtt)$/.test(name);
    if (!docx && !text) throw new Error(`暂不支持解析文档「${attachment.name}」。请转换为 DOCX、TXT 或 Markdown 后重试，当前简报和附件已保留。`);
    const buffer = await (await readBlob(attachment)).arrayBuffer();
    const content = docx ? (await (await import("mammoth/mammoth.browser")).extractRawText({ arrayBuffer: buffer })).value : decodeNovelText(buffer);
    if (!content.trim()) throw new Error(`文档「${attachment.name}」未提取到正文，当前输入已保留。`);
    return content;
}

function createReferenceNode(type: CanvasNodeType, title: string, y: number, metadata: CanvasNodeMetadata): CanvasNodeData {
    const spec = getNodeSpec(type);
    return { id: nanoid(), type, title, position: { x: 0, y }, width: spec.width, height: spec.height, metadata: { ...spec.metadata, ...metadata } };
}

export async function buildCanvasCreationBrief(input: CanvasCreationBriefInput, options: BriefBuildOptions) {
    if (!options.scope.trim() || options.scope === "guest") throw new Error("请先登录后创建画布简报。");
    if (!input.prompt.trim() && !input.attachments.length && !input.skills.length) throw new Error("请填写创作简报或选择参考资料。");
    const nodes: CanvasNodeData[] = [];
    const attachmentNodes = new Map<string, string>();
    let y = 0;
    for (const attachment of input.attachments) {
        const type = attachment.type.startsWith("image/") ? CanvasNodeType.Image : attachment.type.startsWith("video/") ? CanvasNodeType.Video : attachment.type.startsWith("audio/") ? CanvasNodeType.Audio : CanvasNodeType.Text;
        const content = type === CanvasNodeType.Text
            ? await readCreationDocument(attachment, options.readDocumentBlob ?? loadDocumentBlob)
            : attachment.url || ("dataUrl" in attachment ? attachment.dataUrl : "");
        if (!content || (content.startsWith("blob:") && !attachment.storageKey)) throw new Error(`「${attachment.name}」缺少可恢复的真实资源，请重新上传。`);
        const width = "width" in attachment ? attachment.width : undefined;
        const height = "height" in attachment ? attachment.height : undefined;
        const node = createReferenceNode(type, attachment.name, y, {
            content,
            ...(type === CanvasNodeType.Text
                ? { documentSource: { storageKey: attachment.storageKey, url: attachment.url, name: attachment.name, mimeType: attachment.type, bytes: attachment.bytes } }
                : { storageKey: attachment.storageKey }),
            mimeType: attachment.type, bytes: attachment.bytes,
            naturalWidth: width, naturalHeight: height, durationMs: "durationMs" in attachment ? attachment.durationMs : undefined,
            status: "success",
        });
        if (width && height && width > 0 && height > 0) { node.width = Math.min(720, width); node.height = node.width * height / width; }
        nodes.push(node);
        attachmentNodes.set(attachment.id, node.id);
        attachmentNodes.set(`upload:${attachment.id}`, node.id);
        if (attachment.id.startsWith("asset:")) attachmentNodes.set(attachment.id.slice(6), node.id);
        y += node.height + 64;
    }
    for (const skill of input.skills) {
        if (!skill.skillId || !skill.instruction?.trim()) throw new Error(`技能「${skill.skillName}」缺少完整正文，请重新加载后重试。`);
        const node = createReferenceNode(CanvasNodeType.Skill, skill.skillName, y, {
            skillId: skill.skillId, skillVersion: Number.parseInt(skill.version, 10) || 1,
            skillSnapshot: {
                id: skill.skillId, name: skill.skillName, description: skill.description, category: "utility",
                template: skill.instruction, outputMode: "workflow", outputContract: "", version: Number.parseInt(skill.version, 10) || 1,
                tags: skill.tag ? [skill.tag] : [], files: skill.files?.map(file => ({ ...file })),
            },
            status: "success",
        });
        nodes.push(node);
        y += node.height + 64;
    }
    const referenceNodeIds = nodes.map(node => node.id);
    const prompt = input.prompt.replace(/@\[(attachment|asset|node|skill):([^\]]+)\]/g, (token, kind: string, id: string) => {
        if (kind === "skill") {
            if (!input.skills.some(skill => skill.skillId === id)) throw new Error(`简报中的引用 ${token} 没有对应技能，请重新选择。`);
            return token;
        }
        const nodeId = attachmentNodes.get(id);
        if (!nodeId) throw new Error(`简报中的引用 ${token} 没有对应附件，请重新选择。`);
        return `@[node:${nodeId}]`;
    });
    const now = options.now ?? Date.now();
    const briefId = options.id ?? nanoid();
    const brief = createReferenceNode(CanvasNodeType.Text, "创作简报", 0, {
        content: prompt, status: "success",
        creationBrief: { id: briefId, scope: options.scope, createdAt: now, expiresAt: now + CANVAS_CREATION_BRIEF_TTL, referenceNodeIds, models: { ...input.models }, confirmTools: input.confirmTools, autoSend: false, entryMode: input.entryMode },
    });
    brief.position.x = 820;
    const connections: CanvasConnection[] = referenceNodeIds.map(id => ({ id: nanoid(), fromNodeId: id, toNodeId: brief.id }));
    const title = prompt.replace(/@\[(node|skill):([^\]]+)\]/g, (_token, kind: string, id: string) =>
        (kind === "skill" ? input.skills.find(skill => skill.skillId === id)?.skillName : nodes.find(node => node.id === id)?.title) || "",
    ).replace(/\s+/g, " ").trim().slice(0, 36) || "新的创作简报";
    return { title, briefId, nodes: [...nodes, brief], connections };
}

export function readCanvasCreationBrief(nodes: CanvasNodeData[], id: string, scope: string, now = Date.now()): CanvasCreationBriefPrefill | null {
    if (!id || !scope || scope === "guest") return null;
    const node = nodes.find(item => item.metadata?.creationBrief?.id === id);
    const draft = node?.metadata?.creationBrief;
    if (!node || !draft || draft.scope !== scope || draft.consumedAt !== undefined) return null;
    if (!Number.isFinite(draft.createdAt) || !Number.isFinite(draft.expiresAt) || draft.createdAt > now || draft.expiresAt <= now || draft.expiresAt > draft.createdAt + CANVAS_CREATION_BRIEF_TTL) return null;
    if (typeof draft.confirmTools !== "boolean" || draft.autoSend !== false || !draft.models || ![draft.models.text, draft.models.image, draft.models.video].every(value => typeof value === "string") || !Array.isArray(draft.referenceNodeIds)) return null;
    if (draft.entryMode !== undefined && !["agent", "text", "image", "video"].includes(draft.entryMode)) return null;
    const references = draft.referenceNodeIds.map(nodeId => nodes.find(item => item.id === nodeId));
    if (references.some(item => !item)) throw new Error("简报的参考节点已被删除，请重新选择参考资料。");
    const referenceText = references.map(item => {
        const ref = item!;
        const skillId = ref.metadata?.skillSnapshot?.id;
        return `- ${ref.title}：@[node:${ref.id}]${skillId ? ` @[skill:${skillId}]` : ""}`;
    }).join("\n");
    const modeText = draft.confirmTools ? "手动模式：执行写入或生成工具前先确认。" : "自动模式：我发送后可继续执行工具，保留所选技能的审阅要求。";
    const entryModeText = draft.entryMode ? `创作方向：${draft.entryMode === "agent" ? "Agent 协作" : draft.entryMode === "text" ? "文本" : draft.entryMode === "image" ? "图片" : "视频"}` : "";
    return { ...draft, models: { ...draft.models }, referenceNodeIds: [...draft.referenceNodeIds], nodeId: node.id, prompt: [node.metadata?.content || "", referenceText ? `参考资料（真实画布节点）：\n${referenceText}` : "", entryModeText, modeText].filter(Boolean).join("\n\n") };
}

export function markCanvasCreationBriefConsumed(nodes: CanvasNodeData[], id: string, scope: string, now = Date.now()) {
    const draft = readCanvasCreationBrief(nodes, id, scope, now);
    if (!draft) return nodes;
    return nodes.map(node => node.id === draft.nodeId ? { ...node, metadata: { ...node.metadata, creationBrief: { ...node.metadata!.creationBrief!, consumedAt: now } } } : node);
}

/** Reuse reference parsing without persisting a synthetic brief node on the canvas. */
export function canvasConversationContent(brief: Awaited<ReturnType<typeof buildCanvasCreationBrief>>, scope: string, now = Date.now()) {
    const draft = readCanvasCreationBrief(brief.nodes, brief.briefId, scope, now);
    if (!draft) throw new Error("创作需求已过期或账号已变化，请重新提交。");
    return {
        nodes: brief.nodes.filter(node => node.id !== draft.nodeId),
        connections: brief.connections.filter(connection => connection.fromNodeId !== draft.nodeId && connection.toNodeId !== draft.nodeId),
        agentDraft: { scope, prompt: draft.prompt, referenceNodeIds: draft.referenceNodeIds, models: draft.models, confirmTools: draft.confirmTools },
        starterMode: "freeform" as const,
    };
}

export async function consumeCanvasCreationBrief(draft: CanvasCreationBriefPrefill, dependencies: {
    isCurrent: () => boolean;
    readNodes: () => CanvasNodeData[];
    writeNodes: (nodes: CanvasNodeData[]) => void;
    persist: () => Promise<void>;
}) {
    if (!dependencies.isCurrent()) throw new Error("项目或登录账号已变化，请重新打开简报。");
    const now = Date.now();
    const before = dependencies.readNodes();
    const marked = markCanvasCreationBriefConsumed(before, draft.id, draft.scope, now);
    if (marked === before) throw new Error("简报已恢复或已过期，请直接编辑画布中的创作简报。");
    dependencies.writeNodes(marked);
    try {
        await dependencies.persist();
        if (!dependencies.isCurrent()) throw new Error("项目或登录账号已变化，请重新打开简报。");
    } catch (error) {
        if (dependencies.isCurrent()) dependencies.writeNodes(dependencies.readNodes().map(node => {
            const current = node.metadata?.creationBrief;
            if (node.id !== draft.nodeId || current?.id !== draft.id || current.scope !== draft.scope || current.consumedAt !== now) return node;
            const { consumedAt: _consumedAt, ...unconsumed } = current;
            return { ...node, metadata: { ...node.metadata, creationBrief: unconsumed } };
        }));
        throw error;
    }
}

type CreationBriefLauncherDependencies = {
    readSession: () => { userId?: string; scope: string; hydrated: boolean };
    validateModels: (models: CanvasCreationBriefInput["models"], requireTextModel: boolean) => void;
    createProject: (brief: Awaited<ReturnType<typeof buildCanvasCreationBrief>>) => Promise<{ id: string; syncError?: unknown }>;
    hasProject: (id: string) => boolean;
    flush: () => Promise<void>;
    navigate: (url: string) => void;
    warn: (error: unknown) => void;
};

/** Keeps a failed local save retry attached to the project that was already created. */
export function createCanvasCreationBriefLauncher(dependencies: CreationBriefLauncherDependencies) {
    let inFlight: Promise<void> | null = null;
    let pending: { key: string; scope: string; id: string; briefId: string; syncError?: unknown; completed?: boolean } | null = null;
    const requireSession = (expectedScope?: string) => {
        const session = dependencies.readSession();
        if (!session.userId || session.scope === "guest" || session.scope !== session.userId || (expectedScope && session.scope !== expectedScope)) throw new Error("登录账号已变化，请重新打开创作页后重试。");
        if (!session.hydrated) throw new Error("画布仍在恢复，请稍后重试。");
        return session.scope;
    };
    const launch = (input: CanvasCreationBriefInput): Promise<void> => {
        if (inFlight) return inFlight;
        const run = async () => {
            const scope = requireSession();
            dependencies.validateModels(input.models, input.requireTextModel !== false);
            const key = JSON.stringify(input);
            if (!pending || pending.scope !== scope || pending.key !== key || !dependencies.hasProject(pending.id)) {
                const brief = await buildCanvasCreationBrief(input, { scope });
                requireSession(scope);
                dependencies.validateModels(input.models, input.requireTextModel !== false);
                const created = await dependencies.createProject(brief);
                pending = { ...created, key, scope, briefId: brief.briefId };
            }
            requireSession(scope);
            if (pending.completed) return;
            await dependencies.flush();
            requireSession(scope);
            if (pending.syncError) dependencies.warn(pending.syncError);
            dependencies.navigate(`/canvas/${encodeURIComponent(pending.id)}?brief=${encodeURIComponent(pending.briefId)}`);
            pending.completed = true;
        };
        inFlight = run().finally(() => { inFlight = null; });
        return inFlight;
    };
    return { launch };
}
