import { CanvasNodeType, type CanvasConnection, type CanvasNodeData, type CanvasGenerationMode } from "@/types/canvas";
import type { Skill } from "@/services/api/skills";
import { getNodeSpec } from "@/constant/canvas";

export type ProductionWorkflow = { id: string; title: string; description: string; image: string; skill: string; category: string; stages: { title: string; mode: CanvasGenerationMode; prompt: string }[] };

export const productionWorkflows: ProductionWorkflow[] = [
    { id: "director", title: "电影分镜", description: "故事 · 镜头 · 画面 · 动态", image: "/production-library/editorial-covers/workflow-director.webp", skill: "电影级 AI 分镜导演", category: "drama", stages: [
        { title: "导演与分镜", mode: "text", prompt: "按已选导演技能分析创作简报，先整理连续性档案，再输出镜头、景别、运镜、时长、对白与声音设计。分阶段审阅，保留每轮修订。" },
        { title: "关键帧", mode: "image", prompt: "依据上游已确认镜头生成关键帧，保持角色、服饰、道具、光线与场景连续性。" },
        { title: "镜头视频", mode: "video", prompt: "依据已确认分镜与关键帧生成当前镜头，遵循运镜、动作、节奏与角色连续性。" },
    ] },
    { id: "character", title: "角色定妆", description: "角色档案 · 定妆 · 多视图", image: "/production-library/editorial-covers/workflow-character.webp", skill: "Cast Builder 角色资产创建", category: "drama", stages: [
        { title: "角色档案", mode: "text", prompt: "依据简报与角色资产技能整理外貌、服饰、性格、道具和不可变特征，逐项锁定。" },
        { title: "角色定妆", mode: "image", prompt: "使用已确认角色档案生成清晰定妆照，保持角色识别特征与服饰细节。" },
        { title: "角色三视图", mode: "image", prompt: "参考上游定妆照生成同一角色的正、侧、背三视图，保持身材比例、服装、发型与道具完全一致。" },
    ] },
    { id: "product", title: "商品广告", description: "产品事实 · 广告分镜 · 成片镜头", image: "/production-library/editorial-covers/workflow-product.webp", skill: "通用商品短片导演", category: "ecommerce", stages: [
        { title: "广告脚本", mode: "text", prompt: "使用商品短片导演规范整理产品事实、已证实卖点与受众，给出 15 秒或 30 秒分镜。先检查商品参考图和简报，资料不足时保留缺失项。" },
        { title: "商品视觉", mode: "image", prompt: "参考已上传产品图与广告脚本生成当前镜头画面，严格保持外观结构，不添加未经确认的产品功能。" },
        { title: "广告镜头", mode: "video", prompt: "根据确认的商品画面与脚本生成当前广告镜头，保持产品轮廓、材质、品牌文字和运动逻辑。" },
    ] },
    { id: "remake", title: "拉片与重拍", description: "上传参考 · 分析镜头 · 重新创作", image: "/production-library/editorial-covers/workflow-remake.webp", skill: "专业运镜指导", category: "drama", stages: [
        { title: "镜头分析", mode: "text", prompt: "请先确认用户已提供视频或关键帧参考，再分析景别、动作、运镜、光影、剪辑节奏和时长。无实际参考时不要编造拉片结果。输出可复用镜头语言与原创重拍方案。" },
        { title: "重拍关键帧", mode: "image", prompt: "依据已确认的原创重拍方案与用户素材生成关键帧，继承镜头语言，按用户要求调整主体与场景。" },
        { title: "重拍镜头", mode: "video", prompt: "用已确认关键帧与镜头分析生成重拍片段，检查动作、节奏、接镜与连续性。" },
    ] },
    { id: "music", title: "音乐影像", description: "叙事节奏 · 视觉段落 · MV 镜头", image: "/production-library/editorial-covers/workflow-music.webp", skill: "电影级 AI 视频提示词导演", category: "creative", stages: [
        { title: "MV 分镜", mode: "text", prompt: "根据用户提供的歌词、音乐结构或情绪要求，整理时间段、视觉母题、镜头情绪和转场。没有音频时不要编造 BPM 或节拍分析。" },
        { title: "视觉母题", mode: "image", prompt: "依据 MV 方案生成当前视觉段落的关键帧，统一角色、场景与色彩。" },
        { title: "MV 片段", mode: "video", prompt: "依据已确认视觉段落生成 MV 镜头，遵循镜头时长、情绪与运动要求。" },
    ] },
    { id: "voice", title: "配音工作室", description: "旁白文案 · 声音生成", image: "/production-library/editorial-covers/workflow-voice.webp", skill: "", category: "others", stages: [
        { title: "旁白文案", mode: "text", prompt: "根据简报整理适合朗读的旁白，只输出最终需要朗读的正文。不要输出标题、分析、括号标注或配音指令；用正常标点表达停顿。语气与音色在音频节点中设置。" },
        { title: "旁白配音", mode: "audio", prompt: "" },
    ] },
];

/** Native nodes only: the existing canvas owns generation, history, billing and retries. */
export function buildProductionWorkflow(workflow: ProductionWorkflow, brief: string, skill?: Skill, idFactory = () => crypto.randomUUID()) {
    if (workflow.skill && !skill?.instruction) throw new Error("工作流所需的完整技能尚未加载。");
    const nodes: CanvasNodeData[] = [];
    const connections: CanvasConnection[] = [];
    const connect = (from: string, to: string) => connections.push({ id: idFactory(), fromNodeId: from, toNodeId: to });
    const briefId = idFactory();
    nodes.push({ ...getNodeSpec(CanvasNodeType.Text), id: briefId, type: CanvasNodeType.Text, title: "创作简报", position: { x: 80, y: 100 }, metadata: { content: brief || "在这里填写创作要求，并将参考素材连到相关制作节点。", status: "success" } });
    let skillId: string | undefined;
    if (skill) {
        skillId = idFactory();
        nodes.push({ ...getNodeSpec(CanvasNodeType.Skill), id: skillId, type: CanvasNodeType.Skill, title: skill.skillName, position: { x: 80, y: 440 }, metadata: {
            status: "success", skillSnapshot: { id: skill.skillId, name: skill.skillName, description: skill.description, category: "storyboard", template: skill.instruction || "", files: skill.files, outputMode: "workflow", outputContract: "按当前阶段执行，保留审阅与质量检查。配套文件由画布 Agent 通过 canvas_get_skill 按需读取。", version: Number.parseInt(skill.version, 10) || 1, tags: [skill.tag] },
        } });
    }
    let stageX = 580;
    const textStageIds: string[] = [];
    workflow.stages.forEach((stage, index) => {
        const id = idFactory();
        const previous = index ? nodes[nodes.length - 1].id : briefId;
        const nodeType = { text: CanvasNodeType.Text, image: CanvasNodeType.Image, video: CanvasNodeType.Video, audio: CanvasNodeType.Audio }[stage.mode];
        const spec = getNodeSpec(nodeType);
        nodes.push({ ...spec, id, type: nodeType, title: stage.title, position: { x: stageX, y: 120 }, metadata: {
            ...spec.metadata, generationMode: stage.mode, prompt: stage.prompt, status: "idle", workflowTitle: workflow.title, workflowKind: "free",
            ...(stage.mode === "video" ? { includeConnectedText: true, composerContent: stage.prompt } : {}),
            ...(stage.mode === "audio" ? { composerContent: stage.prompt } : {}),
        } });
        stageX += spec.width + 140;
        connect(previous, id);
        // Native generation resolves direct inputs, so media stages need the approved plan as well as the previous frame.
        // TTS receives only narration; production instructions must not become spoken words.
        if (stage.mode !== "audio" && index > 0) {
            connect(briefId, id);
            textStageIds.filter(textId => textId !== previous).forEach(textId => connect(textId, id));
        }
        if (skillId && index === 0) connect(skillId, id);
        if (stage.mode === "text") textStageIds.push(id);
    });
    return { nodes, connections };
}
