import { expect, test } from "bun:test";
import { isPrevisActor } from "../src/lib/canvas/previs/director-object-role";
import { compilePrevisPrompt } from "../src/lib/canvas/previs/previs-prompt-compiler";
import { createPrevisScene } from "../src/lib/canvas/previs/previs-scene";

test("imported GLB actor is selectable without changing renderer kind", () => {
    const actor = { kind: "model" as const, role: "actor" as const };
    expect(isPrevisActor(actor)).toBe(true);
    expect(actor.kind).toBe("model");
    expect(isPrevisActor({ kind: "actor" })).toBe(true);
    expect(isPrevisActor({ kind: "primitive", primitive: "character" })).toBe(true);
    expect(isPrevisActor({ kind: "model" })).toBe(false);
    expect(isPrevisActor({ kind: "billboard" })).toBe(false);
    expect(isPrevisActor({ kind: "primitive", primitive: "cube" })).toBe(false);
});

test("source actor role survives JSON and participates in prompt identity mapping", () => {
    const scene = createPrevisScene();
    scene.objects = [{ ...scene.objects[0], name: "Source Performer", kind: "model", role: "actor", url: "/original.glb", modelNormalization: "preserve-source" }];
    const original = JSON.stringify(scene);
    const reloaded = JSON.parse(original);
    expect(reloaded.objects.filter(isPrevisActor)).toHaveLength(1);
    expect(compilePrevisPrompt(reloaded, reloaded.shots[0])).toContain("代表Source Performer");
    expect(reloaded.objects[0].url).toBe("/original.glb");
    expect(JSON.stringify(scene)).toBe(original);
    reloaded.objects[0].visible = false;
    expect(compilePrevisPrompt(reloaded, reloaded.shots[0])).not.toContain("代表Source Performer");
});
