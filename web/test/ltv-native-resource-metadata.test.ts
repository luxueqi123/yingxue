import { test } from 'node:test';
import assert from 'node:assert/strict';
import { adaptLtvNativeProject } from '../src/lib/canvas/ltv-native-project';

test('partial embedded metadata must not hide the saved resource duration and dimensions', () => {
    for (const kind of ['video', 'audio']) {
        const source = { nodes: [{ id: 'resource', type: kind, position: { x: 0, y: 0 },
            data: { action: `${kind}_resource`, name: 'Original resource', url: [`https://example.test/source.${kind === 'video' ? 'mp4' : 'mp3'}`],
                resourceMeta: { items: [{ kind, byteSize: 144072 }] } },
            resourceMeta: { items: [{ kind, byteSize: 144072, width: 1920, height: 1080, durationSec: 1.96 }] },
        }], edges: [] };
        const before = JSON.stringify(source);
        const result = adaptLtvNativeProject(source, { channels: [] }, 'case', 'Original');
        assert.equal(result.adoptable, true);
        assert.equal(result.project.nodes[0].metadata?.durationMs, 1960);
        assert.equal(result.project.nodes[0].metadata?.naturalWidth, 1920);
        assert.equal(result.project.nodes[0].metadata?.naturalHeight, 1080);
        assert.equal(JSON.stringify(source), before);
    }
});

test('explicit embedded resource fields keep precedence and missing duration is not guessed', () => {
    const source = { nodes: [{ id: 'resource', type: 'video', position: { x: 0, y: 0 },
        data: { action: 'video_resource', url: ['https://example.test/source.mp4'],
            resourceMeta: { items: [{ width: 640, height: 360, durationSec: 3 }] } },
        resourceMeta: { items: [{ width: 1920, height: 1080, durationSec: 2 }] },
    }], edges: [] };
    const result = adaptLtvNativeProject(source, { channels: [] }, 'case', 'Original');
    assert.equal(result.project.nodes[0].metadata?.durationMs, 3000);
    assert.equal(result.project.nodes[0].metadata?.naturalWidth, 640);
    assert.equal(result.project.nodes[0].metadata?.naturalHeight, 360);
    const missing = structuredClone(source) as any;
    delete missing.nodes[0].resourceMeta;
    delete missing.nodes[0].data.resourceMeta;
    assert.equal(adaptLtvNativeProject(missing, { channels: [] }, 'case', 'Original').project.nodes[0].metadata?.durationMs, undefined);
});
