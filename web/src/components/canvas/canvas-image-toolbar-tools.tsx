import { interfaceTranslator, type InterfaceMessageKey, type InterfaceTranslate } from "@/lib/interface-locale";
import type { ReactNode } from "react";
import { Brush, Camera, Copy, Crop, Eraser, FileText, Globe2, Grid2x2, Layers3, Lock, LockOpen, Maximize2, PencilLine, Scaling, SlidersHorizontal, Smile, SquareDashed, Sun, Upload } from "lucide-react";

import type { CanvasNodeData } from "@/types/canvas";
import { CANVAS_IMAGE_PRESETS } from "@/lib/canvas/canvas-image-presets";
import type { NodeToolbarGroup } from "@/lib/canvas/tool-registry";
import { translate } from "@/i18n";

type ImageNodeActionToolId =
    | "copyPrompt"
    | "reversePrompt"
    | "replace"
    | "resize"
    | "annotation"
    | "annotationEdit"
    | "textEdit"
    | "regionEdit"
    | "removeBackground"
    | "layerDecomposition"
    | "emotion"
    | "portraitTexture"
    | "crop"
    | "split"
    | "upscale"
    | "superResolve"
    | "angle"
    | "lighting"
    | "panorama"
    | "view"
    | "previs";

type ImageToolHandlers = {
    onUpload: (node: CanvasNodeData) => void;
    onToggleFreeResize: (node: CanvasNodeData) => void;
    onAnnotate: (node: CanvasNodeData) => void;
    onAnnotationEdit: (node: CanvasNodeData) => void;
    onTextEdit: (node: CanvasNodeData) => void;
    onRegionEdit: (node: CanvasNodeData) => void;
    onRemoveBackground: (node: CanvasNodeData) => void;
    onLayerDecomposition: (node: CanvasNodeData) => void;
    onEmotion: (node: CanvasNodeData) => void;
    onPortraitTexture: (node: CanvasNodeData) => void;
    onCrop: (node: CanvasNodeData) => void;
    onUpscale: (node: CanvasNodeData) => void;
    onSuperResolve: (node: CanvasNodeData) => void;
    onAngle: (node: CanvasNodeData) => void;
    onLighting: (node: CanvasNodeData) => void;
    onPanorama: (node: CanvasNodeData) => void;
    onPrevis: (node: CanvasNodeData) => void;
    onViewImage: (node: CanvasNodeData) => void;
    onCopyPrompt: (node: CanvasNodeData) => void;
    onReversePrompt: (node: CanvasNodeData) => void;
};

type ImageToolDefinition = {
    id: ImageNodeActionToolId;
    label: string;
    icon: (node: CanvasNodeData) => ReactNode;
    group: NodeToolbarGroup;
    order: number;
    section?: string;
    description?: string;
    active?: (node: CanvasNodeData) => boolean;
    run: (node: CanvasNodeData, handlers: ImageToolHandlers) => void;
};

const imageToolDefinitions: ImageToolDefinition[] = [
    // 平铺：直接改当前图片的高频编辑
    {
        id: "regionEdit",
        label: "canvasB.imageTools.regionEditLabel",
        description: "canvasB.imageTools.regionEditDesc",
        icon: () => <SquareDashed className="size-3.5" />,
        group: "primary",
        order: 10,
        run: (node, handlers) => handlers.onRegionEdit(node),
    },
    {
        id: "textEdit",
        label: "canvasB.imageTools.textEditLabel",
        description: "canvasB.imageTools.textEditDesc",
        icon: () => <FileText className="size-3.5" />,
        group: "primary",
        order: 15,
        run: (node, handlers) => handlers.onTextEdit(node),
    },
    // 画面调整：保持镜头不变，用模型改人像、光影或主体
    {
        id: "emotion",
        label: "canvasB.imageTools.emotionLabel",
        section: "canvasB.imageTools.sectionPortrait",
        description: "canvasB.imageTools.emotionDesc",
        icon: () => <Smile className="size-3.5" />,
        group: "adjust",
        order: 10,
        run: (node, handlers) => handlers.onEmotion(node),
    },
    {
        id: "portraitTexture",
        label: "canvasB.imageTools.portraitTextureLabel",
        section: "canvasB.imageTools.sectionPortrait",
        description: "canvasB.imageTools.portraitTextureDesc",
        icon: () => <SlidersHorizontal className="size-3.5" />,
        group: "adjust",
        order: 20,
        run: (node, handlers) => handlers.onPortraitTexture(node),
    },
    {
        id: "lighting",
        label: "canvasB.imageTools.lightingLabel",
        section: "canvasB.imageTools.sectionLighting",
        description: "canvasB.imageTools.lightingDesc",
        icon: () => <Sun className="size-3.5" />,
        group: "adjust",
        order: 30,
        run: (node, handlers) => handlers.onLighting(node),
    },
    {
        id: "removeBackground",
        label: "canvasB.imageTools.removeBackgroundLabel",
        section: "canvasB.imageTools.sectionSubject",
        description: "canvasB.imageTools.removeBackgroundDesc",
        icon: () => <Eraser className="size-3.5" />,
        group: "adjust",
        order: 50,
        run: (node, handlers) => handlers.onRemoveBackground(node),
    },
    {
        id: "layerDecomposition",
        label: "canvasB.imageTools.layerDecompositionLabel",
        section: "canvasB.imageTools.sectionSubject",
        description: "canvasB.imageTools.layerDecompositionDesc",
        icon: () => <Layers3 className="size-3.5" />,
        group: "adjust",
        order: 60,
        run: (node, handlers) => handlers.onLayerDecomposition(node),
    },
    // 镜头：换角度、换时间点或进入 3D 空间
    {
        id: "angle",
        label: "canvasB.imageTools.angleLabel",
        section: "canvasB.imageTools.sectionView",
        description: "canvasB.imageTools.angleDesc",
        icon: () => <Camera className="size-3.5" />,
        group: "camera",
        order: 10,
        run: (node, handlers) => handlers.onAngle(node),
    },
    {
        id: "panorama",
        label: "canvasB.imageTools.panoramaLabel",
        section: "canvasB.imageTools.sectionView",
        description: "canvasB.imageTools.panoramaDesc",
        icon: () => <Globe2 className="size-3.5" />,
        group: "camera",
        order: 20,
        run: (node, handlers) => handlers.onPanorama(node),
    },
    {
        id: "previs",
        label: "canvasB.imageTools.previsLabel",
        section: "canvasB.imageTools.sectionPrevis",
        description: "canvasB.imageTools.previsDesc",
        icon: () => <Layers3 className="size-3.5" />,
        group: "camera",
        order: 50,
        run: (node, handlers) => handlers.onPrevis(node),
    },
    // 图片工具：不调用模型的裁剪、尺寸和标记
    {
        id: "crop",
        label: "canvasB.imageTools.cropLabel",
        section: "canvasB.imageTools.sectionComposition",
        description: "canvasB.imageTools.cropDesc",
        icon: () => <Crop className="size-3.5" />,
        group: "process",
        order: 10,
        run: (node, handlers) => handlers.onCrop(node),
    },
    {
        id: "upscale",
        label: "canvasB.imageTools.upscaleLabel",
        section: "canvasB.imageTools.sectionComposition",
        description: "canvasB.imageTools.upscaleDesc",
        icon: () => <Scaling className="size-3.5" />,
        group: "process",
        order: 20,
        run: (node, handlers) => handlers.onUpscale(node),
    },
    {
        id: "annotation",
        section: "canvasB.imageTools.sectionSplitMark",
        description: "canvasB.imageTools.annotationDesc",
        label: "canvasB.imageTools.annotationLabel",
        icon: () => <PencilLine className="size-3.5" />,
        group: "process",
        order: 40,
        run: (node, handlers) => handlers.onAnnotate(node),
    },
    {
        id: "annotationEdit",
        section: "canvasB.imageTools.sectionSplitMark",
        description: "canvasB.imageTools.annotationEditDesc",
        label: "canvasB.imageTools.annotationEditLabel",
        icon: () => <Brush className="size-3.5" />,
        group: "process",
        order: 45,
        run: (node, handlers) => handlers.onAnnotationEdit(node),
    },
    {
        id: "split",
        label: "canvasB.imageTools.splitLabel",
        section: "canvasB.imageTools.sectionSplitMark",
        description: "canvasB.imageTools.splitDesc",
        icon: () => <Grid2x2 className="size-3.5" />,
        group: "process",
        order: 46,
        run: () => undefined,
    },
    {
        id: "view",
        label: "canvasB.imageTools.viewLabel",
        description: "canvasB.imageTools.viewDesc",
        icon: () => <Maximize2 className="size-3.5" />,
        group: "utility",
        order: 10,
        run: (node, handlers) => handlers.onViewImage(node),
    },
    {
        id: "replace",
        label: "canvasB.imageTools.replaceLabel",
        description: "canvasB.imageTools.replaceDesc",
        icon: () => <Upload className="size-3.5" />,
        group: "more",
        section: "canvasB.imageTools.sectionAssets",
        order: 45,
        run: (node, handlers) => handlers.onUpload(node),
    },
    {
        id: "copyPrompt",
        section: "canvasB.imageTools.sectionGenerationInfo",
        label: "canvasB.imageTools.copyPromptLabel",
        description: "canvasB.imageTools.copyPromptDesc",
        icon: () => <Copy className="size-3.5" />,
        group: "more",
        order: 50,
        run: (node, handlers) => handlers.onCopyPrompt(node),
    },
    {
        id: "reversePrompt",
        section: "canvasB.imageTools.sectionGenerationInfo",
        label: "canvasB.imageTools.reversePromptLabel",
        description: "canvasB.imageTools.reversePromptDesc",
        icon: () => <FileText className="size-3.5" />,
        group: "more",
        order: 60,
        run: (node, handlers) => handlers.onReversePrompt(node),
    },
    {
        id: "resize",
        label: "canvasB.imageTools.resizeLabel",
        description: "canvasB.imageTools.resizeDesc",
        section: "canvasB.imageTools.sectionNodeManagement",
        active: (node) => !node.metadata?.freeResize,
        icon: (node) => (node.metadata?.freeResize ? <LockOpen className="size-3.5" /> : <Lock className="size-3.5" />),
        group: "more",
        order: 70,
        run: (node, handlers) => handlers.onToggleFreeResize(node),
    },
];

const imageToolTextKeys: Record<string, InterfaceMessageKey> = {
    区域标注: "canvasCompleteUi.regionAnnotations",
    "框选多个区域，在提示词里用 @区域1、@区域2 分别描述修改": "completeUi.107",
    文字编辑: "completeUi.108",
    识别图片中的文字并逐行修改: "completeUi.109",
    表情调整: "completeUi.110",
    人像: "toolUi.portraits",
    "调整人物表情，生成新图片": "completeUi.111",
    质感调整: "canvasCompleteUi.textureAdjust",
    "设置肤质、光影与融合，再执行生成": "completeUi.112",
    打光: "completeUi.113",
    光影: "promptsUi.tagLighting",
    "调整光线方向、亮度与光效，生成新图片": "completeUi.114",
    电影级光影校正: "completeUi.115",
    "修正电影灯光，使场景更真实": "completeUi.116",
    去除背景: "imageNodeUi.removeBackground",
    主体与图层: "toolUi.subjectLayers",
    保留主体并生成透明背景图片: "completeUi.117",
    "AI 图层拆分": "imageNodeUi.layerSplit",
    识别并拆分为多个可独立编辑的图片图层: "completeUi.118",
    多角度: "completeUi.119",
    视角: "toolUi.viewAngle",
    "调整摄影机角度，生成新视角": "completeUi.120",
    全景图: "completeUi.121",
    "基于该图片创建 360° 全景查看节点": "completeUi.122",
    "画面推演-5秒前": "completeUi.123",
    画面推演: "toolUi.sceneInference",
    "生成 5 秒前的画面帧": "completeUi.124",
    "画面推演-3秒后": "completeUi.125",
    "生成 3 秒后的画面帧": "completeUi.126",
    多机位九宫格: "completeUi.127",
    分镜宫格: "toolUi.storyboardGrids",
    "生成 3x3 多机位联系表": "completeUi.128",
    剧情推演四宫格: "completeUi.129",
    "生成 2x2 剧情推演联系表": "completeUi.130",
    "25宫格连贯分镜": "completeUi.131",
    "生成 5x5 连贯分镜联系表": "completeUi.132",
    角色三视图: "projectUi.characterTurnaround",
    设定图: "toolUi.designSheets",
    "生成 16:9 角色三视图联系表": "completeUi.133",
    角色脸部三视图: "completeUi.134",
    "生成 3x2 角色脸部联系表": "completeUi.135",
    产品三视图: "completeUi.136",
    "生成 3x2 产品联系表": "completeUi.137",
    裁剪: "completeUi.138",
    构图与尺寸: "toolUi.compositionSize",
    "保留所选区域，生成新图片": "completeUi.139",
    调整尺寸: "canvasCompleteUi.resize",
    "插值放大像素尺寸，不是 AI 超分": "completeUi.140",
    拆分与标记: "toolUi.splitMark",
    "添加标记，另存为新图片": "completeUi.141",
    标注: "imageNodeUi.annotation",
    用画笔标记区域并让模型按标记修改: "completeUi.142",
    标注编辑: "imageNodeUi.annotationEditor",
    宫格切分: "sharedDialogsUi.gridSplit",
    按行列拆成多个图片节点: "completeUi.143",
    预览: "assetsUi.preview",
    替换图片: "projectUi.replaceImage",
    素材: "contextMaterialCategory",
    生成信息: "canvasUi.generationInfo",
    复制提示词: "creationPageCopyPrompt",
    反推提示词: "completeUi.144",
    锁定宽高比: "completeUi.145",
    节点管理: "toolUi.nodeManagement",
    常用操作: "toolUi.commonOperations",
};

function imageToolText(text: string, t: InterfaceTranslate) {
    return t(imageToolTextKeys[text] || text);
}

export function buildImageToolbarTools(node: CanvasNodeData, handlers: ImageToolHandlers, t: InterfaceTranslate = interfaceTranslator("zh-CN")) {
    return imageToolDefinitions.map((tool) => ({
        id: tool.id,
        label: imageToolText(tool.label, t),
        icon: tool.icon(node),
        group: tool.group,
        order: tool.order,
        section: tool.section ? imageToolText(tool.section, t) : undefined,
        description: tool.description ? imageToolText(tool.description, t) : undefined,
        active: tool.active?.(node),
        onClick: () => tool.run(node, handlers),
    }));
}

export type NineGridMenuItem = {
    id: string;
    label: string;
    section: string;
    sectionKey: string;
    description: string;
    placeholder?: string;
    toolId: number;
    toolIconName: string;
    ratio: string;
};

export function getNineGridMenuItems(t: InterfaceTranslate = interfaceTranslator("zh-CN")): NineGridMenuItem[] {
    return CANVAS_IMAGE_PRESETS.map((preset) => ({
        id: preset.key,
        label: t(`canvasB.imageTools.${preset.text}Label`),
        section: t(`canvasB.imageTools.${preset.section}`),
        sectionKey: preset.section,
        description: t(`canvasB.imageTools.${preset.text}Desc`),
        placeholder: preset.hasPlaceholder ? t(`canvasB.imageTools.${preset.text}Placeholder`) : undefined,
        toolId: preset.id,
        toolIconName: preset.icon,
        ratio: preset.ratio,
    }));
}
