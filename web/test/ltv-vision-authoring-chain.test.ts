import { expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import seeds from '../../backend/internal/skills/seed/production-skills.json';
import { publishedSkills } from '../src/lib/published-production-assets';
import { isVerifiedProductionSkill } from '../src/lib/verified-production-assets';
import { buildAssistantReferences, buildToolAgentMessages } from '../src/components/canvas/canvas-assistant-online-tools';
import { CanvasNodeType, type CanvasNodeData } from '../src/types/canvas';

// These source contracts deliver prompt/script text, including their image-analysis branches.
// The model names inside delivered prompts are not requests to execute those models.
const contracts = [
    ['pl-2c77ed62e86c6d5c2af7772fdd830a97', 'b6af43fe412bc6d5e6b222f0b9aa25717ccf34a2639582baf8169dccaf72fb76'],
    ['pl-001ff2d28ef5a58289e077221f3b9f99', '87d99107521dce95e8f17f66cde0ef3d778ff4f54e3ac5172c6b36d657cab523'],
    ['pl-cc30e4aa0b2fc07422b340a7731205f2', '77b0ca57c4f5f72d15193d4c516277612719bc694cd5ecb186ed59071f31ec12'],
    ['pl-e627ac3031d76f0ad13de0259b371505', 'c0d76d0c3dbfeca930137e6c335a0bff8cfa3aec08406d60135bd26cb783158a'],
];

test('图文提示词共用链路携带完整源技能及十二张有序图片，不截断或调用生成', async () => {
    const images: CanvasNodeData[] = Array.from({ length: 12 }, (_, index) => ({
        id: `shot-${index}`, type: CanvasNodeType.Image, title: `镜头${index + 1}`, position: { x: 0, y: 0 }, width: 100, height: 100,
        metadata: { storageKey: `resource:frame-${index}` },
    }));
    for (const [id, expectedHash] of contracts) {
        const seed = seeds.find(row => row.skill_id === id)!;
        expect(seed).toBeDefined();
        expect(isVerifiedProductionSkill(id)).toBe(true);
        const separator = seed.instruction.indexOf('\n---\n');
        const body = seed.instruction.slice(separator + 5).split('\n\n## 配套文件索引')[0];
        expect(createHash('sha256').update(body).digest('hex')).toBe(expectedHash);
        expect(seed.files || []).toHaveLength(0);
        expect(publishedSkills[id]).toBeDefined();
        if (publishedSkills[id].cover) expect(publishedSkills[id].cover).toStartWith('/production-library/');
        const skill: CanvasNodeData = { id: 'skill', type: CanvasNodeType.Skill, title: id, position: { x: 0, y: 0 }, width: 100, height: 100,
            metadata: { skillSnapshot: { id, name: id, template: seed.instruction, description: '', category: 'utility', outputMode: 'text', outputContract: '', version: 1 } } };
        const nodes = [...images, skill];
        const selected = nodes.map(node => node.id);
        const messages = await buildToolAgentMessages({ projectId: 'test', title: '图文创作', nodes, connections: [], selectedNodeIds: selected, viewport: { x: 0, y: 0, k: 1 } }, [], {
            id: 'user', role: 'user', text: '依据原技能完整输出', references: buildAssistantReferences(nodes, new Set(selected)),
        });
        const content = messages.findLast(message => message.role === 'user')!.content;
        expect(Array.isArray(content)).toBe(true);
        if (!Array.isArray(content)) throw Error('missing multimodal content');
        const pictures = content.filter(part => part.type === 'image_url');
        expect(pictures).toHaveLength(12);
        expect(pictures.map(part => part.type === 'image_url' ? part.image_url.url : '')).toEqual(images.map(node => node.metadata!.storageKey!));
        expect(content.some(part => part.type === 'text' && part.text.includes(seed.instruction))).toBe(true);
    }
});
