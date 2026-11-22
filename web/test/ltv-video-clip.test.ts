import { expect, test } from 'bun:test';
import { extractLtvVideoClipTimelines } from '../src/lib/canvas/ltv-video-clip';
import { buildTimelineRenderPlan } from '../src/lib/timeline/timeline-to-ffmpeg';
import { adaptLtvNativeProject } from '../src/lib/canvas/ltv-native-project';
import { assertCanvasGenerationRequirements } from '../src/lib/canvas/canvas-project-generation';
import { defaultConfig } from '../src/stores/use-config-store';
import { isolateCopiedNodeMetadata } from '../src/lib/canvas/canvas-node-copy';

function fixture() {
    return { edges: [], nodes: [
        { id: 'video', type: 'video', data: { name: '原视频' } },
        { id: 'audio', type: 'audio', data: { name: '独立音频' } },
        { id: 'edit', type: 'video-clip', data: { clipTimelineData: {
            clips: [
                { sourceNodeId: 'video', startTime: 0, duration: 2, sourceOffset: 0.5, sourceDuration: 5 },
                { sourceNodeId: 'video', startTime: 3, duration: 1, sourceOffset: 3, sourceDuration: 5 },
                { sourceNodeId: 'audio', type: 'audio', startTime: 1, duration: 3, sourceOffset: 2, sourceDuration: 7, decibel: -20 },
            ], totalDuration: 4, videoAudioVolume: 0.5, audioTrackVolume: 1,
        } } },
    ] };
}

function timelineOf(snapshot: ReturnType<typeof fixture>) {
    const result = extractLtvVideoClipTimelines(snapshot);
    expect(result[0].issues).toEqual([]);
    return result[0].timeline!;
}

test('preserves source crop, timeline gaps, repeated source references and independent audio', () => {
    const snapshot = fixture();
    const before = JSON.stringify(snapshot);
    const timeline = timelineOf(snapshot);
    expect(timeline.version).toBe(2);
    expect(timeline.durationMs).toBe(4000);
    expect(timeline.tracks.map(track => track.kind)).toEqual(['video', 'audio']);
    expect(timeline.clips.map(clip => [clip.startMs, clip.durationMs, clip.sourceStartMs, clip.volume])).toEqual([
        [0, 2000, 500, 0.5], [3000, 1000, 3000, 0.5], [1000, 3000, 2000, 0.1],
    ]);
    const plan = buildTimelineRenderPlan(timeline, [
        { nodeId: 'video', fileName: 'video.mp4', durationMs: 5000, hasAudio: true },
        { nodeId: 'audio', fileName: 'audio.wav', durationMs: 7000, hasAudio: true },
    ]);
    expect(plan.steps.some(step => step.kind === 'gap')).toBe(true);
    expect(plan.steps.some(step => step.kind === 'mix')).toBe(true);
    expect(JSON.stringify(plan)).toContain('volume=0.1');
    expect(JSON.stringify(snapshot)).toBe(before);
});

test('multiple compositions are retained independently, never chosen or merged', () => {
    const snapshot = fixture();
    snapshot.nodes.push({ ...structuredClone(snapshot.nodes[2]), id: 'second-edit' });
    const candidates = extractLtvVideoClipTimelines(snapshot);
    expect(candidates.map(item => item.ownerNodeId)).toEqual(['edit', 'second-edit']);
    expect(candidates.every(item => item.timeline?.clips.length === 3)).toBe(true);
    expect(new Set(candidates.flatMap(item => item.timeline!.clips.map(clip => clip.id))).size).toBe(6);
});

test('fractional source frames become integer millisecond boundaries without artificial black gaps', () => {
    const snapshot = fixture();
    const source = snapshot.nodes[2].data.clipTimelineData!;
    source.clips = Array.from({ length: 8 }, (_, index) => ({ sourceNodeId: 'video', startTime: index * 5.041667,
        duration: 5.041666666666667, sourceOffset: 0, sourceDuration: 5.041666666666667 }));
    source.totalDuration = 7 * 5.041667 + 5.041666666666667;
    const timeline = timelineOf(snapshot);
    expect(timeline.durationMs).toBe(40333);
    expect(timeline.clips.every(clip => [clip.startMs, clip.durationMs, clip.sourceStartMs, clip.sourceDurationMs].every(Number.isSafeInteger))).toBe(true);
    const plan = buildTimelineRenderPlan(timeline, [{ nodeId: 'video', fileName: 'source.mp4', durationMs: 5042, hasAudio: true }]);
    expect(plan.steps.filter(step => step.kind === 'gap')).toHaveLength(0);
    expect(plan.steps.filter(step => step.kind === 'trim')).toHaveLength(8);
});

test('fractional tail trim fits source bounds without changing timeline boundaries', () => {
    const snapshot = fixture();
    const source = snapshot.nodes[2].data.clipTimelineData!;
    source.clips = [{ sourceNodeId: 'video', startTime: 24.7571190845581,
        duration: 3.1633871133786826, sourceOffset: 1.8985630000000029, sourceDuration: 5.061950113378685 }];
    source.totalDuration = source.clips[0].startTime + source.clips[0].duration;
    const clip = timelineOf(snapshot).clips[0];
    expect([clip.startMs, clip.durationMs, clip.sourceStartMs, clip.sourceDurationMs]).toEqual([24757, 3164, 1898, 5062]);
    expect(Math.abs(clip.sourceStartMs - source.clips[0].sourceOffset * 1000)).toBeLessThan(1);
    source.clips[0].sourceOffset += 0.001;
    expect(extractLtvVideoClipTimelines(snapshot)[0].timeline).toBeUndefined();
});

test('mute zone, clamped track gain and per-track mute match inspected source semantics', () => {
    const snapshot = fixture();
    const source = snapshot.nodes[2].data.clipTimelineData!;
    source.audioTrackVolume = 3.98;
    source.clips[2].decibel = -60;
    Object.assign(source, { videoAudioMutedPerTrack: [true] });
    expect(timelineOf(snapshot).clips[2].volume).toBe(0);
    expect(timelineOf(snapshot).tracks[0].muted).toBe(true);
    source.clips[2].decibel = 0;
    expect(timelineOf(snapshot).clips[2].volume).toBe(1);
    Object.assign(source.clips[0], { embedAudioMuted: true });
    expect(timelineOf(snapshot).clips[0].volume).toBe(0);
    Object.assign(source, { videoAudioMuted: true, videoAudioMutedPerTrack: [false] });
    expect(timelineOf(snapshot).tracks[0].muted).toBe(false);
    Object.assign(source, { videoAudioMutedPerTrack: [] });
    expect(timelineOf(snapshot).tracks[0].muted).toBe(true);
});

test('saved duration shorter than clips expands to the clip end like source restoration', () => {
    const snapshot = fixture();
    const source = snapshot.nodes[2].data.clipTimelineData!;
    source.totalDuration = 2;
    const before = JSON.stringify(snapshot);
    const timeline = timelineOf(snapshot);
    expect(timeline.durationMs).toBe(4000);
    expect(timeline.clips.map(clip => [clip.startMs, clip.durationMs])).toEqual([[0, 2000], [3000, 1000], [1000, 3000]]);
    expect(JSON.stringify(snapshot)).toBe(before);
    source.totalDuration = -1;
    expect(extractLtvVideoClipTimelines(snapshot)[0].timeline).toBeUndefined();
});

test('lossy or malformed contracts fail without returning a partial timeline', () => {
    const mutations: ((source: any, snapshot: ReturnType<typeof fixture>) => void)[] = [
        source => { source.exportRange = { start: 1, end: 2 }; },
        source => { source.clips[0].speed = 2; },
        source => { source.clips[0].transform = [[2, 0, 0], [0, 1, 0]]; },
        source => { source.clips[0].role = 'overlay'; },
        source => { source.clips[0].transition = 'crossfade'; },
        source => { source.clips[2].decibel = 12; },
        source => { source.clips[1].startTime = 1; },
        source => { source.clips[0].sourceOffset = 4; },
        source => { source.clips[0].sourceNodeId = 'missing'; },
        source => { source.clips[0].type = 'audio'; },
        source => { source.clips[0].duration = Infinity; },
        source => { source.totalDuration = 100; },
        source => { source.clips[0].id = 'same'; source.clips[1].id = 'same'; },
        source => { source.videoAudioMuted = 'false'; },
        source => { source.audioTrackMutedPerTrack = [0]; },
        source => { source.clips[0].zIndex = 0.5; },
        source => { source.clips.push({ ...source.clips[2] }); },
        (_, snapshot) => { snapshot.nodes.push(structuredClone(snapshot.nodes[0])); },
        (_, snapshot) => { delete snapshot.nodes[2].data.clipTimelineData; },
    ];
    for (const mutate of mutations) {
        const snapshot = fixture();
        mutate(snapshot.nodes[2].data.clipTimelineData, snapshot);
        const candidate = extractLtvVideoClipTimelines(snapshot)[0];
        expect(candidate.timeline).toBeUndefined();
        expect(candidate.issues).toHaveLength(1);
    }
});

test('main adapter preserves independently editable compositions and reports missing timelines', () => {
    const snapshot = fixture();
    for(const node of snapshot.nodes)Object.assign(node,{position:{x:0,y:0},width:320,height:180});
    Object.assign(snapshot.nodes[0].data,{action:'video_resource',url:['https://example.test/video.mp4']});
    Object.assign(snapshot.nodes[1].data,{action:'audio_resource',url:['https://example.test/audio.wav']});
    const result = adaptLtvNativeProject(snapshot, { channels: [] }, 'case', '剪辑工程');
    expect(result.issues).toEqual([]);
    expect(result.adoptable).toBe(true);
    expect(result.project.nodes.find(node=>node.id==='edit')?.metadata?.timelineComposition?.clips).toHaveLength(3);
    expect('timeline' in result.project).toBe(false);
    const owner=result.project.nodes.find(node=>node.id==='edit')!;
    expect(()=>assertCanvasGenerationRequirements(defaultConfig,owner,'video')).toThrow('独立剪辑');
    const copied=isolateCopiedNodeMetadata(owner,new Map([['video','copied-video']]));
    expect(copied.timelineComposition!.clips[0].nodeId).toBe('copied-video');
    expect(copied.timelineComposition!.clips[2].nodeId).toBe('audio');
    copied.timelineComposition!.clips[0].volume=0;
    expect(owner.metadata!.timelineComposition!.clips[0].volume).toBe(0.5);
    delete snapshot.nodes[2].data.clipTimelineData;
    const missing = adaptLtvNativeProject(snapshot, { channels: [] }, 'case', '剪辑工程');
    expect(missing.issues.some(issue => issue.nodeId === 'edit' && issue.detail.includes('缺少保存'))).toBe(true);
});

test('saved transient cropRange is cleared like the source editor, never applied as destructive trimming', () => {
    const snapshot=fixture();
    const baseline=timelineOf(snapshot);
    for(const cropRange of [null,{start:1,end:2},{start:40.333333333333336,end:45.375}]){
        Object.assign(snapshot.nodes[2].data.clipTimelineData!,{cropRange});
        expect(timelineOf(snapshot)).toEqual(baseline);
        expect(snapshot.nodes[2].data.clipTimelineData).toHaveProperty('cropRange',cropRange);
    }
});
