import { describe, expect, test } from "bun:test";
import { createEditorStore } from "../src/stores/editor/editor-store";
import type { SaveTimeline } from "../src/stores/editor/editor-store";
import type { TimelineProject } from "../src/types/timeline";
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
test("用户 seek 和播放器回写分开，小幅或重复定位也产生明确请求", () => {
    const store = createEditorStore();
    store.getState().load(makeProject());
    const loaded = store.getState().seekRequest;
    store.getState().setTransportMs(2000);
    expect(store.getState().seekRequest).toBe(loaded);
    store.getState().seekTransportMs(2100);
    expect(store.getState().transportMs).toBe(2100);
    expect(store.getState().seekRequest?.timeMs).toBe(2100);
    const first = store.getState().seekRequest;
    store.getState().seekTransportMs(2100);
    expect(store.getState().seekRequest).not.toBe(first);
    expect(store.getState().isDirty).toBe(false);
    expect(store.getState().history?.undoStack).toHaveLength(0);
    store.getState().seekTransportMs(9000);
    expect(store.getState().transportMs).toBe(5000);
});
function deferred() {
    let resolve!: () => void;
    let reject!: (reason: Error) => void;
    const promise = new Promise<void>((yes, no) => {
        resolve = yes;
        reject = no;
    });
    return { promise, resolve, reject };
}
function makeProject(): TimelineProject {
    return {
        version: 2,
        tracks: [
            { id: "video-1", kind: "video", label: "视频 1", order: 0 },
            { id: "subtitle-1", kind: "subtitle", label: "字幕 1", order: 1 },
        ],
        clips: [
            { id: "clip-a", kind: "video", nodeId: "node-a", trackId: "video-1", startMs: 0, durationMs: 5000, sourceStartMs: 0, sourceDurationMs: 10000 },
            { id: "sub-1", kind: "subtitle", nodeId: "node-a", trackId: "subtitle-1", startMs: 500, durationMs: 2000, subtitleEntryIndex: 0, text: "你好" },
        ],
        durationMs: 5000,
    };
}
describe("editor store (command dispatch)", () => {
    test("an old save completion cannot mark a newer edit as saved", async () => {
        const started = deferred(),
            response = deferred();
        const saves: TimelineProject[] = [];
        const store = createEditorStore({
            debounceMs: 60000,
            saveTimeline: async (p) => {
                saves.push(p);
                if (saves.length === 1) {
                    started.resolve();
                    await response.promise;
                }
            },
        });
        store.getState().load(makeProject());
        store.getState().dispatch({ op: "moveClip", payload: { id: "clip-a", startMs: 1000 } });
        const first = store.getState().flushSave();
        await started.promise;
        store.getState().dispatch({ op: "moveClip", payload: { id: "clip-a", startMs: 2000 } });
        response.resolve();
        await first;
        const dirtyAfterOldSave = store.getState().isDirty;
        await store.getState().flushSave();
        expect(dirtyAfterOldSave).toBe(true);
        expect(saves.map((p) => p.clips[0].startMs)).toEqual([1000, 2000]);
        expect(store.getState().isDirty).toBe(false);
    });
    test("saving remains true while a newer queued save is still pending", async () => {
        const starts = [deferred(), deferred()],
            responses = [deferred(), deferred()];
        let calls = 0;
        const store = createEditorStore({
            debounceMs: 60000,
            saveTimeline: async () => {
                const index = calls++;
                starts[index].resolve();
                await responses[index].promise;
            },
        });
        store.getState().load(makeProject());
        store.getState().dispatch({ op: "moveClip", payload: { id: "clip-a", startMs: 1000 } });
        const first = store.getState().flushSave();
        await starts[0].promise;
        store.getState().dispatch({ op: "moveClip", payload: { id: "clip-a", startMs: 2000 } });
        const second = store.getState().flushSave();
        responses[0].resolve();
        await starts[1].promise;
        const savingDuringSecond = store.getState().saving;
        responses[1].resolve();
        await Promise.all([first, second]);
        expect(savingDuringSecond).toBe(true);
        expect(store.getState().saving).toBe(false);
        expect(store.getState().isDirty).toBe(false);
    });
    test("reload isolates late save results and discards obsolete queued writes", async () => {
        for (const fail of [false, true]) {
            const started = deferred(),
                response = deferred();
            let calls = 0;
            const store = createEditorStore({
                debounceMs: 60000,
                saveTimeline: async () => {
                    calls++;
                    started.resolve();
                    await response.promise;
                },
            });
            store.getState().load(makeProject());
            store.getState().dispatch({ op: "moveClip", payload: { id: "clip-a", startMs: 1000 } });
            const first = store.getState().flushSave();
            await started.promise;
            store.getState().dispatch({ op: "moveClip", payload: { id: "clip-a", startMs: 2000 } });
            const queued = store.getState().flushSave();
            store.getState().load(makeProject());
            if (fail) response.reject(new Error("old project failed"));
            else response.resolve();
            await Promise.all([first, queued]);
            expect(calls).toBe(1);
            expect(store.getState().saveError).toBeNull();
            expect(store.getState().lastSavedAt).toBeNull();
            expect(store.getState().isDirty).toBe(false);
            expect(store.getState().saving).toBe(false);
        }
    });
    test("flush during a gesture persists only the committed timeline", async () => {
        const saves: TimelineProject[] = [];
        const store = createEditorStore({ debounceMs: 60000, saveTimeline: async (p) => void saves.push(p) });
        store.getState().load(makeProject());
        store.getState().dispatch({ op: "moveClip", payload: { id: "clip-a", startMs: 1000 } });
        store.getState().previewGesture({ op: "moveClip", payload: { id: "clip-a", startMs: 2000 } });
        await store.getState().flushSave();
        store.getState().cancelGesture();
        expect(saves[0].clips[0].startMs).toBe(1000);
        expect(store.getState().project).toEqual(saves[0]);
        expect(store.getState().isDirty).toBe(false);
    });
    test("duplicate clip insertion leaves history and saved data unchanged", async () => {
        const saves: TimelineProject[] = [];
        const store = createEditorStore({ saveTimeline: async (p) => void saves.push(p), debounceMs: 0 });
        store.getState().load(makeProject());
        const before = store.getState().project!;
        store.getState().dispatch({ op: "addClip", payload: { clip: { ...before.clips[0], title: "duplicate" } } });
        expect(store.getState().project).toBe(before);
        expect(store.getState().history?.undoStack).toHaveLength(0);
        expect(store.getState().saveError).toMatch(/already exists/);
        expect(store.getState().isDirty).toBe(false);
        await sleep(10);
        expect(saves).toHaveLength(0);
        store.getState().dispatch({ op: "addClip", payload: { clip: { ...before.clips[0], id: "new-clip" } } });
        await sleep(10);
        expect(store.getState().saveError).toBeNull();
        expect(saves).toHaveLength(1);
        expect(saves[0].clips).toHaveLength(before.clips.length + 1);
    });
    test("repeated split survives undo, redo and serialized save/reload without duplicate identities", async () => {
        const saves: TimelineProject[] = [];
        const store = createEditorStore({ saveTimeline: async (p) => void saves.push(JSON.parse(JSON.stringify(p))), debounceMs: 0 });
        store.getState().load(makeProject());
        const split = { op: "splitClip", payload: { id: "clip-a", splitAtMs: 2000 } };
        store.getState().dispatch(split);
        store.getState().dispatch({ op: "moveClip", payload: { id: "clip-a", startMs: 1000 } });
        store.getState().dispatch(split);
        store.getState().dispatch({ op: "moveClip", payload: { id: "clip-a", startMs: 1500 } });
        const before = store.getState().project;
        store.getState().dispatch(split);
        const after = store.getState().project!;
        expect(new Set(after.clips.map((clip) => clip.id)).size).toBe(after.clips.length);
        store.getState().undo();
        expect(store.getState().project).toEqual(before);
        store.getState().redo();
        expect(store.getState().project).toEqual(after);
        await sleep(10);
        expect(saves.at(-1)).toEqual(after);
        const reopened = createEditorStore();
        reopened.getState().load(saves.at(-1)!);
        expect(reopened.getState().project).toEqual(after);
    });
    test("load identity changes only on explicit reload, not edits or undo", () => {
        const store = createEditorStore();
        expect(store.getState().loadRevision).toBe(0);
        store.getState().load(makeProject());
        expect(store.getState().loadRevision).toBe(1);
        store.getState().dispatch({ op: "moveClip", payload: { id: "clip-a", startMs: 1000 } });
        store.getState().undo();
        expect(store.getState().loadRevision).toBe(1);
        store.getState().load(makeProject());
        expect(store.getState().loadRevision).toBe(2);
    });
    test("load initializes project and history without saving", async () => {
        const saves: TimelineProject[] = [];
        const store = createEditorStore({ saveTimeline: async (p) => void saves.push(p) });
        store.getState().load(makeProject());
        expect(store.getState().project?.durationMs).toBe(5000);
        expect(store.getState().isDirty).toBe(false);
        expect(store.getState().history?.undoStack).toHaveLength(0);
        await sleep(10);
        expect(saves).toHaveLength(0);
    });
    test("dispatch applies the command, marks dirty, and debounce-saves the latest state", async () => {
        const saves: TimelineProject[] = [];
        const store = createEditorStore({ saveTimeline: async (p) => void saves.push(p), debounceMs: 0 });
        store.getState().load(makeProject());
        store.getState().dispatch({ op: "moveClip", payload: { id: "clip-a", startMs: 2000 } });
        expect(store.getState().project?.clips.find((c) => c.id === "clip-a")?.startMs).toBe(2000);
        expect(store.getState().isDirty).toBe(true);
        expect(store.getState().history?.undoStack).toHaveLength(1);
        await sleep(10);
        expect(saves).toHaveLength(1);
        expect(saves[0].clips.find((c) => c.id === "clip-a")?.startMs).toBe(2000);
        expect(store.getState().isDirty).toBe(false);
        expect(store.getState().saveError).toBeNull();
    });
    test("rejected command keeps state and history, surfaces saveError", async () => {
        const store = createEditorStore({ saveTimeline: async () => undefined, debounceMs: 0 });
        store.getState().load(makeProject());
        const before = store.getState().project;
        store.getState().dispatch({ op: "unknownOp", payload: {} });
        expect(store.getState().project).toBe(before);
        expect(store.getState().history?.undoStack).toHaveLength(0);
        expect(store.getState().saveError).toMatch(/unknown edit command op "unknownOp"/);
        expect(store.getState().isDirty).toBe(false);
    });
    test("undo/redo walk the history and each trigger a save", async () => {
        const saves: TimelineProject[] = [];
        const store = createEditorStore({ saveTimeline: async (p) => void saves.push(p), debounceMs: 0 });
        store.getState().load(makeProject());
        store.getState().dispatch({ op: "moveClip", payload: { id: "clip-a", startMs: 2000 } });
        store.getState().dispatch({ op: "moveClip", payload: { id: "clip-a", startMs: 3000 } });
        await sleep(10);
        store.getState().undo();
        expect(store.getState().project?.clips.find((c) => c.id === "clip-a")?.startMs).toBe(2000);
        store.getState().undo();
        expect(store.getState().project?.clips.find((c) => c.id === "clip-a")?.startMs).toBe(0);
        store.getState().undo(); // 栈底，无操作
        expect(store.getState().project?.clips.find((c) => c.id === "clip-a")?.startMs).toBe(0);
        store.getState().redo();
        expect(store.getState().project?.clips.find((c) => c.id === "clip-a")?.startMs).toBe(2000);
        await sleep(10);
        // 两次 dispatch 合并 1 次保存；undo/undo/redo 同步执行合并 1 次保存
        expect(saves).toHaveLength(2);
        expect(saves.at(-1)?.clips.find((c) => c.id === "clip-a")?.startMs).toBe(2000);
    });
    test("multiple dispatches within debounce window collapse into one save", async () => {
        const saves: TimelineProject[] = [];
        const store = createEditorStore({ saveTimeline: async (p) => void saves.push(p), debounceMs: 60 });
        store.getState().load(makeProject());
        store.getState().dispatch({ op: "moveClip", payload: { id: "clip-a", startMs: 1000 } });
        store.getState().dispatch({ op: "moveClip", payload: { id: "clip-a", startMs: 2000 } });
        store.getState().dispatch({ op: "moveClip", payload: { id: "clip-a", startMs: 3000 } });
        expect(saves).toHaveLength(0); // 防抖窗口内不保存
        await sleep(120);
        expect(saves).toHaveLength(1);
        expect(saves[0].clips.find((c) => c.id === "clip-a")?.startMs).toBe(3000);
        // 新一轮变更再次触发一次保存
        store.getState().dispatch({ op: "moveClip", payload: { id: "clip-a", startMs: 4000 } });
        await sleep(120);
        expect(saves).toHaveLength(2);
        expect(saves[1].clips.find((c) => c.id === "clip-a")?.startMs).toBe(4000);
    });
    test("save failure marks saveError and keeps dirty; next successful save clears it", async () => {
        let fail = true;
        const store = createEditorStore({
            saveTimeline: async () => {
                if (fail) throw new Error("backend unreachable");
            },
            debounceMs: 0,
        });
        store.getState().load(makeProject());
        store.getState().dispatch({ op: "moveClip", payload: { id: "clip-a", startMs: 1000 } });
        await sleep(10);
        expect(store.getState().saveError).toBe("backend unreachable");
        expect(store.getState().isDirty).toBe(true);
        fail = false;
        store.getState().dispatch({ op: "moveClip", payload: { id: "clip-a", startMs: 2000 } });
        await sleep(10);
        expect(store.getState().saveError).toBeNull();
        expect(store.getState().isDirty).toBe(false);
    });
    test("flushSave persists immediately and clears pending debounce", async () => {
        const saves: TimelineProject[] = [];
        const store = createEditorStore({ saveTimeline: async (p) => void saves.push(p), debounceMs: 10_000 });
        store.getState().load(makeProject());
        store.getState().dispatch({ op: "moveClip", payload: { id: "clip-a", startMs: 1000 } });
        await store.getState().flushSave();
        expect(saves).toHaveLength(1);
        expect(store.getState().isDirty).toBe(false);
        // 防抖 timer 已清：再等也不会有第二次
        await sleep(20);
        expect(saves).toHaveLength(1);
    });
    test("load resets history and dirty state", async () => {
        const store = createEditorStore({ saveTimeline: async () => undefined, debounceMs: 0 });
        store.getState().load(makeProject());
        store.getState().dispatch({ op: "moveClip", payload: { id: "clip-a", startMs: 1000 } });
        expect(store.getState().history?.undoStack).toHaveLength(1);
        store.getState().load(makeProject());
        expect(store.getState().history?.undoStack).toHaveLength(0);
        expect(store.getState().isDirty).toBe(false);
    });
});
describe("editor store (gesture preview)", () => {
    test("preview applies without history; commit pushes once; cancel restores", async () => {
        const store = createEditorStore({ saveTimeline: async () => undefined, debounceMs: 0 });
        store.getState().load(makeProject());
        const committed = store.getState().project;
        // 预览：连续两次手势调用（模拟拖拽中），不入历史
        store.getState().previewGesture({ op: "moveClip", payload: { id: "clip-a", startMs: 1000 } });
        store.getState().previewGesture({ op: "moveClip", payload: { id: "clip-a", startMs: 2000 } });
        expect(store.getState().inPreview).toBe(true);
        expect(store.getState().project?.clips.find((c) => c.id === "clip-a")?.startMs).toBe(2000);
        expect(store.getState().history?.undoStack).toHaveLength(0);
        // 预览期间 dispatch 被拒绝
        store.getState().dispatch({ op: "moveClip", payload: { id: "clip-a", startMs: 5000 } });
        expect(store.getState().project?.clips.find((c) => c.id === "clip-a")?.startMs).toBe(2000);
        expect(store.getState().saveError).toMatch(/gesture preview/);
        // 提交：一次性入历史，可一次 undo 回到手势前
        store.getState().commitGesture();
        expect(store.getState().inPreview).toBe(false);
        expect(store.getState().history?.undoStack).toHaveLength(1);
        store.getState().undo();
        expect(store.getState().project).toBe(committed);
        expect(store.getState().project?.clips.find((c) => c.id === "clip-a")?.startMs).toBe(0);
    });
    test("cancel discards preview changes", async () => {
        const store = createEditorStore({ saveTimeline: async () => undefined, debounceMs: 0 });
        store.getState().load(makeProject());
        const committed = store.getState().project;
        store.getState().previewGesture({ op: "moveClip", payload: { id: "clip-a", startMs: 1000 } });
        expect(store.getState().project?.clips.find((c) => c.id === "clip-a")?.startMs).toBe(1000);
        store.getState().cancelGesture();
        expect(store.getState().inPreview).toBe(false);
        expect(store.getState().project).toBe(committed);
        expect(store.getState().history?.undoStack).toHaveLength(0);
    });
    test("rejected preview command does not enter preview", async () => {
        const store = createEditorStore({ saveTimeline: async () => undefined, debounceMs: 0 });
        store.getState().load(makeProject());
        const before = store.getState().project;
        store.getState().previewGesture({ op: "unknownOp", payload: {} });
        expect(store.getState().inPreview).toBe(false);
        expect(store.getState().project).toBe(before);
        expect(store.getState().saveError).toMatch(/unknown edit command op/);
    });
    test("selectClip toggles selection without touching history or dirty state", async () => {
        const store = createEditorStore({ saveTimeline: async () => undefined, debounceMs: 0 });
        store.getState().load(makeProject());
        expect(store.getState().selectedClipId).toBeNull();
        store.getState().selectClip("clip-a");
        expect(store.getState().selectedClipId).toBe("clip-a");
        expect(store.getState().isDirty).toBe(false);
        expect(store.getState().history?.undoStack).toHaveLength(0);
        store.getState().selectClip(null);
        expect(store.getState().selectedClipId).toBeNull();
    });
    test("load resets selection", async () => {
        const store = createEditorStore({ saveTimeline: async () => undefined, debounceMs: 0 });
        store.getState().load(makeProject());
        store.getState().selectClip("clip-a");
        store.getState().load(makeProject());
        expect(store.getState().selectedClipId).toBeNull();
    });
});
