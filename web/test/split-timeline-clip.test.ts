import { expect, test } from 'bun:test';
import { splitTimelineClip } from '../src/lib/timeline/split-timeline-clip';
import type { TimelineClip } from '../src/types/timeline';

const clip: TimelineClip = { id:'clip', kind:'video', nodeId:'source', trackId:'video',
    startMs:1000, durationMs:8000, sourceStartMs:2000, sourceDurationMs:10000, volume:0.5 };

test('split preserves full source duration and contiguous trim windows after reopening', () => {
    const before = JSON.stringify(clip);
    const [left, right] = JSON.parse(JSON.stringify(splitTimelineClip(clip, 6000, {left:'left',right:'right'})));
    expect([left.startMs,left.durationMs,left.sourceStartMs,left.sourceDurationMs]).toEqual([1000,5000,2000,10000]);
    expect([right.startMs,right.durationMs,right.sourceStartMs,right.sourceDurationMs]).toEqual([6000,3000,7000,10000]);
    expect(right.sourceStartMs+right.durationMs).toBe(right.sourceDurationMs);
    expect(right.volume).toBe(0.5);
    expect(JSON.stringify(clip)).toBe(before);
});

test('unknown source duration is not invented from a trimmed segment', () => {
    const {sourceDurationMs, ...unknown} = clip;
    const result = splitTimelineClip({...unknown,kind:'audio'},6000,{left:'a',right:'b'});
    expect(result.every(item=>item.sourceDurationMs===undefined)).toBe(true);
    expect(result.map(item=>item.kind)).toEqual(['audio','audio']);
});

test('repeated split preserves absolute source offsets and rejects invalid split points', () => {
    const [,right] = splitTimelineClip(clip,6000,{left:'a',right:'b'});
    const [middle,last] = splitTimelineClip(right,8000,{left:'b',right:'c'});
    expect([middle.sourceStartMs,middle.durationMs,last.sourceStartMs,last.durationMs,last.sourceDurationMs]).toEqual([7000,2000,9000,1000,10000]);
    for (const point of [NaN,Infinity,1000,9000,0]) expect(()=>splitTimelineClip(clip,point,{left:'a',right:'b'})).toThrow();
    expect(()=>splitTimelineClip(clip,6000,{left:'same',right:'same'})).toThrow();
});
