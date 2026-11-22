import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { buildTimelineFromNodes, resolveTimelineSourceDurationMs } from "../src/lib/timeline/timeline-build";
import { findNearestAvailablePlacement } from "../src/lib/timeline/timeline-placement";
import { DEFAULT_AUDIO_TRACK_ID, DEFAULT_VIDEO_TRACK_ID } from "../src/lib/timeline/timeline-tracks";
import type { TimelineDirectMedia, TimelineProject } from "../src/types/timeline";

const source = readFileSync(new URL("../src/components/canvas/canvas-timeline-dialog.tsx", import.meta.url), "utf8");
const section = (start: string, end: string) => source.slice(source.indexOf(start), source.indexOf(end, source.indexOf(start)));
const handlers = new Bun.Transpiler({ loader: "tsx" }).transformSync([
    section("    const applyDraft =", "    const updateClip ="),
    section("    const enqueueMediaAddition =", "    const addNodeToTimeline ="),
    section("    const addDirectMediaToTimeline =", "    // 把“直连媒体入轨”"),
].join("\n"));

function harness(probe: (url: string, kind: string, signal: AbortSignal) => Promise<number | undefined>) {
    let timeline = buildTimelineFromNodes([]);
    const before = JSON.stringify(timeline);
    const controller = new AbortController();
    const batch = { controller, queue: Promise.resolve(), pending: 0 };
    const mediaAdditionRef = { current: batch };
    const errors: string[] = [];
    const busy: boolean[] = [];
    const run = new Function("deps", `const {draft, setDraft, mediaAdditionRef, setAddingMedia, message,
        resolveTimelineSourceDurationMs, resolveMediaUrl, probeMediaDurationUrlMs, findNearestAvailablePlacement,
        DEFAULT_AUDIO_TRACK_ID, DEFAULT_VIDEO_TRACK_ID} = deps;
        const playheadMs=0, initializing=false, initializationError="";
        const savingRef={current:false}, exportBusyRef={current:false}, draftDirtyRef={current:false};
        const t=(key,params)=>params?.name || key, setSelectedClipId=()=>{};
        ${handlers}; return addDirectMediaToTimeline;`)( {
        draft: timeline,
        setDraft: (update: (current: TimelineProject) => TimelineProject) => { timeline = update(timeline); },
        mediaAdditionRef,
        setAddingMedia: (value: boolean) => busy.push(value),
        message: { error: (value: string) => errors.push(value), success: () => {}, warning: () => {}, info: () => {} },
        resolveTimelineSourceDurationMs,
        resolveMediaUrl: async (_key: string, url: string) => url,
        probeMediaDurationUrlMs: probe,
        findNearestAvailablePlacement,
        DEFAULT_AUDIO_TRACK_ID, DEFAULT_VIDEO_TRACK_ID,
    }) as (media: TimelineDirectMedia) => void;
    return { run, controller, batch, errors, busy, get timeline() { return timeline; }, before };
}

const media = (id: string, kind: "video" | "audio" = "video") => ({ id, title: id, kind, url: id });

test("queued direct media retain selection order and never overlap after async duration reads", async () => {
    const h = harness(async url => url === "first" ? 4042 : 7001);
    const inputs = [media("first"), media("second")];
    const before = JSON.stringify(inputs);
    inputs.forEach(h.run);
    expect(h.batch.pending).toBe(2);
    await h.batch.queue;
    expect(h.timeline.clips.map(c => [c.title, c.startMs, c.durationMs, c.sourceDurationMs])).toEqual([
        ["first", 0, 4042, 4042], ["second", 4042, 7001, 7001],
    ]);
    expect(JSON.stringify(inputs)).toBe(before);
    expect(h.batch.pending).toBe(0);
    expect(h.busy.at(-1)).toBe(false);
});

test("a failed direct source adds no clip and does not discard the next valid source", async () => {
    const h = harness(async url => url === "missing" ? undefined : 5333);
    h.run(media("missing")); h.run(media("available"));
    await h.batch.queue;
    expect(h.errors).toEqual(["missing"]);
    expect(h.timeline.clips.map(c => [c.title, c.startMs, c.durationMs])).toEqual([["available", 0, 5333]]);
});

test("closing during a read prevents late inserts and stops queued sources", async () => {
    let finish!: (value: number) => void;
    let reads = 0;
    const h = harness(async () => { reads++; return new Promise(resolve => { finish = resolve; }); });
    h.run(media("pending")); h.run(media("queued"));
    await Promise.resolve(); await Promise.resolve();
    h.controller.abort(); finish(9000);
    await h.batch.queue;
    expect(reads).toBe(1);
    expect(JSON.stringify(h.timeline)).toBe(h.before);
    expect(h.errors).toEqual([]);
});

test("direct audio uses the audio decoder and original track with full measured duration", async () => {
    const kinds: string[] = [];
    const h = harness(async (_url, kind) => { kinds.push(kind); return 13579; });
    h.run(media("voice", "audio"));
    await h.batch.queue;
    expect(kinds).toEqual(["audio"]);
    expect(h.timeline.clips[0]).toMatchObject({ kind: "audio", trackId: DEFAULT_AUDIO_TRACK_ID, durationMs: 13579, sourceDurationMs: 13579, volume: 1 });
});
