import thumbnailIndex from "./case-cover-thumbnails.json";

const thumbnails: Readonly<Record<string, { source: string; file: string }>> = thumbnailIndex;

export function caseCoverThumbnail(id: string, source: string | undefined): string | undefined {
    const thumbnail = thumbnails[id];
    if (!thumbnail || thumbnail.source !== source) return undefined;
    return new URL(`../assets/case-covers/${thumbnail.file}`, import.meta.url).href;
}
