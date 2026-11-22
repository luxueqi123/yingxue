export function parseTimelineMediaProbe(code: number, output: string): boolean {
    // core 0.12.10 leaves ret=-1 after successful ffprobe; accept only complete output,
    // never the sentinel alone. Nonzero real errors and probe error sections still fail.
    if (code !== 0 && code !== -1) throw new Error('媒体音轨探测失败');
    const probe = JSON.parse(output);
    if (!probe || probe.error || !Array.isArray(probe.streams)
        || !probe.format || typeof probe.format.format_name !== 'string' || !probe.format.format_name
        || !Number.isInteger(probe.format.nb_streams) || probe.format.nb_streams <= 0
        || probe.streams.length !== probe.format.nb_streams
        || probe.streams.some((stream: { index?: unknown; codec_type?: unknown } | null) => !stream
            || !Number.isInteger(stream.index) || typeof stream.codec_type !== 'string' || !stream.codec_type)) {
        throw new Error('媒体音轨探测结果无效');
    }
    return probe.streams.some((stream: { codec_type: string }) => stream.codec_type === 'audio');
}
