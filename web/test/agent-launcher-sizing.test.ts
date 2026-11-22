import { expect, test } from "bun:test";
import { clampAgentLauncherPosition, resolveAgentLauncherAvatarHeight } from "../src/lib/canvas/agent-launcher-position";

test("all configured avatar sizes remain distinct on desktop pages", () => {
    for (const width of [1280, 1912]) {
        expect([120, 220, 360].map((height) => resolveAgentLauncherAvatarHeight(height, 0.75, { width, height: 900 }))).toEqual([120, 220, 360]);
    }
});

test("narrow screens honor the selected size when the avatar fits", () => {
    expect(resolveAgentLauncherAvatarHeight(360, 0.75, { width: 390, height: 844 })).toBe(360);
});

test("viewport limits preserve the avatar ratio and keep resized launchers reachable", () => {
    const viewport = { width: 320, height: 240 };
    const height = resolveAgentLauncherAvatarHeight(360, 2, viewport);
    expect(height).toBe(140);
    const size = { width: height * 2, height };
    const position = clampAgentLauncherPosition({ right: 250, bottom: 200 }, viewport, size);
    expect(position.right).toBeGreaterThanOrEqual(0);
    expect(position.bottom).toBeGreaterThanOrEqual(0);
    expect(position.right + size.width).toBeLessThanOrEqual(viewport.width);
    expect(position.bottom + size.height).toBeLessThanOrEqual(viewport.height);
});
