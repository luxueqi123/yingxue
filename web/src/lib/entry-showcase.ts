import { yingxueCover } from "./yingxue-covers";
import showcase from "./entry-showcase-work-data.json";
import { isCasePublic } from "./case-publication-policy";
import { creationDisplayOrder } from "./featured-creation-order";

export type EntryShowcaseWork = { id: string; title: string; poster: string; src: string; author?: string; source?: string; description?: string };
// Generated from the same admitted selection and final-film bindings as the gallery.
export const entryShowcaseWorks: EntryShowcaseWork[] = showcase.works
    .filter(work => isCasePublic({ id: work.id, name: work.title }))
    .sort((a, b) => creationDisplayOrder(a.id) - creationDisplayOrder(b.id))
    .map(work => ({ ...work, poster: yingxueCover(`case-${work.id}`, work.poster) }));
export const SHOWCASE_INTERVAL_MS = 12000;
export const entryShowcaseLanes = [0, 1, 2].map(lane => ({
    label: `精选影像 ${lane + 1}`,
    workIds: entryShowcaseWorks.filter((_, index) => index % 3 === lane).map(work => work.id),
}));
export function showcaseBatch(index: number): EntryShowcaseWork[] {
    const start = ((index * 3 % entryShowcaseWorks.length) + entryShowcaseWorks.length) % entryShowcaseWorks.length;
    return entryShowcaseLanes.map((_, lane) => entryShowcaseWorks[(start + lane) % entryShowcaseWorks.length]);
}
