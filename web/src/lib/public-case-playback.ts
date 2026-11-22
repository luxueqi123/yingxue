import publishedPlayback from "./published-case-playback.json";

const verifiedPlayback: Readonly<Record<string, string>> = publishedPlayback;

/** Only published, hash-verified films bypass the site's redirect gateway. */
export function publicCasePlaybackURL(source: string | undefined): string | undefined {
    return source && Object.hasOwn(verifiedPlayback, source) ? verifiedPlayback[source] : source;
}
