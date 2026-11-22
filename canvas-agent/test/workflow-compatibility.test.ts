import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";
import { CanvasSession } from "../src/canvas-session.js";
import { toolInputSchemas } from "../src/schemas.js";

test("MCP workflow schema retains stage-specific generation options and rejects invalid explicit values", () => {
    const node = { ref: "image", kind: "image", title: "Product", prompt: "Product image", model: "relay::image", size: "9:16", quality: "high", count: 2, transparentBackground: "false" };
    assert.deepEqual(toolInputSchemas.canvas_create_workflow.parse({ nodes: [node] }).nodes[0], node);
    for (const invalid of [{ count: 0 }, { count: 1.5 }, { model: " " }, { transparentBackground: "maybe" }]) {
        assert.equal(toolInputSchemas.canvas_create_workflow.safeParse({ nodes: [{ ...node, ...invalid }] }).success, false);
    }
});

test("local Agent sends real canvas operations with preserved model, duration and voice requirements", async () => {
    const session = new CanvasSession();
    const writes: string[] = [];
    const response = Object.assign(new EventEmitter(), { writeHead: () => undefined, write: (chunk: unknown) => { writes.push(String(chunk)); }, end: () => undefined });
    session.openEvents(new URL("http://127.0.0.1/events?clientId=workflow-compatibility"), response as never);
    session.updateState({ nodes: [], connections: [] }, "workflow-compatibility");
    try {
        const pending = session.callTool("canvas_create_workflow", {
            nodes: [
                { ref: "shot", kind: "video", title: "Shot", prompt: "Slow push", model: "relay::video", size: "9:16", seconds: "6", vquality: "1080", generateAudio: "false", watermark: "false" },
                { ref: "voice", kind: "audio", title: "Voice", prompt: "Welcome", model: "relay::tts", audioVoice: "selected-voice", audioFormat: "wav", audioSpeed: "0.9", audioInstructions: "Warm" },
                { ref: "legacy", kind: "image", title: "Legacy", prompt: "A landscape" },
            ],
        });
        const event = writes.find(value => value.startsWith("event: tool_call\n"));
        assert.ok(event);
        const data = event.split("\n").find(line => line.startsWith("data: "))!;
        const call = JSON.parse(data.slice(6));
        const ops = call.input.ops as Array<{ type: string; metadata?: Record<string, unknown> }>;
        const [shot, voice, legacy] = ops.filter(op => op.type === "add_node");
        assert.equal(shot.metadata?.model, "relay::video");
        assert.equal(shot.metadata?.size, "9:16");
        assert.equal(shot.metadata?.seconds, "6");
        assert.equal(shot.metadata?.vquality, "1080");
        assert.equal(shot.metadata?.generateAudio, "false");
        assert.equal(shot.metadata?.watermark, "false");
        assert.equal(voice.metadata?.model, "relay::tts");
        assert.equal(voice.metadata?.audioVoice, "selected-voice");
        assert.equal(voice.metadata?.audioFormat, "wav");
        assert.equal(voice.metadata?.audioSpeed, "0.9");
        assert.equal(voice.metadata?.audioInstructions, "Warm");
        assert.equal(voice.metadata?.seconds, undefined);
        assert.ok((shot.metadata?.strictGenerationOptions as string[]).includes("seconds"));
        assert.equal(legacy.metadata?.strictGenerationOptions, undefined);
        assert.equal(ops.some(op => op.type === "run_generation"), false);
        session.resolveResult({ requestId: call.requestId, result: { accepted: true } });
        assert.deepEqual(await pending, { accepted: true });
    } finally {
        session.dispose();
    }
});
