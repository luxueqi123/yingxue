export function normalizeBackendText(value: unknown): string | undefined {
    if (typeof value === "string") return value;
    if (value === null || value === undefined) return undefined;
    if (Array.isArray(value)) {
        const text = value.map(normalizeBackendText).filter((item): item is string => Boolean(item)).join("");
        return text || undefined;
    }
    if (typeof value === "object") {
        const record = value as Record<string, unknown>;
        for (const key of ["text", "content", "output_text", "value"]) {
            if (!(key in record)) continue;
            const nested = normalizeBackendText(record[key]);
            if (nested !== undefined) return nested;
        }
        return JSON.stringify(value);
    }
    return String(value);
}
