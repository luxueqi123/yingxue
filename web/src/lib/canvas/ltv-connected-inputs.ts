type SourceNode = Record<string, any>;

/** URL-only saved inputs can bind to an existing edge only when one owner has that exact saved version. */
export function findLtvSavedReferenceOwner(nodes: SourceNode[], edges: SourceNode[], targetId: string, kind: string, url: string): string | undefined {
    const incoming = new Set(edges.filter(edge => edge.target === targetId && !edge.data?.portraitVirtual && !edge.data?.assetVirtual).map(edge => edge.source));
    const owners = nodes.filter(node => incoming.has(node.id) && (node.data?.type || node.type) === kind &&
        (typeof node.data?.url === 'string' ? [node.data.url] : Array.isArray(node.data?.url) ? node.data.url : []).includes(url));
    return owners.length === 1 ? owners[0].id : undefined;
}

/** Matches expandGroupSourceNodes: actual parentId children, stored order, exclusions below the root and depth limit eight. */
export function expandLtvGroupInputEdges(nodes: SourceNode[], edges: SourceNode[]) {
    const byId = new Map(nodes.map(node => [node.id, node]));
    const children = new Map<string, SourceNode[]>();
    const groupKinds = new Set(['group', 'video_group', 'video_story']);
    const isGroup = (node?: SourceNode) => Boolean(node && groupKinds.has(node.data?.type || node.type));
    for (const node of nodes) if (node.parentId) children.set(node.parentId, [...(children.get(node.parentId) || []), node]);
    const groupedTargets = new Set(edges.filter(edge => !edge.data?.portraitVirtual && !edge.data?.assetVirtual && isGroup(byId.get(edge.source)) && String(byId.get(edge.target)?.data?.action || '').endsWith('_generate')).map(edge => edge.target));
    const seenByTarget = new Map<string, Set<string>>();
    return edges.flatMap(edge => {
        if (!groupedTargets.has(edge.target) || edge.data?.portraitVirtual || edge.data?.assetVirtual) return [edge];
        const root = byId.get(edge.source);
        if (!root) return [edge];
        const excludedValues = byId.get(edge.target)?.data?.groupRefExcludedNodeIds;
        const excluded = new Set(Array.isArray(excludedValues) ? excludedValues.filter(value => typeof value === 'string') : []);
        const seen = seenByTarget.get(edge.target) || new Set<string>();
        seenByTarget.set(edge.target, seen);
        const leaves: SourceNode[] = [];
        const visit = (node: SourceNode, depth: number) => {
            if (seen.has(node.id)) return;
            seen.add(node.id);
            if (depth > 0 && excluded.has(node.id)) return;
            if (isGroup(node)) {
                if (depth >= 8) return;
                for (const child of children.get(node.id) || []) visit(child, depth + 1);
            } else leaves.push(node);
        };
        visit(root, 0);
        return leaves.map(node => node.id === root.id ? edge : { ...edge, id: `${edge.id || root.id}::member::${node.id}`, source: node.id });
    });
}

/** Source collectIncomingNodeDataForTarget/collectIncomingNodeData rebuild empty media lists from real incoming edges. */
export function restoreLtvConnectedInputs(nodes: SourceNode[], edges: SourceNode[]) {
    const byId = new Map(nodes.map(node => [node.id, node]));
    for (const target of nodes) {
        const params = target.data?.params;
        if (!params || typeof params !== 'object' || Array.isArray(params)) continue;
        // The saved mixed-mode list is already projected by projectLtvMediaInputs.
        if (params.modeType === 'mixed2video' && Array.isArray(params.mixedList) && params.mixedList.length) continue;
        const incoming = edges.filter(edge => edge.target === target.id && !edge.data?.portraitVirtual && !edge.data?.assetVirtual)
            .map(edge => byId.get(edge.source)).filter((node): node is SourceNode => Boolean(node));
        for (const kind of ['image', 'video', 'audio']) {
            const key = `${kind}List`;
            if (params[key] != null && (!Array.isArray(params[key]) || params[key].length)) continue;
            const owners = incoming.filter(node => (node.data?.type || node.type) === kind && node.id !== params.focusRegion?.nodeId);
            const refs: SourceNode[] = [];
            let ambiguous = false;
            for (const owner of owners) {
                const data = owner.data || {};
                let urls = typeof data.url === 'string' ? [data.url] : data.url;
                const original = data.originalUrl;
                if (kind === 'image' && Array.isArray(original) && original.length && original[0] !== urls?.[0]) {
                    // Source getNodeProtectionType keeps the displayed protected version. Resource nodes otherwise use originalUrl.
                    if (data.protectionType !== 'hidden' && data.protectionType !== 'watermark') {
                        if (data.action !== 'image_resource') { ambiguous = true; break; }
                        urls = original;
                    }
                }
                if (urls != null && (!Array.isArray(urls) || urls.some((url: unknown) => typeof url !== 'string'))) { ambiguous = true; break; }
                if (refs.some(ref => ref.nodeId === owner.id)) continue;
                const meta = owner.resourceMeta?.items?.[0] || data.resourceMeta?.items?.[0];
                refs.push({ nodeId: owner.id, url: String(data.action || '').endsWith('_generate') ? '' : urls?.[0] || '',
                    ...(meta?.kind === kind ? { width: meta.width, height: meta.height, ...(kind !== 'image' ? { durationSec: meta.durationSec } : {}) } : {}) });
            }
            if (ambiguous) continue;
            if (kind === 'image' && Array.isArray(target.data?.refImages)) {
                if (target.data.refImages.some((url: unknown) => typeof url !== 'string' || !url)) continue;
                target.data.refImages.forEach((url: string, index: number) => refs.push({ nodeId: `${target.id}:ref-${index}`, url }));
            }
            if (refs.length) params[key] = refs;
        }
    }
}
