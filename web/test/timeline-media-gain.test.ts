import { expect, test } from 'bun:test';
import { TimelineMediaGain } from '../src/lib/timeline/timeline-media-gain';
import { timelineAudioPlayback } from '../src/lib/timeline/timeline-audio';

test('amplified gain survives fade and is not clamped at the transport layer', () => {
    const clip = { id: 'a', nodeId: 'a', kind: 'audio' as const, trackId: 'a', startMs: 0, durationMs: 1000, volume: 3.4, fadeInMs: 200 };
    expect(timelineAudioPlayback(clip, 100, true, false).volume).toBe(1.7);
    expect(timelineAudioPlayback(clip, 300, true, false).volume).toBe(3.4);
});

test('gain graph is reused after cleanup, lowering volume and zero remain exact', async () => {
    let created = 0, connected = 0, disconnected = 0, resumed = 0;
    const gain = { gain: { value: 1 }, connect: () => connected++, disconnect: () => disconnected++ };
    const context = { state: 'suspended', destination: {}, createGain: () => gain,
        createMediaElementSource: () => { created++; return { connect: () => connected++, disconnect: () => disconnected++ }; },
        resume: async () => { resumed++; context.state = 'running'; } };
    const transport = new TimelineMediaGain(() => context as unknown as AudioContext);
    const media = { volume: 1, crossOrigin: 'anonymous' } as HTMLMediaElement;
    transport.apply(media, 0.5);
    expect(created).toBe(0);
    expect(media.volume).toBe(0.5);
    transport.apply(media, 3.4);
    await transport.resume(media);
    expect(media.volume).toBe(1);
    expect(gain.gain.value).toBe(3.4);
    expect(resumed).toBe(1);
    transport.apply(media, 0);
    expect(gain.gain.value).toBe(0);
    transport.release(media);
    transport.release(media);
    expect(disconnected).toBe(2);
    transport.apply(media, 0.5);
    expect(created).toBe(1);
    expect(connected).toBe(4);
    expect(gain.gain.value).toBe(0.5);
    expect(() => transport.apply(media, NaN)).toThrow();
    expect(() => transport.apply({ crossOrigin: null } as HTMLMediaElement, 2)).toThrow('跨域');
});
