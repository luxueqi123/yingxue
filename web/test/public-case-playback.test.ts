import { expect, test } from "bun:test";
import works from "../src/lib/entry-showcase-work-data.json";
import playback from "../src/lib/published-case-playback.json";
import { publicCasePlaybackURL } from "../src/lib/public-case-playback";

test("all published films play directly from their verified public object without changing canonical metadata", () => {
    expect(works.works).toHaveLength(200);
    expect(Object.keys(playback)).toHaveLength(200);
    for (const work of works.works) {
        const target = new URL(publicCasePlaybackURL(work.src)!);
        expect(target.origin).toBe("https://img.tianyayingxue.cn");
        if (work.id === "2218cb4006b441e5b87aa7402c80080b") {
            expect(target.pathname).toMatch(/^\/yingxue-published-cases\/v1\/faststart\/[a-f0-9]{64}\.mp4$/);
            expect(target.searchParams.get("delivery")).toBe("20261104");
        } else {
            expect(target.pathname).toBe(`/yingxue-published-cases/v1${work.src}`);
            expect(target.searchParams.get("delivery")).toBe("20261103");
        }
    }
});

test("private, unverified and unrelated media never acquire a public storage URL", () => {
    for (const source of [undefined, "", "/api/resources/private/file", "/production-library/case-media/unknown.mp4", "https://source.invalid/original.mp4", "__proto__", "toString"])
        expect(publicCasePlaybackURL(source)).toBe(source);
});
