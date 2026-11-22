import { expect, test } from "bun:test";
import { previsExportRestoreState } from "../src/lib/canvas/previs/previs-session";

test("successful same-session export restores prior playback", () => {
    const session = { open: true, sceneId: "a" };
    expect(previsExportRestoreState(session, session, true)).toEqual({ restore: true, playing: true });
});

test("closing same scene restores its viewport but keeps playback stopped", () => {
    expect(previsExportRestoreState({ open: false, sceneId: "a" }, { open: true, sceneId: "a" }, true)).toEqual({ restore: true, playing: false });
});

test("new open session or different scene must never receive old export state", () => {
    const started = { open: true, sceneId: "a" };
    for (const current of [{ open: true, sceneId: "a" }, { open: true, sceneId: "b" }, { open: false, sceneId: "b" }]) {
        expect(previsExportRestoreState(current, started, true).restore).toBe(false);
    }
});
