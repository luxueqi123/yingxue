import { Box3, Euler, Matrix4, Quaternion, Vector3 } from "three";
import type { AnimationClip, Mesh, Object3D } from "three";
import type { PrevisCamera, PrevisLight, PrevisObject, PrevisTransform, PrevisVec3 } from "@/types/previs";

type RecordValue = Record<string, unknown>;
export type ThreeboxWarning = { code: string; entityId?: string; message: string };
export type ThreeboxAsset = {
    gltf: unknown;
    asset: Pick<PrevisObject, "name" | "url" | "storageKey" | "assetId" | "mimeType">;
};

export function resolvePrevisModelNormalization(value: unknown): NonNullable<PrevisObject["modelNormalization"]> {
    return value === "preserve-source" ? "preserve-source" : "fit";
}

/** 只接入源 GLB 已烘焙的单镜头动画；路径编辑与景深不是此入口的能力。 */
export function planThreeboxAnimation(source: unknown, parsed: ReturnType<typeof parseThreeboxStaticScene>, clips: AnimationClip[]) {
    if (!clips.length) throw new Error("GLB 未包含动画，请使用静态导入");
    const duration = Math.max(...clips.map((clip) => clip.duration));
    if (!Number.isFinite(duration) || duration <= 0 || duration > 600) throw new Error("动画时长需在 0 至 600 秒之间");
    const trackNames = new Set<string>();
    for (const clip of clips) for (const track of clip.tracks) {
        if (trackNames.has(track.name)) throw new Error("多个源片段驱动同一轨道，需先确认混合规则");
        trackNames.add(track.name);
    }
    const input = record(source, "3D-BOX 场景");
    const timelines = (input.entities as RecordValue[]).filter((entity) => entity.kind === "timeline");
    if (timelines.length > 1) throw new Error("当前动态入口仅接入一个单镜头时间线");
    let selectedCameraId = parsed.cameras[0]?.id;
    if (timelines.length) {
        const timeline = record(record(timelines[0].state, "时间线状态").timeline, "时间线");
        if (!Array.isArray(timeline.shots) || timeline.shots.length !== 1) throw new Error("多镜头时间线尚未接入，请先拆成单镜头");
        const shot = record(timeline.shots[0], "镜头");
        if (shot.start !== 0 || typeof shot.end !== "number" || Math.abs(shot.end - duration) > 1e-4 || Math.abs(Number(timeline.duration) - duration) > 1e-4) throw new Error("时间线与源动画时长不一致");
        selectedCameraId = "threebox-camera-" + String(shot.cameraId);
    }
    if (!selectedCameraId || !parsed.cameras.some((camera) => camera.id === selectedCameraId)) throw new Error("时间线缺少可配对摄影机");
    const objects = parsed.objects.map((object) => ({ ...object, sourceAnimation: { mode: "threebox-scene" as const, duration } }));
    const cameras = parsed.cameras.map((camera) => ({ ...camera, sourceCamera: { objectId: objects[0].id, entityId: camera.id.slice("threebox-camera-".length) } }));
    const warnings = parsed.warnings.filter((warning) => warning.code !== "static-whole-model" && !(warning.code === "dynamic-not-imported" && !warning.entityId));
    warnings.unshift({ code: "baked-source-animation", message: "全部 GLB 片段按同一秒时钟播放，短片段停在末态；镜头跟随源摄影机。路径仅保留已烘焙效果，未接入路径编辑、动态景深和多镜头剪辑。" });
    return { ...parsed, objects, cameras, warnings, duration, fps: 24 as const, selectedCameraId };
}

function record(value: unknown, label: string): RecordValue {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} 格式错误`);
    return value as RecordValue;
}

function tuple(value: unknown, fallback: number[], label: string): number[] {
    if (value === undefined) return fallback;
    if (!Array.isArray(value) || value.length !== fallback.length || value.some((item) => typeof item !== "number" || !Number.isFinite(item))) throw new Error(`${label} 数值错误`);
    return value;
}

function matrix(position: unknown, rotation: unknown, scale: unknown): Matrix4 {
    const p = tuple(position, [0, 0, 0], "位置");
    const q = new Quaternion().fromArray(tuple(rotation, [0, 0, 0, 1], "四元数"));
    const s = tuple(scale, [1, 1, 1], "缩放");
    if (q.lengthSq() < 1e-12 || s.some((item) => Math.abs(item) < 1e-10)) throw new Error("变换退化");
    return new Matrix4().compose(new Vector3().fromArray(p), q.normalize(), new Vector3().fromArray(s));
}

function closeMatrix(a: Matrix4, b: Matrix4): boolean {
    return a.elements.every((value, index) => Math.abs(value - b.elements[index]) <= 1e-4 * Math.max(1, Math.abs(value)));
}

function previsTransform(value: Matrix4): PrevisTransform {
    const p = new Vector3(), q = new Quaternion(), s = new Vector3();
    value.decompose(p, q, s);
    if (!closeMatrix(value, new Matrix4().compose(p, q, s))) throw new Error("摄影机世界变换含剪切，需先烘焙变换");
    const euler = new Euler().setFromQuaternion(q, "XYZ");
    return { position: p.toArray() as PrevisVec3, rotation: [euler.x || 0, euler.y || 0, euler.z || 0], scale: s.toArray() as PrevisVec3 };
}

/** 仅读取容器元数据；不执行脚本，也不访问 GLB 中的 URI。 */
export function parseThreeboxGlb(buffer: ArrayBuffer): unknown {
    if (buffer.byteLength < 20 || buffer.byteLength > 64 * 1024 * 1024) throw new Error("GLB 文件大小错误（上限 64 MiB）");
    const view = new DataView(buffer);
    if (view.getUint32(0, true) !== 0x46546c67 || view.getUint32(4, true) !== 2 || view.getUint32(8, true) !== buffer.byteLength) throw new Error("需要完整的 glTF 2.0 GLB 文件");
    const length = view.getUint32(12, true);
    if (length % 4 || length > buffer.byteLength - 20 || view.getUint32(16, true) !== 0x4e4f534a) throw new Error("GLB JSON 数据块错误");
    let offset = 20 + length;
    while (offset < buffer.byteLength) {
        if (offset + 8 > buffer.byteLength) throw new Error("GLB 数据块截断");
        const size = view.getUint32(offset, true);
        if (size % 4 || offset + 8 + size > buffer.byteLength) throw new Error("GLB 数据块长度错误");
        offset += 8 + size;
    }
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(new Uint8Array(buffer, 20, length)));
}

/** 一份协作 JSON 与一份实体 GLB 精确绑定；整场景保留层级，摄影机单独展平。 */
export function parseThreeboxStaticScene(source: unknown, assetResolver: () => ThreeboxAsset) {
    const input = record(source, "3D-BOX 场景");
    if (!Array.isArray(input.entities) || !input.entities.length || input.entities.length > 20000) throw new Error("3D-BOX entities 数量错误");
    const resolved = assetResolver();
    const gltf = record(resolved.gltf, "GLB");
    if (record(gltf.asset, "glTF asset").version !== "2.0" || !Array.isArray(gltf.nodes) || !Array.isArray(gltf.scenes)) throw new Error("需要 glTF 2.0 场景与节点");
    if (Array.isArray(gltf.extensionsRequired) && gltf.extensionsRequired.length) throw new Error("此静态入口暂未接入 GLB 必需扩展解码");
    for (const list of [gltf.buffers, gltf.images]) {
        if (Array.isArray(list) && list.some((item) => record(item, "GLB 资源").uri !== undefined)) throw new Error("请使用资源全部内嵌的 GLB 文件");
    }
    const nodes = gltf.nodes.map((item) => record(item, "GLB 节点"));
    if (nodes.length > 20000) throw new Error("GLB 节点数量超限");
    const local = nodes.map((node) => node.matrix === undefined ? matrix(node.translation, node.rotation, node.scale) : new Matrix4().fromArray(tuple(node.matrix, new Matrix4().elements, "矩阵")));
    const parents = new Map<number, number>();
    const idToIndex = new Map<string, number>();
    nodes.forEach((node, index) => {
        const id = node.extras && record(node.extras, "extras").hf_id;
        if (typeof id === "string") {
            if (idToIndex.has(id)) throw new Error("GLB hf_id 重复");
            idToIndex.set(id, index);
        }
        if (node.children !== undefined && !Array.isArray(node.children)) throw new Error("GLB children 格式错误");
        for (const child of (node.children || []) as unknown[]) {
            if (!Number.isInteger(child) || Number(child) < 0 || Number(child) >= nodes.length || parents.has(Number(child))) throw new Error("GLB 父子关系错误");
            parents.set(Number(child), index);
        }
    });
    const sceneIndex = gltf.scene === undefined ? 0 : Number(gltf.scene);
    const selectedScene = record(gltf.scenes[sceneIndex], "GLB 默认场景");
    if (!Array.isArray(selectedScene.nodes)) throw new Error("GLB 场景根节点缺失");
    const roots = new Set(selectedScene.nodes as number[]);
    const worlds = new Map<number, Matrix4>();
    const world = (index: number, visiting = new Set<number>()): Matrix4 => {
        if (worlds.has(index)) return worlds.get(index)!;
        if (visiting.has(index) || visiting.size > 256 || !nodes[index]) throw new Error("GLB 层级循环或过深");
        visiting.add(index);
        const parent = parents.get(index);
        if (parent === undefined && !roots.has(index)) throw new Error("GLB 节点未属于默认场景");
        const value = parent === undefined ? local[index].clone() : world(parent, visiting).clone().multiply(local[index]);
        visiting.delete(index); worlds.set(index, value); return value;
    };
    nodes.forEach((_, index) => world(index));
    const warnings: ThreeboxWarning[] = [
        { code: "static-whole-model", message: "按单个静态整场景导入；保留 GLB 内部层级与材质，内部网格暂不拆为独立导演对象。" },
        { code: "embedded-lights", message: "GLB 内嵌灯光保持原位置和方向；不重复创建导演灯光，内部灯光暂不独立编辑。" },
        { code: "appearance-from-glb", message: "静态外观、材质及灯光参数以 GLB 为准；JSON 的外观覆盖字段暂未重放。" },
    ];
    const cameras: PrevisCamera[] = [];
    const seen = new Set<string>();
    let matched = 0;
    for (const raw of input.entities) {
        const entity = record(raw, "实体");
        if (typeof entity.id !== "string" || !entity.id || seen.has(entity.id)) throw new Error("实体 ID 缺失或重复");
        seen.add(entity.id);
        const id = entity.id, state = record(entity.state, "实体状态"), kind = entity.kind;
        if (["path", "aim", "focus", "waypoint", "timeline"].includes(String(kind))) {
            warnings.push({ code: "dynamic-not-imported", entityId: id, message: `${id}：${kind} 动态关系未导入，原始 JSON 请自行保留。` });
            continue;
        }
        if (kind === "world") { warnings.push({ code: "world-not-imported", entityId: id, message: "世界背景与环境设置沿用当前导演场景。" }); continue; }
        if (!["object", "group", "mesh", "camera", "light"].includes(String(kind))) throw new Error(`实体类型尚未接入：${String(kind)}`);
        const index = idToIndex.get(id);
        const sceneId = selectedScene.extras && record(selectedScene.extras, "scene extras").hf_id;
        if (index === undefined && id === sceneId && (kind === "object" || kind === "group")) {
            const t = record(state.transform, "场景变换");
            if (!closeMatrix(matrix(t.position, t.rotation, t.scale), new Matrix4()) || state.visible === false || entity.deleted === true) throw new Error("GLB 场景根状态与 JSON 不一致");
            continue;
        }
        if (index === undefined) throw new Error(`GLB 缺少对应 hf_id：${id}`);
        const sourceNode = state.source && record(state.source, "来源").nodeIndex;
        if (sourceNode !== undefined && sourceNode !== null && sourceNode !== index) throw new Error(`GLB nodeIndex 配对错误：${id}`);
        if (entity.deleted === true || state.visible === false) throw new Error(`实体显隐与 GLB 待核对：${id}`);
        if (state.parentId !== undefined && state.parentId !== null) {
            const parent = parents.get(index);
            const expected = parent === undefined ? sceneId : record(nodes[parent].extras, "父节点 extras").hf_id;
            if (state.parentId !== expected) throw new Error(`GLB 父节点配对错误：${id}`);
        }
        const t = record(state.transform, "实体变换");
        if (!closeMatrix(matrix(t.position, t.rotation, t.scale), local[index])) throw new Error(`JSON 与 GLB 静态变换不同：${id}，请重新导出匹配的 GLB`);
        matched++;
        if (kind !== "camera") continue;
        if (!Array.isArray(gltf.cameras) || !Number.isInteger(nodes[index].camera)) throw new Error(`GLB 摄影机缺失：${id}`);
        const camera = record(gltf.cameras[Number(nodes[index].camera)], "摄影机");
        if (camera.type !== "perspective") throw new Error("当前导演台仅接入透视摄影机");
        const perspective = record(camera.perspective, "透视投影");
        const fov = Number(perspective.yfov) * 180 / Math.PI, near = Number(perspective.znear), far = perspective.zfar === undefined ? 10000 : Number(perspective.zfar);
        if (!Number.isFinite(fov) || fov <= 0 || fov >= 180 || !Number.isFinite(near) || near <= 0 || !Number.isFinite(far) || far <= near) throw new Error("摄影机投影数值错误");
        const transform = previsTransform(world(index));
        const q = new Quaternion().setFromEuler(new Euler(...transform.rotation));
        const target = new Vector3(0, 0, -1).applyQuaternion(q).add(new Vector3(...transform.position));
        cameras.push({ id: `threebox-camera-${id}`, name: typeof state.name === "string" ? state.name : id, transform, target: target.toArray() as PrevisVec3, fov, focalLength: 36 / (2 * Math.tan(fov * Math.PI / 360)), aperture: 2.8, focusDistance: 1, near, far, keyframes: [] });
        warnings.push({ code: "camera-frame-defaults", entityId: id, message: `${id}：保留静态机位与垂直视角；画幅沿用导演台，光圈和对焦采用默认值。` });
    }
    for (const [id, index] of idToIndex) {
        if ((nodes[index].mesh !== undefined || nodes[index].camera !== undefined) && !seen.has(id)) throw new Error(`JSON 缺少 GLB 实体：${id}`);
    }
    if (!matched || !nodes.some((node) => node.mesh !== undefined)) throw new Error("未找到已配对的场景网格");
    if (Array.isArray(gltf.animations) && gltf.animations.length) warnings.push({ code: "dynamic-not-imported", message: `GLB 含 ${gltf.animations.length} 条动画，本次仅导入基础静态姿态，不创建动作片段或时间线。` });
    if (Array.isArray(input.operations) && input.operations.length) warnings.push({ code: "operations-not-imported", message: "协作操作记录未重放；以当前 entities 与 GLB 一致性校验结果为准。" });
    const object: PrevisObject = { ...resolved.asset, id: "threebox-scene", kind: "model", modelNormalization: "preserve-source", transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] }, color: "#ffffff", visible: true, castShadow: true, receiveShadow: true, keyframes: [] };
    return { objects: [object], cameras, lights: [] as PrevisLight[], warnings, matchedEntities: matched };
}

/** 缺省仍走既有 fit 语义；只有明确标记的整场景保留原始坐标。 */
export function normalizePrevisImportedModel(root: Object3D, castShadow: boolean, receiveShadow: boolean, mode?: PrevisObject["modelNormalization"]) {
    root.updateMatrixWorld(true);
    if (mode !== "preserve-source") {
        const bounds = new Box3().setFromObject(root, true);
        const size = bounds.getSize(new Vector3());
        root.scale.multiplyScalar(2 / Math.max(size.x, size.y, size.z, 0.001));
        root.updateMatrixWorld(true);
        const centered = new Box3().setFromObject(root, true);
        const center = centered.getCenter(new Vector3());
        root.position.sub(center);
        root.position.y -= centered.min.y - center.y;
    }
    root.traverse((child) => {
        const mesh = child as Mesh;
        if (mesh.isMesh) { mesh.castShadow = castShadow; mesh.receiveShadow = receiveShadow; }
    });
}
