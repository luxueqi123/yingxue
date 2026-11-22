import type { PrevisScene } from "../../../types/previs";
import type { CanvasNodeData, CanvasNodeMetadata } from "../../../types/canvas";

export function previsExportRestoreState(current: { open: boolean; sceneId?: string }, started: { open: boolean; sceneId?: string }, wasPlaying: boolean) {
    // Closing the same scene must not retain the encoder's last sampled frame.
    // A new open session, even for the same scene, owns its own viewport state.
    const restore = current === started || (!current.open && current.sceneId === started.sceneId);
    return { restore, playing: restore && current.open && wasPlaying };
}

/** Imported previews and captures are source evidence, not reusable output slots. */
export function reusablePrevisOutputNodeId(nodes: CanvasNodeData[], candidateIds: (string | undefined)[], source: NonNullable<CanvasNodeMetadata["previsOutputSource"]>) {
    return candidateIds.find((id) => {
        const node = nodes.find((item) => item.id === id);
        const origin = node?.metadata?.previsOutputSource;
        return node?.type === (source.kind === "preview" ? "image" : "video")
            && !node.metadata?.previsCaptureSource
            && origin?.sceneId === source.sceneId && origin.shotId === source.shotId && origin.kind === source.kind;
    });
}

/**
 * 打开期间本地 draft 是唯一权威：只有 scene id 变化（或首次挂载）才重建会话。
 * 同 id 的父级镜像回流绝不能重新 clone / 清历史 / 重置播放头。
 */
export function shouldReinitializePrevisSession(input: { initializedSceneId: string | null; nextSceneId: string | null }) {
    const { initializedSceneId, nextSceneId } = input;
    if (!nextSceneId) return false;
    return initializedSceneId !== nextSceneId;
}

/** 以 id upsert，调用方必须传入「当前最新」数组，避免旧闭包覆盖并发保存。 */
export function upsertPrevisSceneById(scenes: PrevisScene[], scene: PrevisScene): PrevisScene[] {
    return scenes.some((item) => item.id === scene.id) ? scenes.map((item) => (item.id === scene.id ? scene : item)) : [...scenes, scene];
}

/**
 * 输出上传可能跨越数秒。只把生成出的预览引用合并到最新场景，绝不拿输出开始时的
 * scene 快照覆盖期间发生的标题、对象、关键帧或镜头编辑。
 */
export function mergePrevisOutputPreview(scene: PrevisScene, input: { sceneId: string; shotId: string; previewNodeId: string }) {
    if (scene.id !== input.sceneId || !scene.shots.some((shot) => shot.id === input.shotId)) return null;
    return {
        ...scene,
        shots: scene.shots.map((shot) => (shot.id === input.shotId ? { ...shot, previewNodeId: input.previewNodeId, depthNodeId: undefined, normalNodeId: undefined } : shot)),
    };
}

/** 长截图/录制结束前，场景引用与活动镜头必须仍是操作开始时的快照。 */
export function isPrevisOutputSnapshotCurrent(scene: PrevisScene | null, expected: { scene: PrevisScene; shotId: string }) {
    if (scene !== expected.scene) return false;
    const activeShot = scene.shots.find((shot) => shot.id === scene.activeShotId) || scene.shots[0];
    return activeShot?.id === expected.shotId;
}
