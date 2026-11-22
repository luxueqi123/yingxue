import { afterAll, afterEach, expect, mock, test } from "bun:test";
import { Window } from "happy-dom";
import type { ComponentProps } from "react";

const dom = new Window({ url: "https://canvas.example/canvas/acceptance" });
const previous = new Map<string, PropertyDescriptor | undefined>();
for (const [key, value] of Object.entries({ window: dom, document: dom.document, navigator: dom.navigator,
    HTMLElement: dom.HTMLElement, Element: dom.Element, Node: dom.Node,
    IS_REACT_ACT_ENVIRONMENT: true })) {
    previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
}
const { act } = await import("react");
const { createRoot } = await import("react-dom/client");
const { PrevisSequencer } = await import("@/components/canvas/previs/previs-sequencer");
const { createPrevisScene, createPrevisActor, previsIdentityTransform } = await import("@/lib/canvas/previs/previs-scene");
const { useInterfaceLocaleStore } = await import("@/stores/use-interface-locale-store");
await useInterfaceLocaleStore.getState().setLocale("zh-CN");
type Props = ComponentProps<typeof PrevisSequencer>;
let root: ReturnType<typeof createRoot> | undefined;
let host: HTMLDivElement;

afterEach(async () => {
    await act(async () => root?.unmount());
    host?.remove();
});
afterAll(() => {
    dom.happyDOM.abort();
    for (const [key, descriptor] of previous) {
        if (descriptor) Object.defineProperty(globalThis, key, descriptor);
        else Reflect.deleteProperty(globalThis, key);
    }
});

async function openSequencer() {
    const scene = createPrevisScene("原场景");
    const camera = scene.cameras[0];
    camera.keyframes = [{ id: "camera-frame", time: 0, transform: camera.transform, easing: "linear" }];
    const actor = createPrevisActor("原演员");
    actor.keyframes = [{ id: "transform-frame", time: 1, transform: previsIdentityTransform(), easing: "linear" }];
    actor.boneTracks = [{ bone: "head", keyframes: [{ id: "bone-frame", time: 2, rotation: [0, 0, 0, 1], easing: "smooth" }] }];
    scene.objects = [actor];
    const onDeleteKeyframe = mock(() => {});
    const onSetKeyframeEasing = mock(() => {});
    const onPlayheadChange = mock(() => {});
    const onSelectObject = mock(() => {});
    const onSelectBone = mock(() => {});
    const props: Props = { scene, shot: scene.shots[0], camera, objects: scene.objects,
        selectedObjectId: actor.id, selectedBone: null, playhead: 0, playing: false, autoKey: false,
        height: 220, visible: true, onDeleteKeyframe, onSetKeyframeEasing, onPlayheadChange,
        onSelectObject, onSelectBone, onPlayToggle: () => {}, onAutoKeyChange: () => {},
        onHeightChange: () => {}, onVisibilityChange: () => {}, onRecordKeyframe: () => {},
        onAddShot: () => {}, onSelectShot: () => {} };
    host = document.createElement("div"); document.body.append(host);
    root = createRoot(host);
    const render = async (changes: Partial<Props> = {}) => {
        Object.assign(props, changes);
        await act(async () => root!.render(<PrevisSequencer {...props} />));
    };
    await render();
    const row = (name: string) => [...host.querySelectorAll<HTMLElement>(".previs-sequencer-row")]
        .find(item => item.querySelector(".previs-sequencer-label")?.textContent?.includes(name))!;
    const key = (name: string) => row(name).querySelector<HTMLButtonElement>("button.previs-sequencer-key")!;
    return { props, actor, render, row, key, onDeleteKeyframe, onSetKeyframeEasing, onPlayheadChange, onSelectObject, onSelectBone };
}

test("camera, transform and bone tracks select their original targets before explicit deletion", async () => {
    const testCase = await openSequencer();
    const { props, actor, row, key, onDeleteKeyframe, onPlayheadChange, onSelectObject, onSelectBone } = testCase;
    expect(row("机位切换").querySelector("button.previs-sequencer-key")).toBeNull();
    const cameraKey = key(props.camera!.name);
    await act(async () => cameraKey.click());
    expect(onDeleteKeyframe).not.toHaveBeenCalled();
    expect(cameraKey.getAttribute("aria-pressed")).toBe("true");
    expect(onPlayheadChange).toHaveBeenLastCalledWith(props.camera!.keyframes[0].time);
    expect(onSelectObject).toHaveBeenLastCalledWith(null);
    expect(onSelectBone).toHaveBeenLastCalledWith(null);
    await act(async () => host.querySelector<HTMLButtonElement>('[aria-label="删除所选关键帧"]')!.click());
    expect(onDeleteKeyframe).toHaveBeenLastCalledWith({ track: "camera", cameraId: props.camera!.id, keyframeId: props.camera!.keyframes[0].id });
    const transformKey = key("变换");
    await act(async () => transformKey.dispatchEvent(new dom.KeyboardEvent("keydown", { key: "Enter", bubbles: true })));
    expect(onSelectObject).toHaveBeenLastCalledWith(actor.id);
    expect(onPlayheadChange).toHaveBeenLastCalledWith(1);
    await act(async () => transformKey.dispatchEvent(new dom.KeyboardEvent("keydown", { key: "Delete", bubbles: true })));
    expect(onDeleteKeyframe).toHaveBeenLastCalledWith({ track: "object-transform", objectId: actor.id, keyframeId: "transform-frame" });
    const boneKey = row("原演员").querySelectorAll<HTMLButtonElement>("button.previs-sequencer-key")[1];
    await act(async () => boneKey.click());
    expect(onSelectBone).toHaveBeenLastCalledWith("head");
    await act(async () => boneKey.dispatchEvent(new dom.KeyboardEvent("keydown", { key: "Backspace", bubbles: true })));
    expect(onDeleteKeyframe).toHaveBeenLastCalledWith({ track: "object-bone", objectId: actor.id, bone: "head", keyframeId: "bone-frame" });
});

test("selected keyframe easing follows external undo and redo for the same frame", async () => {
    const { props, render, key, onSetKeyframeEasing } = await openSequencer();
    await act(async () => key(props.camera!.name).click());
    const easing = () => host.querySelector<HTMLSelectElement>('[aria-label="关键帧缓动"]')!;
    expect(easing().value).toBe("linear");
    await act(async () => {
        easing().value = "smooth";
        easing().dispatchEvent(new dom.Event("change", { bubbles: true }));
    });
    expect(onSetKeyframeEasing).toHaveBeenLastCalledWith({ track: "camera", cameraId: props.camera!.id, keyframeId: props.camera!.keyframes[0].id }, "smooth");
    await render({ camera: { ...props.camera!, keyframes: props.camera!.keyframes.map(keyframe => ({ ...keyframe, easing: "smooth" })) } });
    expect(easing().value).toBe("smooth");
    await render({ camera: { ...props.camera!, keyframes: props.camera!.keyframes.map(keyframe => ({ ...keyframe, easing: "linear" })) } });
    expect(easing().value).toBe("linear");
    await render({ camera: { ...props.camera!, keyframes: props.camera!.keyframes.map(keyframe => ({ ...keyframe, easing: "smooth" })) } });
    expect(easing().value).toBe("smooth");
});

test("external deletion or camera replacement removes stale selection and editing controls", async () => {
    const { props, render, key } = await openSequencer();
    await act(async () => key(props.camera!.name).click());
    expect(host.querySelector('[aria-label="删除所选关键帧"]')).not.toBeNull();
    await render({ camera: { ...props.camera!, id: "other-camera" } });
    expect(host.querySelector('[aria-label="删除所选关键帧"]')).toBeNull();
    await act(async () => key(props.camera!.name).click());
    await render({ camera: { ...props.camera!, keyframes: [] } });
    expect(host.querySelector('[aria-label="关键帧缓动"]')).toBeNull();
});

test.each(["object-transform", "object-bone"] as const)("%s easing is refreshed by external history without selecting again", async (track) => {
    const { props, actor, render, row, key } = await openSequencer();
    const frame = track === "object-transform" ? key("变换") : row("原演员").querySelectorAll<HTMLButtonElement>("button.previs-sequencer-key")[1];
    await act(async () => frame.click());
    const update = async (easing: "step" | "smooth") => {
        const object = props.objects[0];
        await render({ objects: [{ ...object,
            keyframes: track === "object-transform" ? object.keyframes.map(item => ({ ...item, easing })) : object.keyframes,
            boneTracks: track === "object-bone" ? object.boneTracks!.map(item => ({ ...item, keyframes: item.keyframes.map(keyframe => ({ ...keyframe, easing })) })) : object.boneTracks,
        }] });
        expect(host.querySelector<HTMLSelectElement>('[aria-label="关键帧缓动"]')!.value).toBe(easing);
    };
    await update("step");
    await update("smooth");
    expect(actor.id).toBe(props.objects[0].id);
});
