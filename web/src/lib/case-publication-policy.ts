import policy from "./case-publication-policy.json";

const withdrawnCaseIds: ReadonlySet<string> = new Set(policy.withdrawn.map(item => item.id));

export function hasWithdrawnCaseBrand(title: string): boolean {
    return /l(?:ib)?tv/i.test(title.normalize("NFKC").replace(/[\s_·.\-]+/g, ""));
}

export function isCaseWithdrawn(id: string): boolean {
    const canonicalId = /^[a-f0-9]{32}$/.test(id) ? `case-${id}` : id;
    return withdrawnCaseIds.has(canonicalId);
}

/** Publication only: keep archived assets and users' already-created projects untouched. */
export function isCasePublic(item: { id: string; name?: string; kind?: string }): boolean {
    if (item.kind && item.kind !== "case") return true;
    return !isCaseWithdrawn(item.id) && !hasWithdrawnCaseBrand(item.name || "");
}
