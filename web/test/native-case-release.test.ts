import { test, expect } from 'bun:test';
import { mkdtemp, mkdir, writeFile, readFile, readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';

const script = resolve(import.meta.dir, '../scripts/prepare-native-case-release.mjs');
async function fixture() {
  const cache = resolve(import.meta.dir, '../../.local/cache/native-release-tests');
  await mkdir(cache, { recursive: true });
  const root = await mkdtemp(join(cache, 'fixture-'));
  const audit = join(root, 'audit');
  await mkdir(join(audit, 'projects'), { recursive: true });
  await mkdir(join(root, 'web/src/lib'), { recursive: true });
  await mkdir(join(root, 'web/public/production-library'), { recursive: true });
  const project = { nodes: [{ id: 'node', type: 'text' }], connections: [] };
  const bytes = JSON.stringify(project);
  const support = [{ id: 'case-good', snapshotPath: '/production-library/case-projects/case-good.json', sha256: createHash('sha256').update(bytes).digest('hex'), generationNodeCount: 0 }];
  const codes = ['snapshot-unavailable', 'unsupported-node', 'unmapped-production-parameters', 'channel-configuration-required', 'empty-prompt'];
  const reports = Array.from({ length: 1024 }, (_, index) => ({
    id: index ? `case-pending-${index}` : 'case-good', name: '<case>', adoptable: !index,
    issues: index ? [{ code: codes[index % codes.length], detail: 'stylize' }] : [],
    readiness: { status: index ? 'adaptation-required' : 'ready', permanentlyIncompatible: false,
      requirements: index ? [{ code: codes[index % codes.length], category: 'adapter', detail: 'stylize' }] : [] },
  }));
  const json = async (path: string, value: unknown) => writeFile(join(root, path), JSON.stringify(value));
  await json('audit/projects/case-good.json', project);
  await json('audit/support.json', support);
  await json('audit/reports.json', reports);
  await json('web/src/lib/production-case-support.json', support);
  await json('web/public/production-library/published-catalog.json', { items: [{ id: 'case-good', kind: 'case', cover: '/cover.webp', available: false }] });
  const run = async (...flags: string[]) => {
    const proc = Bun.spawn([process.execPath, script, audit, ...flags], { cwd: root, stdout: 'pipe', stderr: 'pipe' });
    const [stdout, stderr, exit] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
    return { stdout, stderr, exit };
  };
  return { root, json, run, support, reports, project };
}

test('preflight is read-only and retains every unresolved case without discarding', async () => {
  const f = await fixture();
  const before = await readFile(join(f.root, 'web/public/production-library/published-catalog.json'), 'utf8');
  const result = await f.run('--check');
  expect(result.exit).toBe(0);
  const receipt = JSON.parse(result.stdout);
  expect(receipt.pending).toBe(1023);
  expect(receipt.discarded).toBe(0);
  expect(receipt.mode).toBe('check');
  expect(await readFile(join(f.root, 'web/public/production-library/published-catalog.json'), 'utf8')).toBe(before);
  expect((await readdir(join(f.root, 'audit'))).sort()).toEqual(['projects', 'reports.json', 'support.json']);
});

test('preparation preserves issues and layered readiness without publishing pending graphs', async () => {
  const f = await fixture();
  expect((await f.run()).exit).toBe(0);
  const decisions = JSON.parse(await readFile(join(f.root, 'audit/decisions.json'), 'utf8'));
  expect(decisions.discardedCases).toEqual([]);
  expect(decisions.pendingCases).toHaveLength(1023);
  expect(decisions.pendingCases[0].readiness).toEqual(f.reports[1].readiness);
  expect(decisions.pendingCases[0].issues).toEqual(f.reports[1].issues);
  expect(await readdir(join(f.root, 'web/public/production-library/case-projects'))).toEqual(['case-good.json']);
});

test('bad digest, broken references and path traversal fail before writes', async () => {
  for (const defect of ['digest', 'reference', 'path']) {
    const f = await fixture();
    if (defect === 'digest') f.support[0].sha256 = '0'.repeat(64);
    if (defect === 'path') f.support[0].snapshotPath = '/../outside.json';
    if (defect === 'reference') {
      const project = { nodes: [{ id: 'node', type: 'text', metadata: { ltvReferencePlan: { references: [{ nodeId: 'missing' }] } } }], connections: [] };
      await f.json('audit/projects/case-good.json', project);
      f.support[0].sha256 = createHash('sha256').update(JSON.stringify(project)).digest('hex');
    }
    await f.json('audit/support.json', f.support);
    expect((await f.run('--check')).exit).not.toBe(0);
    expect(await readdir(join(f.root, 'web/public/production-library'))).toEqual(['published-catalog.json']);
  }
});

test('missing previous publication and support/report disagreement fail closed', async () => {
  const f = await fixture();
  await f.json('web/src/lib/production-case-support.json', [...f.support, { id: 'case-old' }]);
  expect((await f.run('--check')).exit).not.toBe(0);
  await f.json('web/src/lib/production-case-support.json', f.support);
  f.reports[0].adoptable = false;
  await f.json('audit/reports.json', f.reports);
  expect((await f.run('--check')).exit).not.toBe(0);
});

test('finalize and unknown flags are rejected', async () => {
  const f = await fixture();
  expect((await f.run('--finalize')).exit).not.toBe(0);
  expect((await f.run('--force')).exit).not.toBe(0);
});
