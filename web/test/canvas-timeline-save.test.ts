import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../src/components/canvas/canvas-timeline-dialog.tsx", import.meta.url), "utf8");
const start = source.indexOf("    const handleSave = async () => {");
const end = source.indexOf("\n    };", start);
if (start < 0 || end < 0) throw new Error("Timeline save handler not found");
const handler = source.slice(start, end + "\n    };".length);

// Exercise the actual component handler without mounting AntD or claiming browser coverage.
function harness(persist: () => Promise<boolean>, pendingMediaAdds = 0) {
    const events: unknown[] = [];
    const savingRef = { current: false };
    const run = new Function("savingRef", "setSaving", "setPreviewPlaying", "applySavedDraft", "onPersist", "onClose", "message", "mediaAdditionRef", `${handler}; return handleSave;`)(
        savingRef,
        (value: boolean) => events.push(["saving", value]),
        (value: boolean) => events.push(["playing", value]),
        () => events.push("apply"),
        () => { events.push("persist"); return persist(); },
        () => events.push("close"),
        { error: (value: string) => events.push(["error", value]) },
        { current: { pending: pendingMediaAdds } },
    ) as () => Promise<void>;
    return { run, events, savingRef };
}

describe("canvas timeline persistence acknowledgement", () => {
    test("does not save an incomplete draft while added-source metadata is pending", async () => {
        const h = harness(async () => true, 1);
        await h.run();
        expect(h.events).toEqual([]);
    });
    test("waits for persistence and ignores double save while pending", async () => {
        let finish!: (value: boolean) => void;
        const h = harness(() => new Promise((resolve) => { finish = resolve; }));
        const pending = h.run();
        await h.run();
        expect(h.events).toEqual([["saving", true], ["playing", false], "apply", "persist"]);
        expect(h.savingRef.current).toBe(true);
        finish(true);
        await pending;
        expect(h.events.slice(-2)).toEqual(["close", ["saving", false]]);
        expect(h.savingRef.current).toBe(false);
    });

    test("failed cloud acknowledgement retains dialog and allows retry", async () => {
        let succeed = false;
        const h = harness(async () => succeed);
        await h.run();
        expect(h.events).not.toContain("close");
        expect(h.savingRef.current).toBe(false);
        succeed = true;
        await h.run();
        expect(h.events.filter((event) => event === "close")).toHaveLength(1);
    });

    test("thrown persistence failure is surfaced and unlocks retry", async () => {
        const h = harness(async () => { throw new Error("disk write failed"); });
        await h.run();
        expect(h.events).toContainEqual(["error", "disk write failed"]);
        expect(h.events).not.toContain("close");
        expect(h.savingRef.current).toBe(false);
    });

    test("page requires remote acknowledgement; empty timelines remain saveable", () => {
        const page = readFileSync(new URL("../src/pages/canvas/project.tsx", import.meta.url), "utf8");
        expect(page).toContain("onPersist={() => saveCanvasProject({ requireRemote: true })}");
        expect(source.includes("inert={saving || initializing || addingMedia}")).toBe(true);
        expect(source).not.toContain('disabled={!draft.clips.length} onClick={handleSave}');
        expect(source).not.toContain('message.success("时间线已保存")');
    });
});
