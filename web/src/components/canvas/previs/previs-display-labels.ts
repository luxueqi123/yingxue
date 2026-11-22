import type { InterfaceMessageKey, InterfaceTranslate } from "@/lib/interface-locale";
import type { PrevisActorArchetype, PrevisCameraMove, PrevisHumanoidBone, PrevisPose, PrevisRenderMode, PrevisShotSize } from "@/types/previs";
import type { PrevisViewMode } from "@/lib/canvas/previs/previs-view-modes";

const actorArchetypeKeys: Record<PrevisActorArchetype, InterfaceMessageKey> = {
    adult: "canvasPrevisArchetypeAdult",
    child: "canvasPrevisArchetypeChild",
    elderly: "canvasPrevisArchetypeElderly",
    man: "canvasPrevisArchetypeMan",
    woman: "canvasPrevisArchetypeWoman",
    monster: "canvasPrevisArchetypeMonster",
};

const poseKeys: Record<PrevisPose, InterfaceMessageKey> = {
    neutral: "canvasPrevisPoseNeutral",
    stand: "canvasPrevisPoseStand",
    t_pose: "canvasPrevisPoseTPose",
    walk: "canvasPrevisPoseWalk",
    run: "canvasPrevisPoseRun",
    sit: "canvasPrevisPoseSit",
    squat: "canvasPrevisPoseSquat",
    kneel_single: "canvasPrevisPoseKneelSingle",
    kneel_double: "canvasPrevisPoseKneelDouble",
    hands_hips: "canvasPrevisPoseHandsHips",
    lean: "canvasPrevisPoseLean",
    bow: "canvasPrevisPoseBow",
    think: "canvasPrevisPoseThink",
    fight: "canvasPrevisPoseFight",
    kick: "canvasPrevisPoseKick",
    throw: "canvasPrevisPoseThrow",
    push: "canvasPrevisPosePush",
    wave: "canvasPrevisPoseWave",
    reach: "canvasPrevisPoseReach",
    arms_crossed: "canvasPrevisPoseArmsCrossed",
    phone: "canvasPrevisPosePhone",
};

const shotSizeKeys: Record<PrevisShotSize, InterfaceMessageKey> = {
    extreme_wide: "canvasPrevisShotExtremeWide",
    wide: "canvasPrevisShotWide",
    full: "canvasPrevisShotFull",
    medium: "canvasPrevisShotMedium",
    close_up: "canvasPrevisShotCloseUp",
    extreme_close_up: "canvasPrevisShotExtremeCloseUp",
};

const cameraMoveKeys: Record<PrevisCameraMove, InterfaceMessageKey> = {
    static: "canvasPrevisCameraMoveStatic",
    push_in: "canvasPrevisCameraMovePushIn",
    pull_out: "canvasPrevisCameraMovePullOut",
    pan_left: "canvasPrevisCameraMovePanLeft",
    pan_right: "canvasPrevisCameraMovePanRight",
    tilt_up: "canvasPrevisCameraMoveTiltUp",
    tilt_down: "canvasPrevisCameraMoveTiltDown",
    orbit_left: "canvasPrevisCameraMoveOrbitLeft",
    orbit_right: "canvasPrevisCameraMoveOrbitRight",
    handheld: "canvasPrevisCameraMoveHandheld",
};

const viewLabelKeys: Record<PrevisViewMode, InterfaceMessageKey> = {
    free: "canvasPrevisViewFree",
    camera: "canvasPrevisViewCamera",
    top: "canvasPrevisViewTop",
    front: "canvasPrevisViewFront",
    back: "canvasPrevisViewBack",
    left: "canvasPrevisViewLeft",
    right: "canvasPrevisViewRight",
};

const viewHintKeys: Record<PrevisViewMode, InterfaceMessageKey> = {
    free: "canvasPrevisViewHintFree",
    camera: "canvasPrevisViewHintCamera",
    top: "canvasPrevisViewHintTop",
    front: "canvasPrevisViewHintFront",
    back: "canvasPrevisViewHintBack",
    left: "canvasPrevisViewHintLeft",
    right: "canvasPrevisViewHintRight",
};

const renderModeKeys: Record<PrevisRenderMode, InterfaceMessageKey> = {
    beauty: "canvasPrevisRenderBeauty",
    clay: "canvasPrevisRenderClay",
    pose: "canvasPrevisRenderPose",
    depth: "canvasPrevisRenderDepth",
    normal: "canvasPrevisRenderNormal",
};

export const previsActorDisplayLabel = (archetype: PrevisActorArchetype, t: InterfaceTranslate) => t(actorArchetypeKeys[archetype]);
export const previsPoseDisplayLabel = (pose: PrevisPose, t: InterfaceTranslate) => t(poseKeys[pose]);
export const previsShotSizeDisplayLabel = (shotSize: PrevisShotSize, t: InterfaceTranslate) => t(shotSizeKeys[shotSize]);
export const previsCameraMoveDisplayLabel = (cameraMove: PrevisCameraMove, t: InterfaceTranslate) => t(cameraMoveKeys[cameraMove]);
export const previsViewDisplayLabel = (mode: PrevisViewMode, t: InterfaceTranslate) => t(viewLabelKeys[mode]);
export const previsViewHint = (mode: PrevisViewMode, t: InterfaceTranslate) => t(viewHintKeys[mode]);
export const previsRenderModeDisplayLabel = (mode: PrevisRenderMode, t: InterfaceTranslate) => t(renderModeKeys[mode]);

export function previsBoneDisplayLabel(bone: PrevisHumanoidBone, t: InterfaceTranslate) {
    const suffix = bone[0].toUpperCase() + bone.slice(1);
    return t(`canvasPrevisBone${suffix}` as InterfaceMessageKey);
}
