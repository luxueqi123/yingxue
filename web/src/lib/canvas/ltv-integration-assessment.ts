export const LTV_INTEGRATION_CATEGORIES = ["configuration", "input", "adapter", "capability-review", "source-data"] as const;

export const LTV_INTEGRATION_STATUSES = ["ready", "configuration-required", "input-required", "source-repair-required", "adaptation-required", "capability-review-required"] as const;

export type LtvIntegrationCategory = (typeof LTV_INTEGRATION_CATEGORIES)[number];
export type LtvIntegrationStatus = (typeof LTV_INTEGRATION_STATUSES)[number];

type JsonRecord = Record<string, unknown>;

export type LtvIntegrationIssue = JsonRecord & {
    code?: string;
    detail?: unknown;
    nodeId?: unknown;
};

export type LtvIssueOrigin = {
    dataset: string;
    field: string;
    index: number;
};

export type LtvIntegrationRequirement = {
    code: string;
    category: LtvIntegrationCategory;
    issue: LtvIntegrationIssue;
    origin: LtvIssueOrigin;
    sourceOrigins: LtvIssueOrigin[];
    historicalCategory?: string;
};

type DecisionEntry = { id: string; group: string; value: JsonRecord };
type ReportIssueEntry = {
    issue: LtvIntegrationIssue;
    origin: LtvIssueOrigin;
    reportedCategory?: string;
};

export type LtvIntegrationInput = {
    history: {
        reports: unknown[];
        support: unknown[];
        decisions: unknown;
    };
    current?: {
        reports: unknown[];
        support: unknown[];
    };
    expectedTotal?: number;
};

export type LtvIntegrationRecord = {
    id: string;
    name: string;
    status: LtvIntegrationStatus;
    reportedStatus?: string;
    categories: LtvIntegrationCategory[];
    requirements: LtvIntegrationRequirement[];
    runtimeEvidence: "unverified";
    sourceModel?: unknown;
    targetModel?: unknown;
    current: {
        report: JsonRecord;
        support?: JsonRecord;
    };
    history: {
        report: JsonRecord;
        issues?: Array<{ issue: LtvIntegrationIssue; origin: LtvIssueOrigin; category: LtvIntegrationCategory }>;
        issuesSameAsCurrent: boolean;
        support?: JsonRecord;
        decision?: JsonRecord;
        decisionGroup?: string;
    };
};

export type LtvIntegrationAssessment = {
    records: LtvIntegrationRecord[];
    summary: {
        total: number;
        statuses: Record<LtvIntegrationStatus, number>;
        categories: Record<LtvIntegrationCategory, number>;
        permanentlyIncompatible: 0;
        runtimeEvidence: { verified: 0; unverified: number };
        readinessComparison: {
            compared: number;
            mismatches: number;
            mismatchIds: string[];
        };
        coverage: {
            total: number;
            reports: number;
            support: number;
            decisions: number;
            currentSupport: number;
        };
        supportComparison: {
            retained: number;
            added: number;
            removed: number;
            addedIds: string[];
            removedIds: string[];
        };
        assessmentBasis: "legacy-reports" | "current-recomputation";
    };
};

const categoryByIssueCode: Record<string, LtvIntegrationCategory> = {
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
    "channel-configuration-required": "configuration",

    "empty-prompt": "input",
    "empty-resource": "input",
    "scene-reference-required": "input",
    "missing-camera-preset": "input",
    "unresolved-text-mention": "input",
    "unsupported-node": "adapter",
    "unsupported-operation": "adapter",
    "advanced-operation": "adapter",
    "invalid-reference": "adapter",
    "multiple-parents": "adapter",
    "cyclic-workflow": "adapter",
    "cyclic-reference-dependency": "adapter",
    "invalid-text-input": "adapter",
    "invalid-camera-preset": "adapter",
    "unbound-input": "adapter",
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
    language: "adapter",

    "model-selection-required": "capability-review",
    "project-size-limit": "capability-review",
};

const modelEquivalenceIssueCode = "source-target-model-equivalence-unverified";

function isRecord(value: unknown): value is JsonRecord {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function requireRecord(value: unknown, label: string): JsonRecord {
    if (!isRecord(value)) throw new Error(`${label} must be an object`);
    return value;
}

function requireRows(value: unknown, label: string): JsonRecord[] {
    if (!Array.isArray(value)) throw new Error(`${label} must be an array`);
    return value.map((item, index) => requireRecord(item, `${label}[${index}]`));
}

function recordId(record: JsonRecord, label: string): string {
    if (typeof record.id !== "string" || !record.id.trim()) {
        throw new Error(`${label} must have a non-empty string id`);
    }
    return record.id;
}

function uniqueById(rows: JsonRecord[], label: string): Map<string, JsonRecord> {
    const result = new Map<string, JsonRecord>();
    rows.forEach((row, index) => {
        const id = recordId(row, `${label}[${index}]`);
        if (result.has(id)) throw new Error(`Duplicate ${label} id: ${id}`);
        result.set(id, row);
    });
    return result;
}

function normalizeDecisionEntries(value: unknown): DecisionEntry[] {
    if (Array.isArray(value)) {
        return requireRows(value, "history.decisions").map((record, index) => ({
            id: recordId(record, `history.decisions[${index}]`),
            group: "decisions",
            value: record,
        }));
    }

    const decisions = requireRecord(value, "history.decisions");
    const groups = ["discardedCases", "pendingCases"];
    const entries: DecisionEntry[] = [];
    for (const group of groups) {
        if (decisions[group] === undefined) continue;
        requireRows(decisions[group], `history.decisions.${group}`).forEach((record, index) => {
            entries.push({
                id: recordId(record, `history.decisions.${group}[${index}]`),
                group,
                value: record,
            });
        });
    }
    if (!groups.some((group) => decisions[group] !== undefined)) {
        throw new Error("history.decisions must be an array or contain discardedCases/pendingCases arrays");
    }
    return entries;
}

function getReportIssues(report: JsonRecord, reportLabel: string): ReportIssueEntry[] {
    const reportIssues = report.issues;
    const readiness = isRecord(report.readiness) ? report.readiness : undefined;
    const historicalRequirements = readiness?.requirements;
    const issueRows = reportIssues === undefined ? [] : requireRows(reportIssues, `${reportLabel}.issues`);
    const requirementRows = historicalRequirements === undefined ? [] : requireRows(historicalRequirements, `${reportLabel}.readiness.requirements`);

    if (reportIssues !== undefined && historicalRequirements !== undefined) {
        if (issueRows.length !== requirementRows.length) {
            throw new Error(`${reportLabel} issues/readiness requirements count mismatch`);
        }
        for (let index = 0; index < issueRows.length; index += 1) {
            const left = issueRows[index];
            const right = requirementRows[index];
            if (left.code !== right.code || JSON.stringify(left.detail) !== JSON.stringify(right.detail) || JSON.stringify(left.nodeId) !== JSON.stringify(right.nodeId)) {
                throw new Error(`${reportLabel} issues/readiness requirements mismatch at ${index}`);
            }
        }
    }

    const selected = reportIssues !== undefined ? issueRows : requirementRows;
    const sourceField = reportIssues !== undefined ? "issues" : "readiness.requirements";
    const sourceRequirements = reportIssues !== undefined ? requirementRows : [];
    return selected.map((issue, index) => ({
        issue,
        origin: { dataset: "reports.json", field: sourceField, index },
        ...(sourceRequirements[index] && typeof sourceRequirements[index].category === "string" ? { reportedCategory: sourceRequirements[index].category } : {}),
    }));
}

function safeReportMetadata(report: JsonRecord): JsonRecord {
    const metadata = { ...report };
    delete metadata.issues;
    if (isRecord(metadata.readiness)) {
        const readinessMetadata = { ...metadata.readiness };
        delete readinessMetadata.requirements;
        metadata.readiness = readinessMetadata;
    }
    return metadata;
}

function sameIssues(left: ReportIssueEntry[], right: ReportIssueEntry[]): boolean {
    return JSON.stringify(left.map((item) => item.issue)) === JSON.stringify(right.map((item) => item.issue));
}

export function classifyLtvIntegrationIssue(issue: Pick<LtvIntegrationIssue, "code">): LtvIntegrationCategory {
    return issue.code === modelEquivalenceIssueCode ? "capability-review" : (categoryByIssueCode[typeof issue.code === "string" ? issue.code : ""] ?? "adapter");
}

function statusForCategories(categories: Set<LtvIntegrationCategory>): LtvIntegrationStatus {
    if (!categories.size) return "ready";
    if ([...categories].every((category) => category === "configuration" || category === "input")) {
        return categories.has("configuration") ? "configuration-required" : "input-required";
    }
    if (categories.has("source-data")) return "source-repair-required";
    if (categories.has("adapter")) return "adaptation-required";
    return "capability-review-required";
}

function makeRequirements(report: JsonRecord, issues: ReturnType<typeof getReportIssues>, run: "current" | "history"): LtvIntegrationRequirement[] {
    const requirements = issues.map(({ issue, origin, reportedCategory }) => ({
        code: typeof issue.code === "string" ? issue.code : "<missing-code>",
        category: classifyLtvIntegrationIssue(issue),
        issue,
        origin: { ...origin, dataset: run === "current" ? "current/reports.json" : "history/reports.json" },
        sourceOrigins: [{ ...origin, dataset: run === "current" ? "current/reports.json" : "history/reports.json" }],
        ...(reportedCategory ? { ...(run === "history" ? { historicalCategory: reportedCategory } : { reportedCategory }) } : {}),
    }));

    const sourceModel = report.sourceModel;
    const targetModel = report.targetModel;
    if (typeof sourceModel === "string" && sourceModel.trim() && typeof targetModel === "string" && targetModel.trim() && sourceModel !== targetModel) {
        const issue: LtvIntegrationIssue = {
            code: modelEquivalenceIssueCode,
            detail: "源模型与目标模型不一致，当前记录未提供可核验的等价映射证据。",
            sourceModel,
            targetModel,
        };
        requirements.push({
            code: modelEquivalenceIssueCode,
            category: "capability-review",
            issue,
            origin: {
                dataset: run === "current" ? "current/reports.json" : "history/reports.json",
                field: "sourceModel,targetModel",
                index: -1,
            },
            sourceOrigins: [
                {
                    dataset: run === "current" ? "current/reports.json" : "history/reports.json",
                    field: "sourceModel,targetModel",
                    index: -1,
                },
            ],
        });
    }

    return requirements;
}

function compactDecisionMap(entries: DecisionEntry[]): Map<string, DecisionEntry> {
    const result = new Map<string, DecisionEntry>();
    for (const entry of entries) {
        if (result.has(entry.id)) throw new Error(`Duplicate history decision id: ${entry.id}`);
        result.set(entry.id, entry);
    }
    return result;
}

function diffIds(left: Set<string>, right: Set<string>) {
    return [...left].filter((id) => !right.has(id)).sort();
}

export function assessLtvIntegrationData(input: LtvIntegrationInput): LtvIntegrationAssessment {
    const expectedTotal = input.expectedTotal ?? 1024;
    if (!Number.isInteger(expectedTotal) || expectedTotal < 1) throw new Error("expectedTotal must be a positive integer");

    const history = requireRecord(input.history, "history");
    const historyReports = requireRows(history.reports, "history.reports");
    const historySupport = requireRows(history.support, "history.support");
    const historyReportMap = uniqueById(historyReports, "history report");
    const historySupportMap = uniqueById(historySupport, "history support");
    const historyDecisionEntries = normalizeDecisionEntries(history.decisions);
    const historyDecisionMap = compactDecisionMap(historyDecisionEntries);

    if (historyReports.length !== expectedTotal) {
        throw new Error(`history report coverage mismatch: expected ${expectedTotal}, received ${historyReports.length}`);
    }
    const historyIds = new Set(historyReportMap.keys());
    const overlap = [...historySupportMap.keys()].filter((id) => historyDecisionMap.has(id));
    if (overlap.length) throw new Error(`Historical support/decision overlap: ${overlap.slice(0, 5).join(", ")}`);
    const historicalPartition = new Set([...historySupportMap.keys(), ...historyDecisionMap.keys()]);
    const missingHistorical = diffIds(historyIds, historicalPartition);
    const foreignHistorical = diffIds(historicalPartition, historyIds);
    if (missingHistorical.length || foreignHistorical.length) {
        throw new Error(`Historical decision coverage mismatch: missing=${missingHistorical.length}, foreign=${foreignHistorical.length}`);
    }

    const hasCurrent = Boolean(input.current);
    const currentInput = input.current ?? { reports: historyReports, support: historySupport };
    const currentReports = requireRows(currentInput.reports, "current.reports");
    const currentSupport = requireRows(currentInput.support, "current.support");
    const currentReportMap = uniqueById(currentReports, "current report");
    const currentSupportMap = uniqueById(currentSupport, "current support");
    if (currentReports.length !== expectedTotal) {
        throw new Error(`current report coverage mismatch: expected ${expectedTotal}, received ${currentReports.length}`);
    }
    const currentIds = new Set(currentReportMap.keys());
    const missingCurrent = diffIds(historyIds, currentIds);
    const foreignCurrent = diffIds(currentIds, historyIds);
    if (missingCurrent.length || foreignCurrent.length) {
        throw new Error(`Current report ID coverage mismatch: missing=${missingCurrent.length}, foreign=${foreignCurrent.length}`);
    }
    const foreignCurrentSupport = diffIds(new Set(currentSupportMap.keys()), currentIds);
    if (foreignCurrentSupport.length) {
        throw new Error(`Current support references unknown report ids: ${foreignCurrentSupport.slice(0, 5).join(", ")}`);
    }

    const statuses = Object.fromEntries(LTV_INTEGRATION_STATUSES.map((status) => [status, 0])) as Record<LtvIntegrationStatus, number>;
    const categories = Object.fromEntries(LTV_INTEGRATION_CATEGORIES.map((category) => [category, 0])) as Record<LtvIntegrationCategory, number>;
    const reportedStatuses: string[] = [];
    const readinessMismatchIds: string[] = [];
    const oldSupportIds = new Set(historySupportMap.keys());
    const newSupportIds = new Set(currentSupportMap.keys());
    const addedIds = diffIds(newSupportIds, oldSupportIds);
    const removedIds = diffIds(oldSupportIds, newSupportIds);
    const records: LtvIntegrationRecord[] = currentReports.map((currentReport, index) => {
        const id = recordId(currentReport, `current.reports[${index}]`);
        const historyReport = historyReportMap.get(id)!;
        const currentIssueEntries = getReportIssues(currentReport, `current.reports[${index}]`);
        const historyIssueEntries = getReportIssues(historyReport, `history.reports[${index}]`);
        const sameHistoricalIssues = sameIssues(currentIssueEntries, historyIssueEntries);
        const requirements = makeRequirements(currentReport, currentIssueEntries, hasCurrent ? "current" : "history");
        if (hasCurrent && sameHistoricalIssues) {
            requirements.forEach((requirement, issueIndex) => {
                const historyIssue = historyIssueEntries[issueIndex];
                if (!historyIssue || requirement.issue !== currentIssueEntries[issueIndex]?.issue) return;
                requirement.sourceOrigins.push({
                    ...historyIssue.origin,
                    dataset: "history/reports.json",
                });
                if (historyIssue.reportedCategory) requirement.historicalCategory = historyIssue.reportedCategory;
            });
        }
        const categorySet = new Set(requirements.map((requirement) => requirement.category));
        const status = statusForCategories(categorySet);
        const reportedStatus = isRecord(currentReport.readiness) && typeof currentReport.readiness.status === "string" ? currentReport.readiness.status : undefined;
        if (reportedStatus) {
            reportedStatuses.push(reportedStatus);
            if (reportedStatus !== status) readinessMismatchIds.push(id);
        }
        statuses[status] += 1;
        for (const category of categorySet) categories[category] += 1;

        const historyDecision = historyDecisionMap.get(id);
        const currentSupportRow = currentSupportMap.get(id);
        const historySupportRow = historySupportMap.get(id);
        const sourceModel = currentReport.sourceModel;
        const targetModel = currentReport.targetModel;

        return {
            id,
            name: typeof currentReport.name === "string" && currentReport.name ? currentReport.name : id,
            status,
            ...(reportedStatus ? { reportedStatus } : {}),
            categories: LTV_INTEGRATION_CATEGORIES.filter((category) => categorySet.has(category)),
            requirements,
            runtimeEvidence: "unverified",
            ...(sourceModel !== undefined ? { sourceModel } : {}),
            ...(targetModel !== undefined ? { targetModel } : {}),
            current: {
                report: safeReportMetadata(currentReport),
                ...(currentSupportRow ? { support: currentSupportRow } : {}),
            },
            history: {
                report: safeReportMetadata(historyReport),
                ...(sameHistoricalIssues
                    ? {}
                    : {
                          issues: historyIssueEntries.map(({ issue, origin, reportedCategory }) => ({
                              issue,
                              origin: { ...origin, dataset: "history/reports.json" },
                              category: classifyLtvIntegrationIssue(issue),
                              ...(reportedCategory ? { historicalCategory: reportedCategory } : {}),
                          })),
                      }),
                issuesSameAsCurrent: sameHistoricalIssues,
                ...(historySupportRow ? { support: historySupportRow } : {}),
                ...(historyDecision ? { decision: historyDecision.value, decisionGroup: historyDecision.group } : {}),
            },
        };
    });

    return {
        records,
        summary: {
            total: records.length,
            statuses,
            categories,
            permanentlyIncompatible: 0,
            runtimeEvidence: { verified: 0, unverified: records.length },
            readinessComparison: {
                compared: reportedStatuses.length,
                mismatches: readinessMismatchIds.length,
                mismatchIds: readinessMismatchIds,
            },
            coverage: {
                total: expectedTotal,
                reports: currentReports.length,
                support: historySupport.length,
                decisions: historyDecisionEntries.length,
                currentSupport: currentSupport.length,
            },
            supportComparison: {
                retained: [...oldSupportIds].filter((id) => newSupportIds.has(id)).length,
                added: addedIds.length,
                removed: removedIds.length,
                addedIds,
                removedIds,
            },
            assessmentBasis: hasCurrent ? "current-recomputation" : "legacy-reports",
        },
    };
}
