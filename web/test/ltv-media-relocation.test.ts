import { test } from "node:test";
import assert from "node:assert/strict";
import type { CanvasNodeData } from "../src/types/canvas";
import { relocateLtvMedia } from "../src/lib/canvas/ltv-media-relocation";
import { resolveLtvRuntimeReferences } from "../src/lib/canvas/ltv-runtime-references";

const old = "https://media.example/source.png";
const next = "/api/resources/original/file";
function fixture() {
    return [
        { id: "source", type: "image", title: "原图", metadata: { content: old, status: "success" } },
        { id: "target", type: "image", title: "生成", metadata: { prompt: "@图片1 保留原风格", ltvReferencePlan: {
            prompt: "@图片1 保留原风格", references: [{ nodeId: "source", kind: "image", url: old }],
        } } },
    ] as CanvasNodeData[];
}

test("verified relocation preserves source, prompt and order while repairing fixed references", () => {
    const nodes = fixture();
    const before = JSON.stringify(nodes);
    const moved = relocateLtvMedia(nodes, { [old]: next });
    const plan = moved[1].metadata!.ltvReferencePlan!;
    assert.deepEqual(resolveLtvRuntimeReferences(plan, moved, plan.prompt).map(node => node.id), ["source"]);
    assert.equal(moved[0].metadata!.content, next);
    assert.equal(plan.references[0].url, next);
    assert.equal(plan.prompt, nodes[1].metadata!.prompt);
    assert.equal(JSON.stringify(nodes), before);
});

test("already relocated owner is repaired but a genuinely different version remains rejected", () => {
    const nodes = fixture();
    nodes[0].metadata!.content = next;
    assert.throws(() => resolveLtvRuntimeReferences(nodes[1].metadata!.ltvReferencePlan!, nodes, "@图片1"), /版本/);
    const moved = relocateLtvMedia(nodes, { [old]: next });
    assert.equal(moved[1].metadata!.ltvReferencePlan!.references[0].url, next);
    nodes[0].metadata!.content = "https://media.example/different.png";
    assert.throws(() => relocateLtvMedia(nodes, { [old]: next }), /不一致/);
});

test("deferred references remain deferred and invalid targets or missing owners fail", () => {
    const nodes = fixture();
    const ref = nodes[1].metadata!.ltvReferencePlan!.references[0];
    ref.url = ""; ref.deferred = true;
    assert.deepEqual(relocateLtvMedia(nodes, { [old]: next })[1].metadata!.ltvReferencePlan!.references[0], ref);
    assert.throws(() => relocateLtvMedia(fixture(), { [old]: "" }), /无效/);
    assert.throws(() => relocateLtvMedia(fixture().slice(1), { [old]: next }), /不一致/);
});
