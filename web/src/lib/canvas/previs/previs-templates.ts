import { nanoid } from "nanoid";

import { createPrevisActor, createPrevisCamera, createPrevisLight, createPrevisObject, PREVIS_ACTOR_COLORS, createPrevisModel } from "@/lib/canvas/previs/previs-scene";
import { previsHorizontalFov } from "@/lib/canvas/previs/previs-optics";
import type { PrevisCamera, PrevisLight, PrevisObject, PrevisScene, PrevisShot } from "@/types/previs";

/**
 * 新建场景模板。
 *
 * 为什么存在：createPrevisScene 无条件塞一个默认演员，产品/空场景根本不需要它，
 * 而双人、走位这类常见开局每次都要手工摆一遍。模板把「开局布局」变成显式选择。
 *
 * 硬约束：
 * - 纯函数 + 确定性布局。同一模板每次生成的结构完全一致，只有 id 与时间戳不同。
 * - 每次调用都产生独立 id（工厂内部 nanoid），两个实例不会共享对象身份。
 * - 不改 PrevisScene schema/version：模板只是预填内容，不引入新字段。
 * - 对象之间 XZ 占位不重叠，判据与 resolvePrevisPlacement 完全一致。
 */

export type PrevisTemplateId = "empty" | "monologue" | "dialogue" | "blocking" | "product" | "threebox-wooden-stage-static" | "threebox-ancient-street-static";

export type PrevisTemplate = {
    id: PrevisTemplateId;
    name: string;
    description: string;
    /** 列表里给用户的预期提示，不参与生成。 */
    summary: string;
};

/** 展示顺序即用户看到的顺序：空场景在最前，其余按上手复杂度递增。 */
export const PREVIS_TEMPLATES: PrevisTemplate[] = [
    { id: "empty", name: "空场景", description: "只有摄影机和三点布光，没有任何演员或道具。", summary: "摄影机 + 布光" },
    { id: "monologue", name: "单人对白", description: "一名演员居中，中近景机位，适合独白与特写。", summary: "1 演员 · 中近景" },
    { id: "dialogue", name: "双人对话", description: "两名演员面对面分立左右，过肩机位起手。", summary: "2 演员 · 对话机位" },
    { id: "blocking", name: "人物走位", description: "三名演员分散站位，广角机位便于安排走动路线。", summary: "3 演员 · 广角" },
    { id: "product", name: "产品/道具镜头", description: "产品置于中心，背景板与侧面道具就位，长焦特写。", summary: "产品 + 背景板 · 长焦" },
    { id: "threebox-wooden-stage-static", name: "木质舞台（静态）", description: "木质舞台与原场景机位。", summary: "静态整场景 · 内嵌灯光 · 源摄影机" },
    { id: "threebox-ancient-street-static", name: "古代街景（静态）", description: "古代街区与原场景机位。", summary: "静态整场景 · 虹桥街区 · 源摄影机" },
];

type TemplateBlueprint = {
    objects: PrevisObject[];
    camera: PrevisCamera;
    shot: Omit<PrevisShot, "id" | "cameraId">;
    lights?: PrevisLight[];
    gridVisible?: boolean;
};

/** 由实体 hf_id / nodeIndex 与 GLB 父变换核对后编译；预置只保存原生静态字段。 */
const THREEBOX_STATIC_PRESETS: Partial<Record<PrevisTemplateId, { name: string; file: string; camera: Omit<PrevisCamera, "id" | "name"> }>> = {
    "threebox-wooden-stage-static": {
        name: "木质舞台（静态）",
        file: "wooden-stage-static.glb",
        camera: {
            transform: { position: [0.75, 1.95, 6], rotation: [-0.14073019399022532, 0.12313805174225807, 0.017398749654160082], scale: [1, 0.9999999999999999, 1] },
            target: [0.6271729023794694, 1.8107959560300653, 5.017383219035756],
            fov: 40,
            focalLength: 49.454593550183205 / (16 / 9),
            aperture: 2.8,
            focusDistance: 1,
            near: 0.1,
            far: 200,
            keyframes: [],
        },
    },
    "threebox-ancient-street-static": {
        name: "古代街景（静态）",
        file: "ancient-street-static.glb",
        camera: {
            transform: { position: [-0.0026107965231873965, 10.45, -67.69999873772962], rotation: [-2.7770665405410218, -0.0006419076039256025, -3.141347715102336], scale: [1.0000000000000004, 1, 1.0000000000000004] },
            target: [-0.0019688889633443026, 10.093493488096055, -66.76570612033142],
            fov: 56,
            focalLength: 33.85307637623397 / (16 / 9),
            aperture: 2.8,
            focusDistance: 1,
            near: 0.04,
            far: 240,
            keyframes: [],
        },
    },
};

/**
 * 三点布光：主光、轮廓光、环境光。
 * 五个模板共用同一套光位，避免模板之间打光风格漂移。
 */
function threePointRig(): PrevisLight[] {
    return [createPrevisLight("directional", "主光", [4, 6, 4], 2.4), createPrevisLight("directional", "轮廓光", [-4, 3, -2], 1.1), createPrevisLight("ambient", "环境光", [0, 0, 0], 0.65)];
}

/** 按模板意图摆机位。focalLength 与 fov 一起写，保证两者自洽。 */
function templateCamera(input: { name: string; position: PrevisCamera["transform"]["position"]; target: PrevisCamera["target"]; focalLength: number; focusDistance: number; aperture: number }): PrevisCamera {
    const base = createPrevisCamera(input.name);
    return {
        ...base,
        transform: { ...base.transform, position: input.position },
        target: input.target,
        focalLength: input.focalLength,
        fov: previsHorizontalFov(input.focalLength),
        aperture: input.aperture,
        focusDistance: input.focusDistance,
    };
}

/** 演员朝向：绕 Y 轴。左侧演员朝右为 +PI/2，右侧演员朝左为 -PI/2。 */
function facing(actor: PrevisObject, yaw: number): PrevisObject {
    return { ...actor, transform: { ...actor.transform, rotation: [0, yaw, 0] } };
}

function buildBlueprint(id: PrevisTemplateId): TemplateBlueprint {
    const preset = Object.hasOwn(THREEBOX_STATIC_PRESETS, id) ? THREEBOX_STATIC_PRESETS[id] : undefined;
    if (preset) {
        const object = createPrevisModel({ name: preset.name, url: `/production-library/director-models/${preset.file}`, mimeType: "model/gltf-binary" });
        return {
            objects: [{ ...object, modelNormalization: "preserve-source" }],
            camera: { ...structuredClone(preset.camera), id: nanoid(), name: `${preset.name}·源机位` },
            lights: [],
            gridVisible: false,
            // GLB stores a vertical FOV at 16:9; the native optics use a 36 mm horizontal sensor.
            shot: { name: "静态镜头", aspectRatio: "16:9", duration: 5, fps: 24, shotSize: "wide", cameraMove: "static", prompt: "静态整场景预设；源动画、路径和协作时间线未导入。" },
        };
    }
    if (id === "monologue") {
        return {
            objects: [createPrevisActor("演员 1", [0, 0, 0], PREVIS_ACTOR_COLORS[0])],
            camera: templateCamera({ name: "主摄影机", position: [1.5, 1.65, 3.1], target: [0, 1.15, 0], focalLength: 50, focusDistance: 3.4, aperture: 2.2 }),
            shot: { name: "镜头 1", duration: 5, fps: 24, shotSize: "medium", cameraMove: "static", prompt: "" },
        };
    }

    if (id === "dialogue") {
        // dx = 1.6 >= (0.8 + 0.8) / 2 + 0.25 = 1.05，两名演员必然不重叠。
        return {
            objects: [facing(createPrevisActor("演员 1", [-0.8, 0, 0.3], PREVIS_ACTOR_COLORS[0]), Math.PI / 2), facing(createPrevisActor("演员 2", [0.8, 0, -0.3], PREVIS_ACTOR_COLORS[2]), -Math.PI / 2)],
            camera: templateCamera({ name: "主摄影机", position: [2.9, 1.7, 3.4], target: [0, 1.1, 0], focalLength: 40, focusDistance: 4.2, aperture: 2.8 }),
            shot: { name: "镜头 1", duration: 6, fps: 24, shotSize: "medium", cameraMove: "static", prompt: "" },
        };
    }

    if (id === "blocking") {
        // 三名演员两两 dx >= 1.8，全部大于 1.05 阈值。
        return {
            objects: [createPrevisActor("演员 1", [-1.8, 0, 0.6], PREVIS_ACTOR_COLORS[0]), createPrevisActor("演员 2", [0, 0, -0.4], PREVIS_ACTOR_COLORS[2]), createPrevisActor("演员 3", [1.8, 0, 0.8], PREVIS_ACTOR_COLORS[3])],
            camera: templateCamera({ name: "主摄影机", position: [0.6, 3.1, 7.4], target: [0, 1, 0], focalLength: 28, focusDistance: 7.6, aperture: 4 }),
            shot: { name: "镜头 1", duration: 8, fps: 24, shotSize: "wide", cameraMove: "static", prompt: "" },
        };
    }

    if (id === "product") {
        // 产品镜头没有演员。背景板靠 dz=1.35 拉开，侧面道具靠 dx=1.15 拉开。
        const product = createPrevisObject("box", "产品主体", [0, 0.5, 0], "#b8c0ca");
        const backdrop = createPrevisObject("plane", "背景板", [0, 1.4, -1.35], "#e8ebef");
        const prop = createPrevisObject("cylinder", "侧面道具", [1.15, 0.4, 0.5], "#8795a5");
        return {
            objects: [
                { ...product, transform: { ...product.transform, scale: [0.9, 0.9, 0.9] } },
                { ...backdrop, transform: { ...backdrop.transform, scale: [3.2, 2, 1] } },
                { ...prop, transform: { ...prop.transform, scale: [0.5, 0.8, 0.5] } },
            ],
            camera: templateCamera({ name: "主摄影机", position: [1.1, 1.05, 2.35], target: [0, 0.55, 0], focalLength: 85, focusDistance: 2.6, aperture: 2.8 }),
            shot: { name: "镜头 1", duration: 4, fps: 24, shotSize: "close_up", cameraMove: "push_in", prompt: "" },
        };
    }

    return {
        objects: [],
        camera: templateCamera({ name: "主摄影机", position: [4.8, 2.7, 6.8], target: [0, 1, 0], focalLength: 35, focusDistance: 5, aperture: 2.8 }),
        shot: { name: "镜头 1", duration: 5, fps: 24, shotSize: "medium", cameraMove: "static", prompt: "" },
    };
}

/**
 * 按模板生成全新场景。
 * 未知 id 回落到空场景 —— 宁可少给内容，也不要偷偷塞回默认演员。
 */
export function createPrevisSceneFromTemplate(templateId: PrevisTemplateId, title = "未命名场景"): PrevisScene {
    const blueprint = buildBlueprint(templateId);
    const now = new Date().toISOString();
    const shotId = nanoid();
    return {
        id: nanoid(),
        version: 1,
        title,
        background: "#d8dde3",
        environmentIntensity: 0.7,
        environment: { mode: "color" },
        gridVisible: blueprint.gridVisible ?? true,
        objects: blueprint.objects,
        cameras: [blueprint.camera],
        lights: blueprint.lights ?? threePointRig(),
        shots: [{ ...blueprint.shot, id: shotId, cameraId: blueprint.camera.id }],
        activeShotId: shotId,
        createdAt: now,
        updatedAt: now,
    };
}
