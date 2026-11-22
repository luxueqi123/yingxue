import { test } from "node:test";
import assert from "node:assert/strict";
import { assertLtvConnectedReferenceOrder, bindLtvCurrentReferences, ltvTextReferenceBody, orderLtvReferenceConnections, remapLtvReferencePlan, resolveLtvRuntimeReferences, resolveLtvRuntimeTexts } from "../src/lib/canvas/ltv-runtime-references";
import type { CanvasNodeData } from "../src/types/canvas";
import type { LtvReferencePlan } from "../src/lib/canvas/ltv-reference-plan";

const plan: LtvReferencePlan = { prompt: "@图片2向@图片1移动", references: [{ nodeId: "a", kind: "image", url: "https://example.test/a" }, { nodeId: "b", kind: "image", url: "https://example.test/b" }] };
const nodes = (): CanvasNodeData[] => plan.references.map(ref => ({ id: ref.nodeId, type: ref.kind, title: ref.nodeId, position: { x: 0, y: 0 }, metadata: { content: ref.url } } as CanvasNodeData));

test("explicit binding accepts changed versions, shelf order and pending upstream without generating", () => {
    const inputs = nodes();
    inputs[0].metadata!.content = "https://example.test/new";
    inputs[1].metadata = { generationMode: "image", status: "idle", content: "" };
    assert.throws(() => resolveLtvRuntimeReferences(plan, inputs, plan.prompt));
    const rebound = bindLtvCurrentReferences("@图片2参考@图片1", ["b", "a"], inputs);
    assert.deepEqual(rebound.references.map(ref => ref.nodeId), ["b", "a"]);
    assert.equal(rebound.references[0].deferred, true);
    assert.equal(rebound.references[1].url, "https://example.test/new");
    assert.throws(() => resolveLtvRuntimeReferences(rebound, inputs, rebound.prompt), /尚未生成/);
    inputs[1].metadata = { generationMode: "image", status: "success", content: "https://example.test/generated" };
    assert.deepEqual(resolveLtvRuntimeReferences(JSON.parse(JSON.stringify(rebound)), inputs, rebound.prompt).map(node => node.id), ["b", "a"]);
    assert.equal(plan.references[0].url, "https://example.test/a");
    assert.throws(() => bindLtvCurrentReferences("@图片3", ["a", "b"], inputs), /不存在/);
    assert.throws(() => bindLtvCurrentReferences("", ["a", "a"], inputs), /重复/);
    assert.throws(() => bindLtvCurrentReferences("", ["deleted"], inputs), /已删除/);
});

test("native shelf order matches saved slots on import; user edits require explicit binding", () => {
    const target = { id: "target", type: "image", metadata: { ltvReferencePlan: plan } } as CanvasNodeData;
    const edges = [{ id: "one", fromNodeId: "b", toNodeId: "target" }, { id: "other", fromNodeId: "a", toNodeId: "elsewhere" }, { id: "two", fromNodeId: "a", toNodeId: "target" }];
    const before = JSON.stringify(edges);
    const aligned = orderLtvReferenceConnections([...nodes(), target], edges);
    assert.deepEqual(aligned.map(edge => edge.fromNodeId), ["a", "a", "b"]);
    assert.equal(aligned[1], edges[1]);
    assert.equal(JSON.stringify(edges), before);
    assertLtvConnectedReferenceOrder(plan, [{ nodeId: "a", type: "image" }, { nodeId: "b", type: "image" }]);
    assert.throws(() => assertLtvConnectedReferenceOrder(plan, [{ nodeId: "b", type: "image" }, { nodeId: "a", type: "image" }]), /绑定参考/);
    assert.throws(() => assertLtvConnectedReferenceOrder(plan, [{ nodeId: "a", type: "image" }]), /绑定参考/);
});

test("text dependencies remap, retain order, and block unfinished upstream generation", () => {
    const source: LtvReferencePlan = { prompt: "拍摄", references: [], texts: [{ nodeId: "a", content: "正文" }, { nodeId: "b", content: "", deferred: true }] };
    const copied = remapLtvReferencePlan(source, new Map([["a", "new-a"], ["b", "new-b"]]), true);
    const inputs = [{ id: "new-a", type: "text", metadata: { content: "正文", status: "success" } }, { id: "new-b", type: "text", metadata: { content: "", status: "idle" } }] as CanvasNodeData[];
    assert.throws(() => resolveLtvRuntimeTexts(copied, inputs), /尚未生成/);
    inputs[1].metadata = { content: "新生成剧本", status: "success" };
    assert.deepEqual(resolveLtvRuntimeTexts(JSON.parse(JSON.stringify(copied)), inputs), ["正文", "新生成剧本"]);
    inputs[0].metadata!.content = "错版本";
    assert.throws(() => resolveLtvRuntimeTexts(copied, inputs), /版本/);
});

test("copy and JSON restore keep ordered references on the new nodes", () => {
    const ids = new Map([["a", "new-a"], ["b", "new-b"]]);
    const copied = JSON.parse(JSON.stringify(remapLtvReferencePlan(plan, ids, true)));
    const copiedNodes = nodes().map(node => ({ ...node, id: ids.get(node.id)! }));
    assert.deepEqual(resolveLtvRuntimeReferences(copied, copiedNodes, copied.prompt).map(node => node.id), ["new-a", "new-b"]);
    assert.equal(plan.references[0].nodeId, "a");
    assert.deepEqual(resolveLtvRuntimeReferences(plan, nodes(), "不提及任何图片").map(node => node.id), ["a", "b"]);
});
test("missing references and changed versions fail before submission", () => {
    assert.throws(() => remapLtvReferencePlan(plan, new Map(), true));
    assert.throws(() => resolveLtvRuntimeReferences(plan, [], plan.prompt));
    const changed = nodes(); changed[0].metadata!.content += "?v=2";
    assert.throws(() => resolveLtvRuntimeReferences(plan, changed, plan.prompt));
    assert.throws(() => resolveLtvRuntimeReferences(plan, nodes(), "@图片3"));
    assert.throws(() => resolveLtvRuntimeReferences(plan, nodes(), "@[node:external]"));
});
test("single-node copy retains same-canvas references", () => {
    assert.deepEqual(remapLtvReferencePlan(plan, new Map()).references, plan.references);
});

// The source only strips `{{Image|Portrait|Video|Audio|Mixed N}}` from prompt fields, never from
// textList, so the import-time rewrite of a text body has to survive every plan rebuild. Rebinding
// the reference shelf is user work, not an edit of the body, so it must not put the raw editor
// marker back in front of the model.
test("rebinding the shelf keeps the text-body marker rewrite for an untouched body", () => {
    const text = "剧本\n{{Mixed 1}} 走远";
    const before: LtvReferencePlan = { prompt: "@图片1", references: [{ nodeId: "a", kind: "image", url: "https://example.test/a" }], texts: [{ nodeId: "t", content: text, resolved: "剧本\n@图片1 走远" }] };
    const withText = [...nodes(), { id: "t", type: "text", title: "t", position: { x: 0, y: 0 }, metadata: { content: text } } as CanvasNodeData];
    const rebound = bindLtvCurrentReferences(before.prompt, ["a", "t"], withText, before);
    assert.deepEqual(rebound.texts, [{ nodeId: "t", content: text, resolved: "剧本\n@图片1 走远" }]);
    assert.equal(ltvTextReferenceBody(rebound.texts![0]), "剧本\n@图片1 走远");
    assert.doesNotMatch(ltvTextReferenceBody(rebound.texts![0]), /\{\{/);
    // A body the user edited has no saved slot mapping, so it falls back to its own text instead of
    // reusing a stale rewrite; the runtime version check then reports the change.
    const edited = withText.map(node => node.id === "t" ? { ...node, metadata: { ...node.metadata, content: `${text}（改）` } } : node);
    const afterEdit = bindLtvCurrentReferences(before.prompt, ["a", "t"], edited, before);
    assert.equal(afterEdit.texts![0].resolved, undefined);
    assert.equal(afterEdit.texts![0].content, `${text}（改）`);
    // The rebind records the edited body as the new accepted version, so it can be submitted.
    assert.doesNotThrow(() => resolveLtvRuntimeTexts(afterEdit, edited));
    // Without a previous plan the body keeps the previous behaviour.
    assert.equal(bindLtvCurrentReferences(before.prompt, ["a", "t"], withText).texts![0].resolved, undefined);
});

test("deferred references wait for upstream success and survive copy and reload", () => {
    const pending: LtvReferencePlan = { prompt: "@图片1", references: [{ nodeId: "a", kind: "image", url: "", deferred: true }] };
    const copied = JSON.parse(JSON.stringify(remapLtvReferencePlan(pending, new Map([["a", "copied"]]), true)));
    const node = { ...nodes()[0], id: "copied", metadata: { content: "", status: "idle" } } as CanvasNodeData;
    assert.throws(() => resolveLtvRuntimeReferences(copied, [node], copied.prompt), /尚未生成成功/);
    node.metadata = { content: "https://example.test/new-output", status: "success" };
    assert.equal(resolveLtvRuntimeReferences(copied, [node], copied.prompt)[0].id, "copied");
    node.metadata.status = "error";
    assert.throws(() => resolveLtvRuntimeReferences(copied, [node], copied.prompt), /尚未生成成功/);
    assert.throws(() => resolveLtvRuntimeReferences({ ...pending, references: [{ ...pending.references[0], url: "https://example.test/a" }] }, nodes(), pending.prompt), /冲突/);
});
