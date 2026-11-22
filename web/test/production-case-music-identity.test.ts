import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { musicTaskMetadata, MUREKA_INSTRUMENTAL } from '../src/lib/canvas/ltv-music-options';
import support from '../src/lib/production-case-support.json';
import scope from '../../docs/design/ltv-featured-200-scope.json';

test('当前200例的原Mureka8音乐节点保持同版本提交协议', () => {
    const selected = new Set(scope.effectiveLocalSelection.map(entry => entry.id));
    let checked = 0;
    const issues: string[] = [];
    for (const entry of support.filter(entry => selected.has(entry.id))) {
        const project = JSON.parse(readFileSync(new URL('../public' + entry.snapshotPath, import.meta.url), 'utf8'));
        const sourceModels = new Map(project.adaptation.models.map((row: any) => [row.nodeId, row.sourceModel]));
        for (const node of project.nodes) {
            if (sourceModels.get(node.id) !== 'mureka-8') continue;
            checked++;
            try {
                expect(node.metadata.ltvExecutionContract).toBe(MUREKA_INSTRUMENTAL);
                expect(musicTaskMetadata(node.metadata.audioMusic)).toEqual({
                    providerOptions: { [MUREKA_INSTRUMENTAL]: { forceInstrumental: true } },
                });
            } catch (error) {
                issues.push(`${entry.id}/${node.id}: ${error instanceof Error ? error.message : String(error)}`);
            }
        }
    }
    expect(checked).toBeGreaterThan(0);
    expect(issues).toEqual([]);
});
