import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import support from "../src/lib/production-case-support.json";
import { loadProductionCaseProject } from "../src/services/production-case-project";
import { isCaseWithdrawn } from "../src/lib/case-publication-policy";
import type { TimelineProject } from "../src/types/timeline";
import { parseCanvasStorageDocument, serializeCanvasStorageDocument } from "../src/lib/canvas/canvas-storage-revision";
import { canvasContentHash } from "../src/lib/canvas/canvas-content";
import type { CanvasProject } from "../src/stores/canvas/use-canvas-store";
import { normalizeTimelineProject } from "../src/lib/timeline/timeline-tracks";

const timeline = (): TimelineProject => ({
    version: 2,
    tracks: [{ id: "video-1", kind: "video", label: "原片", order: 0, muted: true, locked: true }],
    clips: [
        { id: "cut-a", kind: "video", nodeId: "source-a", trackId: "video-1", startMs: 0, durationMs: 1250, sourceStartMs: 500, sourceDurationMs: 3000, volume: 0.4 },
        { id: "cut-b", kind: "video", nodeId: "source-a", trackId: "video-1", startMs: 1500, durationMs: 750, sourceStartMs: 2000, sourceDurationMs: 3000 },
    ],
    durationMs: 2250,
});

async function withSnapshot(value: unknown, check: (id: string) => Promise<void>, composition?: TimelineProject, audio = false) {
    const entry = support.find(item => !isCaseWithdrawn(item.id))!;
    const previousEntry = { ...entry };
    const previousFetch = globalThis.fetch;
    const bytes = JSON.stringify({ version: 1, id: entry.id, title: "原生剪辑", nodes: [
        { id: "source-a", type: "video", title: "Source A", position: { x: 0, y: 0 }, width: 320, height: 180, metadata: { content: "https://example.test/a.mp4" } },
        ...(composition ? [{ id: "composition", type: "video", title: "独立剪辑", position: { x: 400, y: 0 }, width: 320, height: 180, metadata: { timelineComposition: composition } }] : []),
        ...(audio ? [{ id: "source-audio", type: "audio", title: "Audio", position: { x: 0, y: 300 }, width: 320, height: 80, metadata: {} }] : []),
    ], connections: [], timeline: value });
    Object.assign(entry, { nodeCount: (composition ? 2 : 1) + Number(audio), connectionCount: 0, sha256: createHash("sha256").update(bytes).digest("hex") });
    globalThis.fetch = (async () => new Response(bytes)) as typeof fetch;
    try { await check(entry.id); }
    finally { Object.assign(entry, previousEntry); globalThis.fetch = previousFetch; }
}

describe("案例时间线加载与复制", () => {
    for (const nested of [false, true]) test(`关联音频随${nested ? '独立剪辑' : '项目时间线'}复制重映射目标，保留裁切和缺失关联`, async () => {
        const source=timeline();
        source.tracks.push({id:'audio-1',kind:'audio',label:'音频',order:1});
        source.clips.push({id:'audio-cut',kind:'audio',nodeId:'source-audio',trackId:'audio-1',startMs:0,durationMs:1000,sourceStartMs:500,sourceDurationMs:3000,linkedVideoClipId:'cut-a'});
        source.clips.push({...source.clips[2],id:'orphan-audio',startMs:1250,linkedVideoClipId:'missing-video'});
        const before=JSON.stringify(source);
        await withSnapshot(nested?undefined:source,async id=>{
            const get=(project:Awaited<ReturnType<typeof loadProductionCaseProject>>)=>nested?project.nodes.find(n=>n.title==='独立剪辑')!.metadata!.timelineComposition!:project.timeline!;
            expect(get(await loadProductionCaseProject(id,{mode:'preview'}))).toEqual(source);
            const copied=get(await loadProductionCaseProject(id));
            expect(copied.clips[2].linkedVideoClipId).toBe(copied.clips[0].id);
            expect(copied.clips[2].linkedVideoClipId).not.toBe('cut-a');
            expect(copied.clips[2]).toMatchObject({durationMs:1000,sourceStartMs:500,sourceDurationMs:3000});
            expect(copied.clips[3].linkedVideoClipId).toBe('missing-video');
            copied.clips[0].startMs=500;
            expect(normalizeTimelineProject(JSON.parse(JSON.stringify(copied))).clips[2].startMs).toBe(500);
        },nested?source:undefined,true);
        expect(JSON.stringify(source)).toBe(before);
    });
    test("独立剪辑在复制和存储中保留归属并重映射素材，不覆盖项目时间线", async () => {
        const nested=timeline();
        await withSnapshot(undefined,async id=>{
            const copied=await loadProductionCaseProject(id);
            expect(copied.timeline).toBeUndefined();
            const composition=copied.nodes.find(node=>node.title==='独立剪辑')!;
            expect(composition.metadata?.timelineComposition?.clips.every(clip=>clip.nodeId===copied.nodes[0].id)).toBe(true);
            expect(composition.metadata?.timelineComposition?.clips[0].id).not.toBe(nested.clips[0].id);
            const project={...copied,id:'nested',createdAt:'now',updatedAt:'now',chatSessions:[],activeChatId:null,viewport:{x:0,y:0,k:1},directorScenes:[]} as unknown as CanvasProject;
            const restored=parseCanvasStorageDocument(serializeCanvasStorageDocument(parseCanvasStorageDocument(null,[project]))).state.projects[0];
            expect(restored.nodes[1].metadata?.timelineComposition).toEqual(composition.metadata?.timelineComposition);
            const edited=structuredClone(restored);
            edited.nodes[1].metadata!.timelineComposition!.clips[0].volume=0;
            expect(await canvasContentHash(edited)).not.toBe(await canvasContentHash(restored));
        },nested);
        nested.clips[0].nodeId='missing';
        await withSnapshot(undefined,async id=>expect(loadProductionCaseProject(id)).rejects.toThrow('时间线合同'),nested);
    });
    test("预览保留剪辑；复制重映射节点和片段，保留项目内轨道标识、裁切和轨道状态", async () => {
        const source = timeline();
        await withSnapshot(source, async id => {
            const preview = await loadProductionCaseProject(id, { mode: "preview" });
            expect(preview.timeline).toEqual(source);
            const copy = await loadProductionCaseProject(id);
            expect(copy.timeline?.clips).toHaveLength(2);
            expect(copy.timeline?.durationMs).toBe(2250);
            expect(normalizeTimelineProject(copy.timeline).tracks).toHaveLength(3);
            expect(copy.timeline?.tracks[0]).toMatchObject({ label: "原片", muted: true, locked: true });
            expect(copy.timeline?.tracks[0].id).toBe("video-1");
            for (const [index, clip] of copy.timeline!.clips.entries()) {
                expect(clip.id).not.toBe(source.clips[index].id);
                expect(clip.nodeId).toBe(copy.nodes[0].id);
                expect(clip.trackId).toBe(copy.timeline!.tracks[0].id);
                expect({ ...clip, id: source.clips[index].id, nodeId: "source-a", trackId: "video-1" }).toEqual(source.clips[index]);
            }
            expect(new Set(copy.timeline!.clips.map(clip => clip.id)).size).toBe(2);
        });
    });

    test("旧工程没有时间线时不自动捏造剪辑", async () => {
        await withSnapshot(undefined, async id => expect((await loadProductionCaseProject(id)).timeline).toBeUndefined());
    });

    test("复制结果通过原生持久化编解码保留裁切，时间线编辑改变同步内容哈希", async () => {
        await withSnapshot(timeline(), async id => {
            const copied = await loadProductionCaseProject(id);
            const project: CanvasProject = {
                ...copied, id: "copied-project", createdAt: "2026-09-29T00:00:00Z", updatedAt: "2026-09-29T00:00:00Z",
                chatSessions: [], activeChatId: null, backgroundMode: "dots", showImageInfo: false,
                viewport: { x: 0, y: 0, k: 1 }, directorScenes: [],
            };
            const document = parseCanvasStorageDocument(null, [project]);
            const restored = parseCanvasStorageDocument(serializeCanvasStorageDocument(document)).state.projects[0];
            expect(restored.timeline).toEqual(copied.timeline);
            expect(restored.timeline!.clips.every(clip => restored.nodes.some(node => node.id === clip.nodeId))).toBe(true);
            const edited = { ...restored, timeline: { ...restored.timeline!, tracks: restored.timeline!.tracks.map(track => ({ ...track, muted: false })) } };
            expect(await canvasContentHash(edited)).not.toBe(await canvasContentHash(restored));
        });
    });

    for (const [name, mutate] of [
        ["孤立源节点", (v: any) => { v.clips[0].nodeId = "missing"; }],
        ["孤立轨道", (v: any) => { v.clips[0].trackId = "missing"; }],
        ["重复片段标识", (v: any) => { v.clips[1].id = v.clips[0].id; }],
        ["重复轨道标识", (v: any) => { v.tracks.push({ ...v.tracks[0] }); }],
        ["错误媒体类型", (v: any) => { v.clips[0].kind = "audio"; }],
        ["轨道与片段一致但源节点类型错误", (v: any) => { v.tracks[0].kind = "audio"; v.clips.forEach((clip: any) => { clip.kind = "audio"; }); }],
        ["负裁切起点", (v: any) => { v.clips[0].sourceStartMs = -1; }],
        ["越界裁切", (v: any) => { v.clips[0].sourceStartMs = 2900; }],
        ["错误总时长", (v: any) => { v.durationMs = 1000; }],
        ["未物化直连媒体", (v: any) => { v.clips[0].directMedia = { id: "private", kind: "video", title: "Private", url: "blob:old-account" }; }],
        ["未知版本", (v: any) => { v.version = 3; }],
    ] as const) {
        test(`${name}在创建前拒绝，不静默丢失时间线`, async () => {
            const value = timeline(); mutate(value);
            await withSnapshot(value, async id => {
                await expect(loadProductionCaseProject(id)).rejects.toThrow("案例时间线");
            });
        });
    }
});
