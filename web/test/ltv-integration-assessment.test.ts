import { afterEach, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { assessLtvIntegrationData, classifyLtvIntegrationIssue } from "../src/lib/canvas/ltv-integration-assessment";

const temporaryDirectories: string[] = [];

function temporaryDirectory(prefix: string) {
    const directory = mkdtempSync(join(tmpdir(), prefix));
    temporaryDirectories.push(directory);
    return directory;
}

afterEach(() => {
    for (const directory of temporaryDirectories.splice(0)) {
        rmSync(directory, { recursive: true, force: true });
    }
});

describe("LTV integration assessment", () => {
    test("maps the full issue vocabulary without converting an unknown code into a rejection", () => {
        const expected: Record<string, string> = {
            "snapshot-unavailable": "source-data",
            "missing-graph": "source-data",
            "invalid-ids": "source-data",
            "invalid-edge": "source-data",
            "unrecoverable-media": "source-data",
            "missing-parent": "source-data",
            "parent-cycle": "source-data",
            "invalid-layout": "source-data",
            "invalid-count": "source-data",
            "invalid-saved-output": "source-data",
            "invalid-portrait-options": "source-data",
            "invalid-switch-parameter": "source-data",
            "invalid-reference": "adapter",
            "multiple-parents": "adapter",
            "cyclic-workflow": "adapter",
            "cyclic-reference-dependency": "adapter",
            "invalid-text-input": "adapter",
            "invalid-camera-preset": "adapter",
            "channel-configuration-required": "configuration",
            "empty-prompt": "input",
            "empty-resource": "input",
            "scene-reference-required": "input",
            "missing-camera-preset": "input",
            "unresolved-text-mention": "input",
            "unbound-input": "adapter",
            "unsupported-node": "adapter",
            "unsupported-operation": "adapter",
            "advanced-operation": "adapter",
            "audio-adapter-required": "adapter",
            "camera-control-required": "adapter",
            "unmapped-production-parameters": "adapter",
            "video-quality-adapter-required": "adapter",
            "search-option-unmapped": "adapter",
            "storyboard-asset-unmapped": "adapter",
            "storyboard-capacity-required": "adapter",
            "storyboard-columns-unmapped": "adapter",
            "storyboard-field-unmapped": "adapter",
            "storyboard-output-unmapped": "adapter",
            "storyboard-view-unmapped": "adapter",
            "model-selection-required": "capability-review",
            "project-size-limit": "capability-review",
        };

        expect(Object.keys(expected).length).toBeGreaterThanOrEqual(34);
        for (const [code, category] of Object.entries(expected)) {
            expect(classifyLtvIntegrationIssue({ code, detail: `fixture:${code}` })).toBe(category);
        }
        expect(classifyLtvIntegrationIssue({ code: "unseen-future-code", detail: "keep for review" })).toBe("adapter");
    });

    test("exposes six readiness statuses while keeping runtime evidence separate", () => {
        const data = assessLtvIntegrationData({
            history: {
                reports: [
                    { id: "ready", issues: [] },
                    { id: "configuration", issues: [{ code: "channel-configuration-required", detail: "select a channel" }] },
                    { id: "input", issues: [{ code: "empty-prompt", detail: "write the prompt" }] },
                    { id: "source", issues: [{ code: "missing-graph", detail: "snapshot graph missing" }] },
                    { id: "adapter", issues: [{ code: "unsupported-operation", detail: "operation mapping missing" }] },
                    { id: "review", issues: [{ code: "model-selection-required", detail: "model contract needs review" }] },
                ],
                support: [{ id: "ready" }],
                decisions: {
                    discardedCases: [{ id: "configuration" }, { id: "input" }, { id: "source" }, { id: "adapter" }, { id: "review" }],
                    pendingCases: [],
                },
            },
            expectedTotal: 6,
        });

        expect(data.records.map((record) => record.status)).toEqual(["ready", "configuration-required", "input-required", "source-repair-required", "adaptation-required", "capability-review-required"]);
        expect(data.records.every((record) => record.runtimeEvidence === "unverified")).toBe(true);
        expect(data.summary.runtimeEvidence).toEqual({ verified: 0, unverified: 6 });
    });

    test("retains every mixed issue and its origin, independent of issue order", () => {
        const report = {
            id: "mixed-case",
            name: "mixed fixture",
            sourceModel: "source-model-x",
            targetModel: "target-model-y",
            supported: false,
            adoptable: false,
            issues: [
                { code: "empty-prompt", detail: "needs authored text", nodeId: "text-1", source: "snapshot.nodeList[0]" },
                { code: "channel-configuration-required", detail: "no enabled channel", nodeId: "image-1", source: "catalog.lookup" },
                { code: "unsupported-operation", detail: "unmapped source operation", nodeId: "video-1", source: "snapshot.nodeList[2]" },
                { code: "missing-graph", detail: "snapshot graph missing", source: "snapshot.connectionList" },
            ],
        };
        const history = {
            reports: [report],
            support: [],
            decisions: { discardedCases: [{ id: report.id, reasonCode: "old-static-exclusion" }], pendingCases: [] },
        };
        const assessed = assessLtvIntegrationData({ history, expectedTotal: 1 }).records[0];
        const reversed = assessLtvIntegrationData({
            history: {
                ...history,
                reports: [{ ...report, issues: [...report.issues].reverse() }],
            },
            expectedTotal: 1,
        }).records[0];

        expect(assessed.status).toBe("source-repair-required");
        expect(assessed.status).toBe(reversed.status);
        expect(assessed.requirements.map((item) => item.code).sort()).toEqual([...report.issues.map((item) => item.code), "source-target-model-equivalence-unverified"].sort());
        expect(assessed.requirements).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    code: "empty-prompt",
                    category: "input",
                    issue: report.issues[0],
                    origin: { dataset: "history/reports.json", field: "issues", index: 0 },
                }),
                expect.objectContaining({
                    code: "unsupported-operation",
                    category: "adapter",
                    issue: report.issues[2],
                    origin: { dataset: "history/reports.json", field: "issues", index: 2 },
                }),
            ]),
        );
        expect(assessed.requirements).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    code: "source-target-model-equivalence-unverified",
                    category: "capability-review",
                    origin: expect.objectContaining({ field: "sourceModel,targetModel" }),
                }),
            ]),
        );
        expect(assessed.sourceModel).toBe("source-model-x");
        expect(assessed.targetModel).toBe("target-model-y");
    });

    test("reassesses current issues without treating historical support or decisions as proof", () => {
        const history = {
            reports: [
                { id: "case-a", name: "A", supported: true, adoptable: true, issues: [] },
                { id: "case-b", name: "B", supported: false, adoptable: false, issues: [{ code: "unsupported-node", detail: "old finding" }] },
                { id: "case-c", name: "C", supported: false, adoptable: false, issues: [{ code: "advanced-operation", detail: "old finding" }] },
            ],
            support: [{ id: "case-a", sha256: "old-hash" }],
            decisions: {
                receipt: { run: "r51", permanentExclusions: 665 },
                discardedCases: [{ id: "case-b", reasonCode: "old-hostless-rule", note: "preserve this" }],
                pendingCases: [{ id: "case-c", reasonCode: "old-pending-rule" }],
            },
        };
        const current = {
            reports: [
                { id: "case-a", name: "A", issues: [{ code: "channel-configuration-required", detail: "configure channel" }] },
                { id: "case-b", name: "B", issues: [{ code: "empty-prompt", detail: "input needed" }], readiness: { status: "adaptation-required", requirements: [{ code: "empty-prompt", detail: "input needed", category: "adapter" }] } },
                { id: "case-c", name: "C", issues: [{ code: "model-selection-required", detail: "target capability unknown" }] },
            ],
            support: [{ id: "case-a" }, { id: "case-b" }],
        };

        const result = assessLtvIntegrationData({ history, current, expectedTotal: 3 });
        const caseB = result.records.find((record) => record.id === "case-b");
        const caseC = result.records.find((record) => record.id === "case-c");

        expect(result.records.map((record) => record.id)).toEqual(["case-a", "case-b", "case-c"]);
        expect(result.records.map((record) => record.status)).toEqual(["configuration-required", "input-required", "capability-review-required"]);
        expect(caseB?.runtimeEvidence).toBe("unverified");
        expect(caseB?.reportedStatus).toBe("adaptation-required");
        expect(result.summary.readinessComparison).toEqual({ compared: 1, mismatches: 1, mismatchIds: ["case-b"] });
        expect(caseB?.history.support).toBeUndefined();
        expect(caseB?.current.support).toEqual({ id: "case-b" });
        expect(caseB?.history.decision).toEqual({ id: "case-b", reasonCode: "old-hostless-rule", note: "preserve this" });
        expect(caseC?.history.decision).toEqual({ id: "case-c", reasonCode: "old-pending-rule" });
        expect(result.summary.permanentlyIncompatible).toBe(0);
        expect(result.summary.coverage).toEqual({ total: 3, reports: 3, support: 1, decisions: 2, currentSupport: 2 });
    });

    test("rejects duplicate IDs, overlap, and incomplete historical coverage", () => {
        const report = (id: string) => ({ id, issues: [] });

        expect(() =>
            assessLtvIntegrationData({
                history: {
                    reports: [report("a"), report("a")],
                    support: [{ id: "a" }],
                    decisions: { discardedCases: [], pendingCases: [] },
                },
                expectedTotal: 1,
            }),
        ).toThrow(/duplicate.*report/i);

        expect(() =>
            assessLtvIntegrationData({
                history: {
                    reports: [report("a")],
                    support: [{ id: "a" }],
                    decisions: { discardedCases: [{ id: "a" }], pendingCases: [] },
                },
                expectedTotal: 1,
            }),
        ).toThrow(/overlap/i);

        expect(() =>
            assessLtvIntegrationData({
                history: {
                    reports: [report("a"), report("b")],
                    support: [{ id: "a" }],
                    decisions: { discardedCases: [], pendingCases: [] },
                },
                expectedTotal: 2,
            }),
        ).toThrow(/coverage/i);
    });

    test("the CLI requires explicit input and output directories and writes only the three audit reports", () => {
        const script = resolve(import.meta.dir, "../scripts/reassess-native-cases.mjs");
        const missingArgs = spawnSync(process.execPath, [script], { encoding: "utf8" });
        expect(missingArgs.status).not.toBe(0);
        expect(missingArgs.stderr + missingArgs.stdout).toMatch(/--input-dir.*--output-dir/i);

        const root = temporaryDirectory("ltv-integration-assessment-");
        const input = join(root, "legacy");
        const current = join(root, "current");
        const output = join(root, "audit");
        mkdirSync(input);
        mkdirSync(current);
        const legacy = {
            reports: [
                { id: "case-a", name: "A", supported: true, adoptable: true, issues: [] },
                { id: "case-b", name: "B", supported: false, adoptable: false, issues: [{ code: "unsupported-node", detail: "legacy" }] },
            ],
            support: [{ id: "case-a" }],
            decisions: { discardedCases: [{ id: "case-b", reasonCode: "historic" }], pendingCases: [] },
        };
        writeFileSync(join(input, "reports.json"), JSON.stringify(legacy.reports));
        writeFileSync(join(input, "support.json"), JSON.stringify(legacy.support));
        writeFileSync(join(input, "decisions.json"), JSON.stringify(legacy.decisions));
        writeFileSync(
            join(current, "reports.json"),
            JSON.stringify([
                { id: "case-a", name: "A", issues: [{ code: "channel-configuration-required", detail: "config" }] },
                { id: "case-b", name: "B", issues: [{ code: "empty-prompt", detail: "input" }] },
            ]),
        );
        writeFileSync(join(current, "support.json"), JSON.stringify([{ id: "case-a" }, { id: "case-b" }]));

        const run = spawnSync(process.execPath, [script, "--input-dir", input, "--current-dir", current, "--output-dir", output, "--expected-total", "2"], { encoding: "utf8" });
        expect(run.status).toBe(0);
        expect(JSON.parse(readFileSync(join(output, "summary.json"), "utf8")).total).toBe(2);
        expect(JSON.parse(readFileSync(join(output, "records.json"), "utf8")).records).toHaveLength(2);
        expect(readFileSync(join(output, "records.md"), "utf8")).toContain("case-b");
        expect(readdirSync(output).sort()).toEqual(["records.json", "records.md", "summary.json"]);
        expect(readdirSync(input).sort()).toEqual(["decisions.json", "reports.json", "support.json"]);
    });
});
