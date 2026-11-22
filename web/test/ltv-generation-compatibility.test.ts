import { test } from "node:test";
import assert from "node:assert/strict";
import { assessLtvGenerationCase } from "../src/lib/canvas/ltv-generation-compatibility";
import { videoGenerationsReferenceError } from "../src/lib/video-generations-constraints";

const catalog = { channels: [{ id: "fixture", models: [{ modelKey: "test", displayName: "Seedance 2.5", capability: "video", protocol: "newapi-channel-2", capabilityConfig: { video: { operations: ["text_to_video"], ratios: ["16:9"], resolutions: ["720p"], duration: { min: 4, max: 30, step: 1 }, generateAudio: { supported: true }, references: { promptMaxChars: 1000, maxImages: 30, maxVideos: 10, maxAudios: 10 } } } }] }] };
const source = () => ({ nodes: [{ id: "v", type: "video", data: { action: "video_generate", params: { model: "star-video2.5", modeType: "text2video", prompt: "镜头缓慢推进", duration: 99, settings: { duration: 18, ratio: "16:9", resolution: "720p", enableSound: "on" } } } }], edges: [] });

test("uses saved settings and rejects incompatible duration without truncation", () => {
    assert.equal(assessLtvGenerationCase(source(), catalog).executable, true);
    const value = source(); value.nodes[0].data.params.settings.duration = 31;
    assert.equal(assessLtvGenerationCase(value, catalog).executable, false);
});
test("does not guess model identities or discard advanced requirements", () => {
    const value = source(); value.nodes[0].data.params.model = "nebula-ultra";
    assert.ok(assessLtvGenerationCase(value, catalog).issues.some(issue => issue.code === "model-identity-unverified"));
    const advanced = source(); Object.assign(advanced.nodes[0].data.params, { advancedSettings: { search_enabled: 1 } });
    assert.ok(assessLtvGenerationCase(advanced, catalog).issues.some(issue => issue.code === "advanced-option-adapter-required"));
});
test("shares the real transport reference limits instead of trusting catalog alone", () => {
    assert.equal(videoGenerationsReferenceError(9, 3, 3), "");
    assert.match(videoGenerationsReferenceError(10, 0, 0), /最多支持/);
    assert.match(videoGenerationsReferenceError(1, 0, 1), /同时提供/);
    const value = source(); Object.assign(value.nodes[0].data.params, { imageList: Array.from({ length: 10 }, (_, i) => ({ nodeId: `i${i}`, url: "https://example.test/a.png" })) });
    assert.ok(assessLtvGenerationCase(value, catalog).routes.every(route => route.issues.some(issue => issue.code === "protocol-reference-limit")));
});

test("rejects malformed references without aborting a batch", () => {
    const value = source();
    Object.assign(value.nodes[0].data.params, { imageList: [null, {}, { nodeId: "v", url: "https://example.test/a" }], audioList: [null] });
    const result = assessLtvGenerationCase(value, catalog);
    assert.equal(result.executable, false);
    assert.ok(result.issues.some(issue => issue.code === "invalid-reference"));
    assert.equal(assessLtvGenerationCase(source(), { channels: [null, { models: [null] }] }).executable, false);
});

test("matches exact resource versions, not URL substrings", () => {
    const value = source();
    Object.assign(value.nodes[0].data, { url: "https://example.test/image-original" });
    Object.assign(value.nodes[0].data.params, { imageList: [{ nodeId: "v", url: "https://example.test/image" }] });
    assert.ok(assessLtvGenerationCase(value, catalog).issues.some(issue => issue.code === "reference-version-mismatch"));
});

test("checks the effective advanced override and retains explicit off requirements", () => {
    const value = source();
    Object.assign(value.nodes[0].data.params, { advancedSettings: { duration: 31, search_enabled: 0 } });
    const result = assessLtvGenerationCase(value, catalog);
    assert.ok(result.routes.every(route => route.issues.some(issue => issue.code === "unsupported-duration")));
    assert.ok(result.issues.some(issue => issue.code === "advanced-option-adapter-required" && issue.detail === "search_enabled"));
});
