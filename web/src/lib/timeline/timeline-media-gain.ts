type Graph = { source: MediaElementAudioSourceNode; gain: GainNode; connected: boolean };

/** A media element may be bound to createMediaElementSource only once, including StrictMode remounts. */
export class TimelineMediaGain {
    private context?: AudioContext;
    private readonly graphs = new WeakMap<HTMLMediaElement, Graph>();

    constructor(private readonly createContext: () => AudioContext = () => new AudioContext()) {}

    apply(media: HTMLMediaElement, volume: number) {
        if (!Number.isFinite(volume) || volume < 0) throw new Error('时间线音量无效');
        let graph = this.graphs.get(media);
        if (!graph && volume <= 1) {
            media.volume = volume;
            return;
        }
        if (!graph) {
            // Web Audio rejects non-CORS remote media by producing silence. Require the caller to
            // select anonymous CORS before loading amplified sources, not after decoding them.
            if (media.crossOrigin !== 'anonymous') throw new Error('放大音量需要支持跨域读取的媒体来源');
            this.context ??= this.createContext();
            const gain = this.context.createGain();
            const source = this.context.createMediaElementSource(media);
            graph = { source, gain, connected: false };
            this.graphs.set(media, graph);
        }
        if (!graph.connected) {
            graph.source.connect(graph.gain);
            graph.gain.connect(this.context!.destination);
            graph.connected = true;
        }
        graph.gain.gain.value = volume;
        media.volume = 1;
    }

    async resume(media: HTMLMediaElement) {
        if (this.graphs.has(media) && this.context?.state !== 'running') await this.context?.resume();
    }

    release(media: HTMLMediaElement) {
        const graph = this.graphs.get(media);
        if (!graph?.connected) return;
        graph.source.disconnect();
        graph.gain.disconnect();
        graph.connected = false;
    }
}

export const timelineMediaGain = new TimelineMediaGain();
