import type { ProductionItem } from "../services/production-library";
import { isCasePublic } from "./case-publication-policy";
import { creationDisplayOrder } from "./featured-creation-order";

// These are related shots, not identical projects. Keep each workflow in the detail selector.
export const inspirationSeries = [
    ["native-lux-3fo4k4vy4lgk", "native-lux-3fo4k4vy4i4j", "native-lux-3fo4k4vy4s5m"],
    ["native-lux-3fo4k4vy536p", "native-lux-3fo4k4vy56iq", "native-lux-3fo4k4vy6sd8", "native-lux-3fo4k4vy73eb", "native-lux-3fo4k4vy7grf"],
    ["native-lux-3fo4k4vy4vhn", "native-lux-3fo4k4vy6vp9", "native-lux-3fo4k4vy76qc"],
    ["native-lux-3fo4k4vy64y1", "native-lux-3fo4k4vy7dfe"],
    ["native-lux-3fo4k4vy6f04", "native-lux-3fo4k4vy61m0", "native-lux-3fo4k4vy6ic5", "native-lux-3fo4k4vy8buo"],
] as const;

export type InspirationGroup = { item: ProductionItem; variants: ProductionItem[] };

function mediaIdentity(value?: string) {
    if (!value) return "";
    try {
        const url = new URL(value, "https://local.invalid");
        for (const key of [...url.searchParams.keys()]) {
            if (/^(token|expires?|signature|x-amz-.+|x-oss-.+)$/i.test(key)) url.searchParams.delete(key);
        }
        url.hash = "";
        url.searchParams.sort();
        return url.href;
    } catch { return value; }
}

export function curateInspirationCases(items: readonly ProductionItem[]): InspirationGroup[] {
    const series = new Map<string, string>();
    inspirationSeries.forEach(group => group.forEach(id => series.set(id, group[0])));
    // Keep source rank intact; explicit editorial picks only change display order.
    const ordered = items.filter(item => item.kind === "case" && isCasePublic(item)).slice().sort((a, b) =>
        creationDisplayOrder(a.id) - creationDisplayOrder(b.id) || (a.sourceRank ?? Infinity) - (b.sourceRank ?? Infinity));
    const groups: InspirationGroup[] = [];
    const owners = new Map<string, InspirationGroup>();
    for (const item of ordered) {
        const keys = [`id:${item.id}`];
        const family = series.get(item.id);
        if (family) keys.push(`series:${family}`);
        if (item.localMediaInfo?.sha256) keys.push(`sha256:${item.localMediaInfo.sha256}`);
        for (const media of [item.media, item.localMedia]) if (media) keys.push(`media:${mediaIdentity(media)}`);
        const matches = [...new Set(keys.map(key => owners.get(key)).filter((value): value is InspirationGroup => Boolean(value)))];
        const group = matches[0] || { item, variants: [] };
        if (!matches.length) groups.push(group);
        for (const duplicate of matches.slice(1)) {
            group.variants.push(...duplicate.variants.filter(value => !group.variants.some(existing => existing.id === value.id)));
            groups.splice(groups.indexOf(duplicate), 1);
            for (const [key, owner] of owners) if (owner === duplicate) owners.set(key, group);
        }
        if (!group.variants.some(value => value.id === item.id)) group.variants.push(item);
        keys.forEach(key => owners.set(key, group));
    }
    return groups;
}
