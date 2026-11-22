import { expect, test } from 'bun:test';
import { parseTimelineMediaProbe } from '../src/lib/timeline/timeline-media-probe';

const audio = { streams: [{ index: 0, codec_type: 'audio' }], format: { format_name: 'wav', nb_streams: 1 } };
test('WASM core 0.12.10 sentinel requires complete fresh probe evidence', () => {
    expect(parseTimelineMediaProbe(-1, JSON.stringify(audio))).toBe(true);
    expect(parseTimelineMediaProbe(0, JSON.stringify(audio))).toBe(true);
    expect(parseTimelineMediaProbe(-1, JSON.stringify({ streams: [{ index: 0, codec_type: 'video' }], format: { format_name: 'mov,mp4', nb_streams: 1 } }))).toBe(false);
});
test('probe failures and incomplete output never turn into a silent-video assumption', () => {
    for (const [code, result] of [
        [1, audio], [-1, {}], [-1, { streams: [] }],
        [-1, { ...audio, error: { code: -1 } }],
        [-1, { ...audio, streams: [] }], [-1, { ...audio, streams: [{ index: 0 }] }],
    ] as const) expect(() => parseTimelineMediaProbe(code, JSON.stringify(result))).toThrow();
    expect(() => parseTimelineMediaProbe(-1, '{')).toThrow();
});
