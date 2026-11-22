import type { Object3D } from "three";

export const PREVIS_EDITOR_OVERLAY = { previsEditorOverlay: true };

/** Keep source meshes intact; hide only explicitly tagged editor UI for capture. */
export function suspendPrevisEditorOverlays(scene: Object3D): () => void {
    const previous: Array<[Object3D, boolean]> = [];
    scene.traverse((object) => {
        if (object.userData.previsEditorOverlay !== true) return;
        previous.push([object, object.visible]);
        object.visible = false;
    });
    let restored = false;
    return () => {
        if (restored) return;
        restored = true;
        for (const [object, visible] of previous) object.visible = visible;
    };
}
