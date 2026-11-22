export type CreationLaunchMode = "text" | "image" | "video";
export type CreationLaunch = { mode: CreationLaunchMode; prompt: string; skillIds?: string[] };

const PREFIX = "yingxue:creation-launch:";
const MAX_AGE = 30 * 60 * 1000;

/** 登录往返只携带一次性引用，创作正文保留在当前标签页。 */
export function rememberCreationLaunch(input: CreationLaunch, storage: Storage = window.sessionStorage): string {
    const id = crypto.randomUUID();
    storage.setItem(PREFIX + id, JSON.stringify({ ...input, prompt: input.prompt.slice(0, 6000), createdAt: Date.now() }));
    return `/create?launch=${encodeURIComponent(id)}`;
}

export function consumeCreationLaunch(id: string, storage?: Storage): CreationLaunch | null {
    if (!/^[a-f0-9-]{36}$/i.test(id)) return null;
    try {
        const session = storage ?? window.sessionStorage;
        const raw = session.getItem(PREFIX + id);
        session.removeItem(PREFIX + id);
        if (!raw) return null;
        const input: unknown = JSON.parse(raw);
        if (!input || typeof input !== "object") return null;
        const data = input as Record<string, unknown>;
        if (data.mode !== "text" && data.mode !== "image" && data.mode !== "video") return null;
        if (typeof data.prompt !== "string" || data.prompt.length > 6000 || typeof data.createdAt !== "number") return null;
        const age = Date.now() - data.createdAt;
        if (age < 0 || age > MAX_AGE) return null;
        if (data.skillIds !== undefined && (!Array.isArray(data.skillIds) || data.skillIds.length > 8 || !data.skillIds.every(id => typeof id === "string" && /^[a-zA-Z0-9_-]{1,80}$/.test(id)))) return null;
        return { mode: data.mode, prompt: data.prompt, ...(data.skillIds ? { skillIds: data.skillIds as string[] } : {}) };
    } catch {
        return null;
    }
}
