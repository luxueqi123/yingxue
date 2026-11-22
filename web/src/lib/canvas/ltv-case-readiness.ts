export type LtvCaseIssue = { nodeId?: string; code: string; detail: string };
export type LtvReadinessCategory = "source-data" | "configuration" | "input" | "adapter" | "capability-review";

/** Summarize upload/prompt slots without merging the original diagnostic evidence. */
export function collectLtvRequiredInputs(issues: LtvCaseIssue[]) {
    const slots: { nodeId?: string; kind: "media" | "prompt" }[] = [];
    const seen = new Set<string>();
    for (const issue of issues) {
        if (!["empty-prompt", "empty-resource", "missing-camera-preset", "unresolved-text-mention"].includes(issue.code)) continue;
        const kind = issue.code === "empty-resource" ? "media" : "prompt";
        const key = JSON.stringify([issue.nodeId, kind]);
        // Without a node identity there is no evidence that two issues describe the same slot.
        if (issue.nodeId && seen.has(key)) continue;
        if (issue.nodeId) seen.add(key);
        slots.push({ nodeId: issue.nodeId, kind });
    }
    return slots;
}

const sourceData = new Set([
    "snapshot-unavailable", "missing-graph", "invalid-ids", "invalid-edge",
    "unrecoverable-media", "missing-parent", "parent-cycle", "invalid-layout",
    "invalid-count", "invalid-saved-output", "invalid-portrait-options", "invalid-switch-parameter",
]);

/** Deployment configuration is not evidence that the host cannot implement a source workflow. */
export function ltvIssueCategory(code: string): LtvReadinessCategory {
    if (sourceData.has(code)) return "source-data";
    if (code === "empty-prompt" || code === "empty-resource") return "input";
    // A saved scene node whose template accepts "prompt_or_image" but that carries neither a
    // description nor an image is missing user content, not a host gap: the template itself is
    // never injected as the user's story (that is what the hasStory guard prevents). The
    // image-only scenes report their own upload slot through `empty-resource`, so a node that still
    // lands here is waiting for the author to type a description or attach a picture.
    if (code === "scene-reference-required") return "input";
    // A {{CameraPreset N}} marker whose index has no saved preset text: the source resolved it from
    // the user's global preset store, which the archived project does not carry. The rest of the
    // prompt is intact and the missing camera instruction is creation text the user re-supplies, so
    // this is a missing input rather than an adapter gap or a broken source project.
    if (code === "missing-camera-preset") return "input";
    // A text body whose `{{Image|Portrait|Video|Audio|Mixed N}}` marker has no saved slot: the
    // source resolved that index against the user's live canvas, which the archived project does not
    // carry. The prompt rewrite already reported the same family as an adapter error because the
    // marker must be interpreted, but here the body itself is intact and the missing piece is the
    // reference the user re-binds, so this is a missing input rather than an adapter gap.
    if (code === "unresolved-text-mention") return "input";
    if (code === "channel-configuration-required") return "configuration";
    if (["model-selection-required", "project-size-limit"].includes(code)) return "capability-review";
    return "adapter";
}

export function summarizeLtvReadiness(issues: LtvCaseIssue[]) {
    const requirements = issues.map(issue => ({ ...issue, category: ltvIssueCategory(issue.code) }));
    const categories = new Set(requirements.map(issue => issue.category));
    const status = !issues.length ? "ready"
        : categories.size === 1 && categories.has("configuration") ? "configuration-required"
        : categories.size === 1 && categories.has("input") ? "input-required"
        : [...categories].every(category => category === "input" || category === "configuration") ? "configuration-required"
        : categories.has("source-data") ? "source-repair-required"
        : categories.has("adapter") ? "adaptation-required" : "capability-review-required";
    return { status, requirements, permanentlyIncompatible: false };
}
