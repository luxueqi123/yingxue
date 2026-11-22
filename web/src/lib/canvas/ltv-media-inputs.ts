type Fields = Record<string, unknown>;
const object = (value: unknown): Fields => value && typeof value === 'object' && !Array.isArray(value) ? value as Fields : {};

const httpUrl = (value: Fields) => typeof value._httpUrl === 'string' && /^https?:\/\//i.test(value._httpUrl) ? value._httpUrl : typeof value.url === 'string' && /^https?:\/\//i.test(value.url) ? value.url : undefined;

/** Recover an asset locator only from the same snapshot, same media kind and unique saved identity. */
export function restoreLtvProjectAssetUrls(nodes: Record<string, any>[]): Record<string, any>[] {
    const lists = ['imageList', 'videoList', 'audioList', 'mixedList', 'imageListV2', 'videoListV2', 'audioListV2'];
    const identity = (ref: Fields) => {
        const ids = new Set([ref.assetId, ref.url, ref.nodeId].flatMap(value => {
            if (typeof value !== 'string') return [];
            const id = value.startsWith('asset://') ? value.slice(8) : value;
            return /^asset-[A-Za-z0-9_-]+$/.test(id) ? [id] : [];
        }));
        return ids.size === 1 ? [...ids][0] : undefined;
    };
    const kindOf = (key: string, ref: Fields) => key === 'mixedList' ? String(ref.mediaType ?? 'image') : key.replace(/List(V2)?$/, '');
    const locators = new Map<string, Set<string>>();
    const addLocator = (ref: Fields, kind: string) => {
        const id = identity(ref), url = httpUrl(ref);
        if (!id || !url || !['image', 'video', 'audio'].includes(kind)) return;
        try { if (new URL(url).protocol !== 'https:') return; } catch { return; }
        const mapKey = `${kind}:${id}`;
        const values = locators.get(mapKey) ?? new Set<string>();
        values.add(url);
        locators.set(mapKey, values);
    };
    for (const node of nodes) {
        const data = object(node.data), params = object(data.params);
        const kind = typeof data.type === 'string' ? data.type : node.type;
        // Source ei() pairs these identities with the first selected node URL.
        // Result replacement clears the identity (buildTaskResultUrlPatch), so a
        // retained identity belongs to this saved output, not an arbitrary cover.
        const assetField = kind === 'image' ? 'portraitAssetId' : kind === 'video' ? 'assetVideoAssetId' : kind === 'audio' ? 'assetAudioAssetId' : undefined;
        if (assetField && (!node.type || node.type === kind)) {
            const protectedImage = data.protectionType === 'hidden' || data.protectionType === 'watermark';
            const urls = kind === 'image' && !protectedImage && Array.isArray(data.originalUrl) && data.originalUrl.length ? data.originalUrl : data.url;
            addLocator({ assetId: data[assetField], url: Array.isArray(urls) ? urls[0] : urls }, kind);
        }
        for (const key of lists) for (const raw of Array.isArray(params[key]) ? params[key] as unknown[] : []) {
            const ref = object(raw);
            addLocator(ref, kindOf(key, ref));
        }
    }
    return nodes.map(node => {
        const data = object(node.data), params = object(data.params);
        let changed = false;
        const restored = { ...params };
        for (const key of lists) {
            if (!Array.isArray(params[key])) continue;
            restored[key] = (params[key] as unknown[]).map(raw => {
                const ref = object(raw), id = identity(ref);
                if (!id || typeof ref.url !== 'string' || !ref.url.startsWith('asset://') || httpUrl(ref)) return raw;
                const urls = locators.get(`${kindOf(key, ref)}:${id}`);
                if (urls?.size !== 1) return raw;
                changed = true;
                return { ...ref, _httpUrl: [...urls][0] };
            });
        }
        return changed ? { ...node, data: { ...data, params: restored } } : node;
    });
}

/** Mirrors source buildRequestData's T merge: V2 enriches selected inputs, never adds another input. */
export function restoreLtvMediaMetadata(value: Fields): Fields {
    const result = { ...value };
    for (const kind of ['image', 'video', 'audio']) {
        const key = `${kind}List`, v2Key = `${key}V2`;
        if (!Array.isArray(value[key])) continue;
        const normalize = (raw: unknown): Fields => {
            if (typeof raw === 'string') return { url: raw };
            const ref = object(raw);
            return Array.isArray(ref.url) ? { ...ref, url: ref.url[0] } : { ...ref };
        };
        const saved = Array.isArray(value[v2Key]) ? (value[v2Key] as unknown[]).map(normalize) : [];
        result[key] = (value[key] as unknown[]).map(raw => {
            const ref = normalize(raw);
            const prior = typeof ref.url === 'string' && ref.url ? saved.find(item => item.url === ref.url || item.assetId === ref.url) : undefined;
            const merged = { ...prior, ...ref };
            const actual = httpUrl(ref) ?? (prior ? httpUrl(prior) : undefined);
            if (actual) merged._httpUrl = actual;
            if (merged.durationSec === undefined && merged.duration !== undefined) merged.durationSec = merged.duration;
            return merged;
        });
        // The source recreates these arrays from active selections at submission time.
        delete result[v2Key];
    }
    return result;
}

/** Source getNodeGenerateParams uses mixedList as the authority for mixed2video. */
export function projectLtvMediaInputs(value: Fields, ownerId = ''): Fields {
    if (value.modeType !== 'mixed2video' || !Array.isArray(value.mixedList) || !value.mixedList.length) return value;
    const lists: Record<string, Fields[]> = { image: [], video: [], audio: [] };
    const order = Array.isArray(value.mixedListOrder) ? value.mixedListOrder : [];
    const mixed = value.mixedList.map((raw, index): { ref: Fields; index: number; sourceNodeId: unknown } => {
        const ref = object(raw);
        if (typeof ref.nodeId === 'string' && ref.nodeId) return { ref, index, sourceNodeId: ref.nodeId };
        if (!ownerId) throw new Error('混合上传引用缺少所属节点');
        return { ref: { ...ref, nodeId: `${ownerId}::mixed::${index}` }, index, sourceNodeId: ref.nodeId };
    });
    mixed.sort((a, b) => {
        const ai = order.indexOf(a.ref.nodeId), bi = order.indexOf(b.ref.nodeId);
        return (ai < 0 ? order.length + a.index : ai) - (bi < 0 ? order.length + b.index : bi);
    });
    for (const { ref, sourceNodeId } of mixed) {
        const kind = String(ref.mediaType ?? 'image');
        if (!Object.hasOwn(lists, kind)) throw new Error('混合参考包含未知媒体类型');
        const original = value[`${kind}List`];
        const saved = Array.isArray(original) ? original.map(object).find(item => item.nodeId === sourceNodeId && item.url === ref.url) : undefined;
        lists[kind].push({ ...saved, ...ref });
    }
    const activeIds = new Set(mixed.map(item => item.ref.nodeId));
    const inactiveIds = [...new Set(['imageList','videoList','audioList'].flatMap(key => Array.isArray(value[key]) ? (value[key] as unknown[]).map(raw => object(raw).nodeId).filter((id): id is string => typeof id === 'string' && Boolean(id) && !activeIds.has(id)) : []))];
    return { ...value, imageList: lists.image, videoList: lists.video, audioList: lists.audio, _ltvInactiveReferenceNodeIds: inactiveIds,
        mixedListOrder: mixed.map(item => item.ref.nodeId),
        imageListOrder: lists.image.map(ref => ref.nodeId), videoListOrder: lists.video.map(ref => ref.nodeId), audioListOrder: lists.audio.map(ref => ref.nodeId) };
}
