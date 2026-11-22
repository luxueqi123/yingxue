import { expect, test } from "bun:test";
import { Group, Scene } from "three";
import { suspendPrevisEditorOverlays } from "../src/lib/canvas/previs/director-capture-overlays";

test("capture hides only marked editor overlays and restores original visibility", () => {
    const scene = new Scene(), model = new Group(), handles = new Group(), hidden = new Group();
    handles.userData.previsEditorOverlay = true;
    hidden.userData.previsEditorOverlay = true;
    hidden.visible = false;
    scene.add(model, handles, hidden);
    const restore = suspendPrevisEditorOverlays(scene);
    expect(model.visible).toBe(true);
    expect(handles.visible).toBe(false);
    expect(hidden.visible).toBe(false);
    restore();
    expect(handles.visible).toBe(true);
    expect(hidden.visible).toBe(false);
    handles.visible = false;
    restore();
    expect(handles.visible).toBe(false);
});

test("nested capture and failed capture restore their own prior state", () => {
    const scene = new Scene(), root = new Group(), child = new Group();
    root.userData.previsEditorOverlay = true;
    child.userData.previsEditorOverlay = true;
    root.add(child); scene.add(root);
    const outer = suspendPrevisEditorOverlays(scene);
    const inner = suspendPrevisEditorOverlays(scene);
    inner();
    expect(root.visible).toBe(false);
    expect(child.visible).toBe(false);
    try { throw new Error("encoding failed"); } catch {} finally { outer(); }
    expect(root.visible).toBe(true);
    expect(child.visible).toBe(true);
});
