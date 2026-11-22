import { expect, test } from 'bun:test';
import { extractLtvVideoClipTimelines } from '../src/lib/canvas/ltv-video-clip';
import { normalizeTimelineProject } from '../src/lib/timeline/timeline-tracks';
import { patchTimelineClip } from '../src/lib/timeline/linked-timeline-audio';
import { splitTimelineClip } from '../src/lib/timeline/split-timeline-clip';
import { createEditorCommandRegistry } from '../src/lib/timeline/editor-commands';

function source() {
    return {nodes:[{id:'v',type:'video'},{id:'a',type:'audio'},
        {id:'edit',type:'video-clip',data:{clipTimelineData:{videoTrackCount:1,totalDuration:7,clips:[
            {id:'v1',sourceNodeId:'v',type:'video',startTime:2,duration:5,sourceOffset:1,sourceDuration:9},
            {id:'a1',sourceNodeId:'a',type:'audio',startTime:0,duration:3,sourceOffset:1,sourceDuration:6,zIndex:1,linkedVideoClipId:'v1'},
        ]}}}]};
}

test('import namespaces clip linkage and restores source alignment without altering audio trims', () => {
    const snapshot = source(), before = JSON.stringify(snapshot);
    const result = extractLtvVideoClipTimelines(snapshot)[0];
    expect(result.issues).toEqual([]);
    const timeline = result.timeline!;
    expect(timeline.clips[1]).toMatchObject({linkedVideoClipId:'edit::clip::v1',startMs:2000,durationMs:3000,sourceStartMs:1000,sourceDurationMs:6000});
    const reopened = normalizeTimelineProject(JSON.parse(JSON.stringify(timeline)));
    expect(reopened.clips).toEqual(timeline.clips);
    expect(JSON.stringify(snapshot)).toBe(before);
});

test('reopening follows the current linked video but explicit trim and split unlink audio', () => {
    const timeline = extractLtvVideoClipTimelines(source())[0].timeline!;
    timeline.clips[0] = {...timeline.clips[0],startMs:3000};
    const reopened = normalizeTimelineProject(timeline);
    expect(reopened.clips[1].startMs).toBe(3000);
    const audio = reopened.clips[1];
    expect(patchTimelineClip(audio,{volume:0.4}).linkedVideoClipId).toBe(audio.linkedVideoClipId);
    expect(patchTimelineClip(audio,{durationMs:2000}).linkedVideoClipId).toBeUndefined();
    expect(patchTimelineClip(audio,{sourceStartMs:1500}).linkedVideoClipId).toBeUndefined();
    const parts = splitTimelineClip(audio,4000,{left:'a',right:'b'});
    expect(parts.every(clip=>clip.linkedVideoClipId===undefined)).toBe(true);
    expect(parts.map(clip=>clip.sourceStartMs)).toEqual([1000,2000]);
    expect(audio.linkedVideoClipId).toBe('edit::clip::v1');
});

test('missing video link is preserved without inventing media or moving audio', () => {
    const snapshot = source();
    snapshot.nodes[2].data!.clipTimelineData.clips[1].linkedVideoClipId='missing';
    const result = extractLtvVideoClipTimelines(snapshot)[0];
    expect(result.issues).toEqual([]);
    expect(result.timeline!.clips[1]).toMatchObject({startMs:0,linkedVideoClipId:'edit::clip::missing'});
});

test('command trim and split unlink while undo snapshot retains the relationship', () => {
    const timeline = extractLtvVideoClipTimelines(source())[0].timeline!;
    const before=JSON.stringify(timeline), audio=timeline.clips[1];
    const registry=createEditorCommandRegistry();
    const trimmed=registry.apply(timeline,{op:'trimClip',payload:{id:audio.id,durationMs:2000}});
    expect(trimmed.clips[1].linkedVideoClipId).toBeUndefined();
    const split=registry.apply(timeline,{op:'splitClip',payload:{id:audio.id,splitAtMs:3000}});
    expect(split.clips.filter(clip=>clip.kind==='audio').every(clip=>clip.linkedVideoClipId===undefined)).toBe(true);
    expect(JSON.stringify(timeline)).toBe(before);
    expect(normalizeTimelineProject(JSON.parse(before)).clips[1].linkedVideoClipId).toBe(audio.linkedVideoClipId);
});

test('invalid links and overlaps introduced by source restoration still fail closed', () => {
    const invalid = source();
    invalid.nodes[2].data!.clipTimelineData.clips[0].linkedVideoClipId='v1';
    expect(extractLtvVideoClipTimelines(invalid)[0].issues[0].detail).toContain('关联视频');
    const overlap = source();
    const clips=overlap.nodes[2].data!.clipTimelineData.clips;
    clips.push({...clips[1],id:'a2',startTime:6,duration:1});
    expect(extractLtvVideoClipTimelines(overlap)[0].issues[0].detail).toContain('重叠');
});
