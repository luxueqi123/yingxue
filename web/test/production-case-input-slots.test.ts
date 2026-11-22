import { expect, test } from "bun:test";
import support from "../src/lib/production-case-support.json";

test("published case contracts count each identified input slot once", () => {
    const duplicates: string[] = [];
    const configurationKeys = new Set(["nodeId", "channelId", "modelKey", "protocol", "operation", "references", "promptChars", "options", "reason", "textCount", "scope"]);
    const record = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === "object" && !Array.isArray(value));
    for (const entry of support) {
        const seen = new Set<string>();
        for (const slot of entry.requiredInputs ?? []) {
            // Historical reports also retain model configuration and empty-prompt issues in this array.
            // They are not identified input slots; validate their known contracts instead of merging undefined kinds.
            if (!slot.kind) {
                const requirement = slot as Record<string, unknown>;
                const validNode = typeof requirement.nodeId === "string" && requirement.nodeId.length > 0;
                const configuration = validNode
                    && Object.keys(requirement).every(key => configurationKeys.has(key))
                    && typeof requirement.channelId === "string" && typeof requirement.modelKey === "string"
                    && typeof requirement.protocol === "string" && requirement.protocol.length > 0
                    && typeof requirement.reason === "string" && requirement.reason.length > 0
                    && (requirement.operation === undefined || typeof requirement.operation === "string")
                    && (requirement.options === undefined || record(requirement.options))
                    && (requirement.references === undefined || record(requirement.references)
                        && Object.values(requirement.references).every(count => typeof count === "number" && Number.isSafeInteger(count) && count >= 0))
                    && (requirement.promptChars === undefined || typeof requirement.promptChars === "number" && Number.isSafeInteger(requirement.promptChars) && requirement.promptChars >= 0)
                    && (requirement.textCount === undefined || typeof requirement.textCount === "number" && Number.isSafeInteger(requirement.textCount) && requirement.textCount >= 0)
                    && (requirement.scope === undefined || typeof requirement.scope === "string");
                const issue = validNode && requirement.code === "empty-prompt" && requirement.category === "input"
                    && typeof requirement.detail === "string"
                    && Object.keys(requirement).every(key => ["nodeId", "code", "category", "detail"].includes(key));
                const storyboardDefault = validNode && requirement.scope === "storyboard-image-defaults"
                    && typeof requirement.modelKey === "string" && typeof requirement.reason === "string" && requirement.reason.length > 0
                    && Object.keys(requirement).every(key => ["nodeId", "scope", "modelKey", "reason"].includes(key));
                expect(configuration || issue || storyboardDefault, `${entry.id}:${slot.nodeId} must retain a known configuration or issue contract`).toBe(true);
                continue;
            }
            if (!slot.nodeId) continue;
            const key = JSON.stringify([slot.nodeId, slot.kind]);
            if (seen.has(key)) duplicates.push(`${entry.id}:${key}`);
            seen.add(key);
        }
    }
    expect(duplicates).toEqual([]);
});

test("Starlight retains its engineering and channel requirements after slot deduplication", () => {
    const entry = support.find(row => row.id === "case-d9b8f289f6044931aba0d6257b4a2ac6")!;
    expect(entry.nodeCount).toBe(519);
    expect(entry.connectionCount).toBe(423);
    expect(entry.requiredInputs).toHaveLength(12);
    expect(entry.requiredConfiguration).toHaveLength(71);
});
