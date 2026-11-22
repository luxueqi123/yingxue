import { expect, test } from "bun:test";
import { canvasToolLaunchPath, readCanvasToolLaunch } from "../src/lib/canvas/canvas-tool-launch";

test("home tools select a canvas without silently creating one", () => {
    for (const tool of ["director", "batch", "conversion"] as const) {
        const path = canvasToolLaunchPath(tool);
        expect(path).toBe(`/canvas?tool=${tool}`);
        expect(readCanvasToolLaunch(new URLSearchParams(path.split("?")[1]))).toBe(tool);
        expect(path).not.toContain("mode=new");
    }
});

test("only native tools enter the launch contract", () => {
    for (const query of ["", "tool=unknown", "tool=__proto__", "tool=director&tool=batch"]) {
        expect(readCanvasToolLaunch(new URLSearchParams(query))).toBeNull();
    }
});
