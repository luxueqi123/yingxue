import { test } from "node:test";
import assert from "node:assert/strict";
import { buildLtvReferencePlan } from "../src/lib/canvas/ltv-reference-plan";

const resources = new Map([
    ["a", { kind: "image", urls: ["https://example.test/a"] }],
    ["b", { kind: "image", urls: ["https://example.test/b"] }],
    ["v", { kind: "video", urls: ["https://example.test/v"] }],
]);
const params = () => ({ prompt: "用{{Image 1}}参考{{Mixed 1}}，保持{{Portrait 2}}。", imageList: [{ nodeId: "a", url: "https://example.test/a" }, { nodeId: "b", url: "https://example.test/b" }], videoList: [{ nodeId: "v", url: "https://example.test/v", durationSec: 4 }], imageListOrder: ["b", "a"], mixedListOrder: ["v", "a", "b"] });

test("preserves source slot identity across typed and mixed reordering", () => {
    const input = params();
    const original = JSON.stringify(input);
    const result = buildLtvReferencePlan(input, resources);
    assert.equal(result.prompt, "用@图片2参考@视频1，保持@图片1。");
    assert.deepEqual(result.references.map(ref => ref.nodeId), ["b", "a", "v"]);
    assert.equal(result.references[2].durationSec, 4);
    assert.equal(JSON.stringify(input), original);
});
test("keeps unmentioned references and follows source partial-order semantics", () => {
    const input = params(); input.prompt = "镜头推进"; input.imageListOrder = ["b", "removed", "b"];
    const result = buildLtvReferencePlan(input, resources);
    assert.equal(result.prompt, input.prompt);
    assert.deepEqual(result.references.map(ref => ref.nodeId), ["b", "a", "v"]);
});

test("keeps a saved reference number separate from adjacent numeric prose", () => {
    const input = { ...params(), imageListOrder: [], prompt: "{{Image 2}}16格 {{Video 1}}2秒 {{Portrait 1}}9张 @图片216" };
    const before = JSON.stringify(input);
    const result = buildLtvReferencePlan(input, resources);
    assert.equal(result.prompt, "@图片2 16格 @视频1 2秒 @图片1 9张 @图片216");
    assert.deepEqual(result.references.map(ref => ref.nodeId), ["a", "b", "v"]);
    assert.equal(JSON.stringify(input), before);
});
test("rejects missing slots, stale media, duplicates and malformed lists", () => {
    assert.throws(() => buildLtvReferencePlan({ ...params(), prompt: "{{Mixed 4}}" }, resources));
    assert.throws(() => buildLtvReferencePlan(params(), new Map()));
    assert.throws(() => buildLtvReferencePlan({ ...params(), imageList: [params().imageList[0], params().imageList[0]] }, resources));
    assert.throws(() => buildLtvReferencePlan({ ...params(), imageList: [null] }, resources));
    const stale = params(); stale.imageList[0].url += "?version=old";
    assert.throws(() => buildLtvReferencePlan(stale, resources));
});

test("preserves pending upstream node bindings without fabricating a URL", () => {
    const result = buildLtvReferencePlan({ prompt: "{{Video 1}}", videoList: [{ nodeId: "pending", url: "", durationSec: 0 }] }, new Map([["pending", { kind: "video", urls: [] }]]));
    assert.equal(result.prompt, "@视频1");
    assert.deepEqual(result.references, [{ nodeId: "pending", url: "", kind: "video", deferred: true }]);
    assert.throws(() => buildLtvReferencePlan({ imageList: [{ nodeId: "missing", url: "" }] }, resources));
});
