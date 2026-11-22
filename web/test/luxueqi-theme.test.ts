import { afterEach, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { unzipSync, strFromU8 } from "fflate";
import { canvasThemes } from "@/lib/canvas-theme";
import { DEFAULT_CANVAS_APPEARANCE, agentAvatarClipForState, isAgentAvatarBundleManifest, suggestedAgentAvatarClipStates, type AgentAvatarBundleManifest } from "@/lib/canvas/agent-appearance";
import { normalizeSkinDefinition } from "@/lib/skin-themes";
import { applyThemePackCanvas } from "@/themes/apply";
import { themePackFor } from "@/themes/registry";
import { LUXUEQI_TIANYA_SKIN } from "@/themes/luxueqi-tianya/skin";
import "@/themes/luxueqi-tianya";
import "@/themes/longying-ink";

const luminance = (hex: string) => hex.match(/[\da-f]{2}/gi)!.slice(0, 3).map((part) => parseInt(part, 16) / 255).map((n) => n <= .04045 ? n / 12.92 : ((n + .055) / 1.055) ** 2.4).reduce((n, c, i) => n + c * [.2126, .7152, .0722][i], 0);
const contrast = (a: string, b: string) => (Math.max(luminance(a), luminance(b)) + .05) / (Math.min(luminance(a), luminance(b)) + .05);
afterEach(() => applyThemePackCanvas("classic"));

test("native theme registration and canvas switching restore other themes", () => {
    expect(themePackFor("luxueqi-tianya")?.skin).toEqual(LUXUEQI_TIANYA_SKIN);
    expect(normalizeSkinDefinition(LUXUEQI_TIANYA_SKIN)).toEqual(LUXUEQI_TIANYA_SKIN);
    applyThemePackCanvas("luxueqi-tianya");
    expect(canvasThemes.light.node.fill).toBe("#fbfdff");
    expect(canvasThemes.dark.node.text).toBe("#eff7ff");
    applyThemePackCanvas("longying-ink");
    expect(canvasThemes.light.canvas.background).toBe("#efe9dd");
    applyThemePackCanvas("classic");
    expect(canvasThemes.light.canvas.background).toBe("#FFFFFF");
});

test("both modes meet WCAG AA for body, secondary text, selection and primary button states", () => {
    for (const mode of ["light", "dark"] as const) {
        const t = LUXUEQI_TIANYA_SKIN.tokens[mode];
        const button = LUXUEQI_TIANYA_SKIN.tokens.buttons[mode];
        for (const [fg, bg] of [[t.text, t.canvas], [t.text, t.surface], [t.textMuted, t.surface], [t.textMuted, t.control], [t.selectedForeground, t.selected], [t.dangerForeground, t.danger], ...[button.start, button.end, button.hoverStart, button.hoverEnd, button.activeStart, button.activeEnd].map((bg) => [button.foreground, bg])]) {
            expect(contrast(fg, bg)).toBeGreaterThanOrEqual(4.5);
        }
    }
});

test("the shipped ZIP maps all eight real Agent states to separate native MP4 clips", () => {
    const files = unzipSync(readFileSync(new URL("../public/themes/luxueqi-tianya/luxueqi-assistant.zip", import.meta.url)));
    const manifest: AgentAvatarBundleManifest = JSON.parse(strFromU8(files["avatar.json"]));
    expect(isAgentAvatarBundleManifest(manifest)).toBe(true);
    const settings = JSON.parse(readFileSync(new URL("../public/themes/luxueqi-tianya/assistant-settings.json", import.meta.url), "utf8"));
    const mapping = suggestedAgentAvatarClipStates(manifest);
    expect(mapping).toEqual(settings.avatarClipStates);
    for (const state of Object.keys(mapping) as (keyof typeof mapping)[]) {
        const clip = agentAvatarClipForState({ ...DEFAULT_CANVAS_APPEARANCE, ...settings }, state, manifest);
        const bytes = files[manifest.clips[clip]];
        expect(strFromU8(bytes.slice(4, 8))).toBe("ftyp");
        expect(bytes.byteLength).toBeGreaterThan(10000);
    }
    expect(Object.keys(files)).toHaveLength(9);
    expect(new Set(Object.values(mapping)).size).toBe(8);
});
