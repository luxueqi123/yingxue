export function workspaceBackTarget(state: unknown, fallback: string): { to: string; state?: unknown } {
    if (!state || typeof state !== "object" || !("returnTo" in state)) return { to: fallback };
    const target = state as { returnTo: unknown; returnState?: unknown };
    if (typeof target.returnTo !== "string"
        || /[\\\u0000-\u0020]/.test(target.returnTo)
        || !/^\/(home|create|studio|canvas|projects|dramas|assets|skills|plugins|prompts|tasks|settings|wallet|referral|toolbox|admin)(?:[/?#]|$)/.test(target.returnTo)) return { to: fallback };
    return { to: target.returnTo, ...(target.returnState !== undefined ? { state: target.returnState } : {}) };
}
