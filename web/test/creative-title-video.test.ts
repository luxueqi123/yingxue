import { expect, test } from "bun:test";
import { buildTitleVideoArgs, TITLE_VIDEO_MAX_BYTES } from "../src/lib/canvas/creative-title-video-plan";

const motion = { startMs: 1000, lengthMs: 2000, fadeMs: 500, durationMs: 5000 };
test("title fusion keeps full source duration and optional audio, including silent input", () => {
    const args = buildTitleVideoArgs(motion);
    expect(args.slice(args.indexOf("-t"), args.indexOf("-t") + 2)).toEqual(["-t", "5.000"]);
    expect(args).toContain("0:a?"); expect(args).toContain("aac"); expect(args).toContain("libx264");
    expect(args).not.toContain("-ss");
    const filter = args[args.indexOf("-filter_complex") + 1];
    expect(filter).toContain("fade=t=in:st=1.000:d=0.500:alpha=1");
    expect(filter).toContain("fade=t=out:st=2.500:d=0.500:alpha=1");
    expect(filter).toContain("between(t,1.000,3.000)");
    expect(filter).toContain("pad=ceil(iw/2)*2:ceil(ih/2)*2");
});
test("zero fade explicitly produces static title overlay", () => {
    expect(buildTitleVideoArgs({ ...motion, fadeMs: 0 }).join(" ")).not.toContain("fade=");
    expect(TITLE_VIDEO_MAX_BYTES).toBe(209715200);
});
test("invalid and out-of-range timing is rejected rather than trimming the original", () => {
    for (const invalid of [{ ...motion, startMs: -1 }, { ...motion, durationMs: NaN }, { ...motion, lengthMs: 400 }, { ...motion, fadeMs: 1100 }, { ...motion, startMs: 4000 }, { ...motion, lengthMs: 11000 }, { ...motion, fadeMs: -1 }]) {
        expect(() => buildTitleVideoArgs(invalid)).toThrow();
    }
});
