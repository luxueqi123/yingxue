import overrides from "./yingxue-cover-overrides.json";

const covers: Readonly<Record<string, string>> = overrides;
export function yingxueCover(id: string, fallback: string): string {
    return covers[id] || fallback;
}

// Apply after source metadata validation so the source record stays auditable.
export function withYingxueCover<T extends { id: string; cover?: string; localCover?: string }>(item: T): T {
    const cover = covers[item.id];
    return cover ? { ...item, cover, localCover: cover } : item;
}
