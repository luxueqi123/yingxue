import { expect, test } from "bun:test";
import { collectLtvRequiredInputs, summarizeLtvReadiness } from "../src/lib/canvas/ltv-case-readiness";

test("one input slot is not counted twice when distinct diagnostics describe it", () => {
    const issues = [
        { nodeId: "image-1", code: "empty-prompt", detail: "empty saved prompt" },
        { nodeId: "image-1", code: "empty-prompt", detail: "generation input missing" },
        { nodeId: "image-1", code: "missing-camera-preset", detail: "CameraPreset 1" },
        { nodeId: "image-1", code: "empty-resource", detail: "missing image" },
        { nodeId: "image-2", code: "empty-prompt", detail: "another node" },
        { nodeId: "image-2", code: "channel-configuration-required", detail: "model" },
    ];
    expect(collectLtvRequiredInputs(issues)).toEqual([
        { nodeId: "image-1", kind: "prompt" },
        { nodeId: "image-1", kind: "media" },
        { nodeId: "image-2", kind: "prompt" },
    ]);
    // Slot counts are a presentation summary, not permission to drop evidence.
    expect(summarizeLtvReadiness(issues).requirements).toHaveLength(6);
    expect(issues).toHaveLength(6);
});

test("text-reference input remains represented and unrelated blockers are not input slots", () => {
    expect(collectLtvRequiredInputs([
        { nodeId: "text-1", code: "unresolved-text-mention", detail: "Image 1" },
        { nodeId: "text-1", code: "invalid-edge", detail: "edge missing" },
        { nodeId: "text-1", code: "model-selection-required", detail: "model" },
    ])).toEqual([{ nodeId: "text-1", kind: "prompt" }]);
    expect(collectLtvRequiredInputs([])).toEqual([]);
});

test("unknown node identity does not collapse independent missing inputs", () => {
    const issues = [
        { code: "empty-prompt", detail: "first unidentified node" },
        { code: "empty-prompt", detail: "second unidentified node" },
    ];
    expect(collectLtvRequiredInputs(issues)).toHaveLength(2);
});
