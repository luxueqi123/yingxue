import { expect, test } from "bun:test";
import { resolveTimelineSourceDurationMs } from "../src/lib/timeline/timeline-build";

test("added media keeps explicit source length without fetching again", async () => {
    let reads = 0;
    expect(await resolveTimelineSourceDurationMs(9321, async () => { reads++; return 4; })).toBe(9321);
    expect(reads).toBe(0);
});

test("added video and audio use measured source length instead of four seconds", async () => {
    expect(await resolveTimelineSourceDurationMs(undefined, async () => 4041.667)).toBe(4042);
    expect(await resolveTimelineSourceDurationMs(NaN, async () => 18542)).toBe(18542);
});

test.each([undefined, 0, -1, NaN, Infinity, 0.1])("unreadable added source %s cannot create a clip", async value => {
    await expect(resolveTimelineSourceDurationMs(undefined, async () => value)).rejects.toThrow();
});

test("source read failures remain failures", async () => {
    await expect(resolveTimelineSourceDurationMs(undefined, async () => { throw new Error("media unavailable"); })).rejects.toThrow("media unavailable");
});
