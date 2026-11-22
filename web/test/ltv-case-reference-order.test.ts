import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import support from '../src/lib/production-case-support.json';
import { assertLtvConnectedReferenceOrder, orderLtvReferenceConnections, remapLtvReferencePlan } from '../src/lib/canvas/ltv-runtime-references';
import type { CanvasConnection, CanvasNodeData } from '../src/types/canvas';
import { loadProductionCaseProject } from '../src/services/production-case-project';
import { isCaseWithdrawn } from '../src/lib/case-publication-policy';

const admittedSupport = support.filter(entry => !isCaseWithdrawn(entry.id));
const withdrawnSupport = support.filter(entry => isCaseWithdrawn(entry.id));

test('the real case loader rejects withdrawn cases and verifies/remaps every admitted graph', { timeout: 30_000 }, async () => {
    const originalFetch = globalThis.fetch;
    const fetchedUrls: string[] = [];
    globalThis.fetch = (async (url: string) => {
        fetchedUrls.push(url);
        return new Response(readFileSync(new URL(`../public${url}`, import.meta.url)));
    }) as typeof fetch;
    try {
        assert.ok(withdrawnSupport.length > 0, 'withdrawn support entries must exercise the publication refusal path');
        assert.ok(admittedSupport.length > 0, 'admitted support entries must still exercise the real loader');
        for (const entry of withdrawnSupport) {
            const requestCount = fetchedUrls.length;
            await assert.rejects(loadProductionCaseProject(entry.id), /该案例已从作品库下架/);
            assert.equal(fetchedUrls.length, requestCount, `${entry.id} must be rejected before its snapshot is fetched`);
        }
        for (const entry of admittedSupport) {
            const source = JSON.parse(readFileSync(new URL(`../public${entry.snapshotPath}`, import.meta.url), 'utf8')) as { nodes: CanvasNodeData[]; connections: CanvasConnection[] };
            const loaded = await loadProductionCaseProject(entry.id);
            assert.equal(loaded.nodes.length, entry.nodeCount);
            assert.equal(loaded.connections.length, entry.connectionCount);
            const sourceIds = new Set(source.nodes.map(node => node.id));
            const byId = new Map(loaded.nodes.map(node => [node.id, node]));
            assert.equal(byId.size, sourceIds.size, `${entry.id} node IDs remain unique after copy`);
            assert.ok(loaded.nodes.every(node => !sourceIds.has(node.id)), `${entry.id} copy must remap every source node ID`);
            const mappedSourceIds = new Map(source.nodes.map((node, index) => [node.id, loaded.nodes[index].id]));
            for (let index = 0; index < loaded.nodes.length; index++) {
                const sourceNode = source.nodes[index];
                const copiedNode = loaded.nodes[index];
                assert.equal(copiedNode.parentId, sourceNode.parentId ? mappedSourceIds.get(sourceNode.parentId) : undefined);
            }
            const mappedSourceEdges = source.connections.map(edge => [mappedSourceIds.get(edge.fromNodeId), mappedSourceIds.get(edge.toNodeId)] as const)
                .map(edge => edge.join('->')).sort();
            const loadedEdges = loaded.connections.map(edge => [edge.fromNodeId, edge.toNodeId].join('->')).sort();
            assert.deepEqual(loadedEdges, mappedSourceEdges, `${entry.id} connections must follow the node remapping`);
            for (const node of loaded.nodes) {
                for (const frameId of [node.metadata?.videoStartFrameNodeId, node.metadata?.videoEndFrameNodeId]) {
                    if (frameId) assert.equal(byId.get(frameId)?.type, 'image');
                }
                if (!node.metadata?.ltvReferencePlan) continue;
                assertLtvConnectedReferenceOrder(node.metadata.ltvReferencePlan, loaded.connections.filter(edge => edge.toNodeId === node.id).map(edge => ({ nodeId: edge.fromNodeId, type: byId.get(edge.fromNodeId)!.type })));
            }
        }
        assert.equal(fetchedUrls.length, admittedSupport.length);
        assert.ok(fetchedUrls.every(url => url.startsWith('/production-library/case-projects/')));
    } finally { globalThis.fetch = originalFetch; }
});

test('all archived cases retain native shelf numbering after offline copy and persistence', { timeout: 30_000 }, () => {
    let checked = 0;
    for (const entry of support) {
        const source = JSON.parse(readFileSync(new URL(`../public${entry.snapshotPath}`, import.meta.url), 'utf8')) as { nodes: CanvasNodeData[]; connections: CanvasConnection[] };
        const ids = new Map(source.nodes.map(node => [node.id, `copy-${node.id}`]));
        const copied = source.nodes.map(node => ({ ...node, id: ids.get(node.id)!, metadata: { ...node.metadata,
            ...(node.metadata?.ltvReferencePlan ? { ltvReferencePlan: remapLtvReferencePlan(node.metadata.ltvReferencePlan, ids, true) } : {}) } }));
        const edges = source.connections.map(edge => ({ ...edge, fromNodeId: ids.get(edge.fromNodeId)!, toNodeId: ids.get(edge.toNodeId)! }));
        const restored = JSON.parse(JSON.stringify({ nodes: copied, connections: orderLtvReferenceConnections(copied, edges) })) as typeof source;
        const byId = new Map(restored.nodes.map(node => [node.id, node]));
        for (const node of restored.nodes) {
            if (!node.metadata?.ltvReferencePlan) continue;
            const inputs = restored.connections.filter(edge => edge.toNodeId === node.id).map(edge => ({ nodeId: edge.fromNodeId, type: byId.get(edge.fromNodeId)!.type }));
            assert.doesNotThrow(() => assertLtvConnectedReferenceOrder(node.metadata!.ltvReferencePlan!, inputs), `${entry.id}/${node.id}`);
            checked++;
        }
        assert.equal(restored.connections.length, source.connections.length);
    }
    assert.equal(checked, support.reduce((sum, item) => sum + item.generationNodeCount, 0));
    assert.ok(checked > 0);
});
