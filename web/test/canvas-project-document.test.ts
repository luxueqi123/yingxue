import { expect, test } from "bun:test";
import { assertCanvasProjectCollections } from "../src/lib/canvas/canvas-project-document";

test("missing, null and malformed collections are rejected without defaulting or dropping data", () => {
    for (const field of ["nodes", "connections", "chatSessions"]) {
        for (const value of [undefined, null, {}, "text", [null], [[]], [1]]) {
            const project = { nodes: [], connections: [], chatSessions: [], [field]: value };
            const before = JSON.stringify(project);
            expect(() => assertCanvasProjectCollections(project)).toThrow(field);
            expect(JSON.stringify(project)).toBe(before);
        }
    }
    for (const messages of [undefined, null, {}, [null]]) {
        expect(() => assertCanvasProjectCollections({ nodes: [], connections: [], chatSessions: [{ messages }] })).toThrow("chatSessions[0].messages");
    }
});

test("valid collection content and unknown extension fields remain unchanged", () => {
    const project = { nodes: [{ id: "n", metadata: { prompt: "原文 {name}" } }], connections: [],
        chatSessions: [{ id: "s", messages: [{ role: "user", content: "保持原文" }] }], extension: { keep: true } };
    const before = JSON.stringify(project);
    assertCanvasProjectCollections(project);
    expect(JSON.stringify(project)).toBe(before);
});
