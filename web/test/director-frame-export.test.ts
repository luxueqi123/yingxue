import { describe, expect, test } from "bun:test";
import { planPrevisFrames, renderPrevisFrames } from "../src/lib/canvas/previs/director-frame-export";

const png = () => new Blob(["frame"], { type: "image/png" });

describe("deterministic director frame clock", () => {
    test("retains both source durations and every requested sample", async () => {
        for (const duration of [10, 15]) {
            const times: number[] = [], writes: number[] = [];
            await renderPrevisFrames(planPrevisFrames(duration, 24), async time => {
                expect(writes.length).toBe(times.length);
                times.push(time);
                if (times.length === 3) await new Promise(resolve => setTimeout(resolve, 25));
                return png();
            }, async index => { writes.push(index); });
            expect(times).toEqual(Array.from({ length: duration * 24 }, (_, i) => i / 24));
            expect(writes.length).toBe(duration * 24);
        }
    });
    test("validates parameters and fractional final frame", () => {
        expect(planPrevisFrames(1.01, 24).count).toBe(25);
        for (const [duration, fps] of [[0,24], [-1,24], [NaN,24], [Infinity,24], [10,0], [10,121], [10,23.5]]) {
            expect(() => planPrevisFrames(duration, fps)).toThrow();
        }
    });
    test("never fills failed or empty frames", async () => {
        let writes = 0;
        await expect(renderPrevisFrames(planPrevisFrames(1, 24), async () => new Blob(), async () => { writes++; })).rejects.toThrow();
        expect(writes).toBe(0);
        await expect(renderPrevisFrames(planPrevisFrames(1, 24), async () => { throw Error("capture"); }, async () => { writes++; })).rejects.toThrow("capture");
        expect(writes).toBe(0);
    });
    test("cancellation after capture prevents writing and subsequent frames", async () => {
        const controller = new AbortController();
        let writes = 0;
        await expect(renderPrevisFrames(planPrevisFrames(1,24), async () => { controller.abort(); return png(); }, async () => { writes++; }, controller.signal)).rejects.toThrow();
        expect(writes).toBe(0);
    });
});
