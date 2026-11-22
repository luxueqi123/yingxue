import { expect, test } from "bun:test";
import type { CanvasNodeData } from "../src/types/canvas";
import { buildTimelineFromNodesWithDurations } from "../src/lib/timeline/timeline-build";

const node = (id: string, type = "video", durationMs?: number) => ({
    id, type, title: id, metadata: { storageKey: `resource:${id}`, ...(durationMs === undefined ? {} : { durationMs }) },
}) as CanvasNodeData;

test("initial timeline includes entire measured sources and preserves original nodes", async () => {
    const nodes = [node("first"), node("second"), node("voice", "audio")];
    const before = JSON.stringify(nodes);
    const durations: Record<string, number> = { first: 4042, second: 12500, voice: 15000 };
    const result = await buildTimelineFromNodesWithDurations(nodes, async n => durations[n.id]);
    expect(result.clips.map(c => [c.nodeId, c.startMs, c.durationMs, c.sourceDurationMs])).toEqual([
        ["first", 0, 4042, 4042], ["second", 4042, 12500, 12500], ["voice", 0, 15000, 15000],
    ]);
    expect(result.durationMs).toBe(16542);
    expect(JSON.stringify(nodes)).toBe(before);
});

test("retains explicit node durations and ignores nodes without media", async () => {
    const text = { id: "text", type: "text", metadata: {} } as CanvasNodeData;
    const empty = { id: "empty", type: "video", metadata: {} } as CanvasNodeData;
    let calls = 0;
    const result = await buildTimelineFromNodesWithDurations([node("known", "video", 9321), text, empty], async () => { calls++; return 99; });
    expect(calls).toBe(0);
    expect(result.clips[0].durationMs).toBe(9321);
});

test.each([undefined, 0, -4, NaN, Infinity])("fails on unreadable duration %s without inventing a four-second clip", async duration => {
    await expect(buildTimelineFromNodesWithDurations([node("missing")], async () => duration)).rejects.toThrow();
});

test("limits concurrent media probes to three and preserves ordering", async () => {
    let active = 0, max = 0;
    const nodes = Array.from({ length: 8 }, (_, i) => node(String(i)));
    const result = await buildTimelineFromNodesWithDurations(nodes, async () => {
        max = Math.max(max, ++active);
        await new Promise(resolve => setTimeout(resolve, 2));
        active--;
        return 5001;
    });
    expect(max).toBe(3);
    expect(result.clips.map(c => c.nodeId)).toEqual(nodes.map(n => n.id));
});

test("repairs non-finite metadata by measuring rather than persisting invalid clips", async () => {
    const result = await buildTimelineFromNodesWithDurations([node("bad", "video", Infinity)], async () => 4321);
    expect(result.clips[0].durationMs).toBe(4321);
});
