export function creativeProjectTarget(featureId: string, projectId: string) {
    if (!projectId.trim()) return null;
    const base = `/projects/${encodeURIComponent(projectId)}`;
    switch (featureId) {
        case "script-creation": return { labelKey: "toolEditChapters" as const, path: `${base}/chapters` };
        case "director-guide": return { labelKey: "toolEditStoryboard" as const, path: `${base}/workflow` };
        case "portrait-studio": return { labelKey: "toolEditCharacters" as const, path: `${base}/assets?category=character` };
        default: return null;
    }
}
