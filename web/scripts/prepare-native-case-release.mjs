import { readFile, writeFile, copyFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { validateFeaturedAuditScope } from './featured-release-scope.mjs';

const args = process.argv.slice(2);
if (args.includes('--finalize')) throw Error('--finalize has been withdrawn: pending adaptation is not evidence of incompatibility');
for (const arg of args.filter(arg => arg.startsWith('--'))) assert.ok(arg === '--check' || arg.startsWith('--featured-scope='), 'Unknown release flag');
const positional = args.filter(arg => !arg.startsWith('--'));
assert.ok(positional.length >= 1 && positional.length <= 2, 'Expected audit directory and optional original support file');
const [output, originalPath = 'web/src/lib/production-case-support.json'] = positional;
const checkOnly = args.includes('--check');
const scopeArgs = args.filter(arg => arg.startsWith('--featured-scope='));
assert.ok(scopeArgs.length <= 1, 'Duplicate featured scope flag');
const scopePath = scopeArgs[0]?.slice('--featured-scope='.length);
assert.ok(!scopeArgs.length || scopePath, 'Missing featured scope path');
// Scope validation is not cleaning, runtime acceptance or authorization to publish.
assert.ok(!scopePath || checkOnly, 'Featured publication requires per-case cleaning and runtime evidence; only --check is enabled');
const read = async path => JSON.parse(await readFile(path, 'utf8'));
const support = await read(`${output}/support.json`);
const reports = await read(`${output}/reports.json`);
const featured = scopePath ? validateFeaturedAuditScope(await read(scopePath), reports, support) : null;
const original = await read(originalPath);
const catalog = await read('web/public/production-library/published-catalog.json');
const ids = new Set(support.map(row => row.id));
const reportById = new Map(reports.map(row => [row.id, row]));
assert.equal(ids.size, support.length, 'Duplicate support ID');
if (!featured) assert.equal(reports.length, 1024, 'Incomplete source audit');
assert.equal(reportById.size, reports.length, 'Duplicate report ID');
if (!featured) assert.ok(original.every(entry => ids.has(entry.id)), 'Previously published cases need an explicit removal review');
assert.ok(reports.every(row => typeof row.adoptable === 'boolean' && row.adoptable === ids.has(row.id)), 'Support and adoption reports disagree');
assert.ok(support.every(entry => reportById.get(entry.id)?.adoptable === true), 'Support missing an adoptable report');

// Readiness records missing source, input, configuration and adapter work. None is a
// permanent platform verdict; publication still requires the converter's adoption gate.
const pending = reports.filter(row => !row.adoptable).map(row => {
  assert.ok(row.readiness?.requirements?.length, `Missing layered readiness audit: ${row.id}`);
  assert.notEqual(row.readiness.permanentlyIncompatible, true, `Stale incompatibility verdict: ${row.id}`);
  return {
    id: row.id, name: row.name, decision: 'pending-not-incompatible',
    readiness: row.readiness, firstObservedIssue: row.readiness.requirements[0], issues: row.issues,
  };
});
const projects = [];
for (const entry of support) {
  assert.match(entry.id, /^case-[A-Za-z0-9_-]+$/, 'Invalid case ID');
  assert.equal(entry.snapshotPath, `/production-library/case-projects/${entry.id}.json`, 'Unexpected project path');
  assert.ok(catalog.items.some(row => row.id === entry.id && row.kind === 'case' && row.cover), `Missing original cover: ${entry.id}`);
  const bytes = await readFile(`${output}/projects/${entry.id}.json`);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), entry.sha256, `Project digest mismatch: ${entry.id}`);
  const project = JSON.parse(bytes);
  assert.ok(Array.isArray(project.nodes) && Array.isArray(project.connections), 'Invalid graph structure');
  const nodes = new Map(project.nodes.map(node => [node.id, node]));
  assert.equal(nodes.size, project.nodes.length, 'Duplicate node ID');
  for (const node of project.nodes) {
    assert.ok(typeof node.id === 'string' && node.id.length, 'Missing node ID');
    if (node.parentId) assert.equal(nodes.get(node.parentId)?.type, 'frame', 'Invalid parent frame');
    for (const ref of [...(node.metadata?.ltvReferencePlan?.references || []), ...(node.metadata?.ltvReferencePlan?.texts || [])]) {
      assert.ok(nodes.has(ref.nodeId), `Missing reference: ${ref.nodeId}`);
    }
  }
  for (const edge of project.connections) assert.ok(nodes.has(edge.fromNodeId) && nodes.has(edge.toNodeId), 'Broken connection');
  projects.push({ entry, bytes });
}
const receipt = {
  mode: checkOnly ? 'check' : 'prepare', total: reports.length, published: featured ? 0 : support.length,
  ...(featured ? { featured, existingProjectsUntouched: true, deployed: false } : {}),
  generative: support.filter(row => row.generationNodeCount > 0).length,
  resourceOnly: support.filter(row => !row.generationNodeCount).length,
  generationNodes: support.reduce((count, row) => count + (row.generationNodeCount || 0), 0),
  newIds: support.filter(row => !original.some(previous => row.id === previous.id)).map(row => row.id),
  removedIds: [], pending: pending.length, discarded: 0, discardedByDecision: {},
  inputTemplates: support.filter(row => row.requiredInputs?.length).length,
  paidCalls: 0, sourceBackendCalls: 0,
};
if (!checkOnly) {
  // All graph and catalog checks finish before any public files are written.
  await mkdir('web/public/production-library/case-projects', { recursive: true });
  for (const { entry, bytes } of projects) await writeFile(`web/public${entry.snapshotPath}`, bytes);
  await copyFile(`${output}/support.json`, 'web/src/lib/production-case-support.json');
  for (const row of catalog.items) if (row.kind === 'case') row.available = ids.has(row.id);
  await writeFile('web/public/production-library/published-catalog.json', JSON.stringify(catalog));
  await writeFile(`${output}/decisions.json`, JSON.stringify({ receipt, discardedCases: [], pendingCases: pending }, null, 2));
  await writeFile(`${output}/release-receipt.json`, JSON.stringify(receipt, null, 2));
  const escape = value => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
  const rows = reports.map(row => {
    const result = row.adoptable ? '通过适配准备（仍需运行与媒体验收）' : '待处理，不判为永久不兼容';
    const details = (row.readiness?.requirements || row.issues || []).map(issue =>
      `${escape(issue.category || '')} / ${escape(issue.code)}：${escape(issue.detail)}`).join('<br>');
    return `<tr><td>${escape(row.name)}</td><td>${result}</td><td>${details}</td><td>${escape(row.id)}</td></tr>`;
  }).join('');
  await writeFile(`${output}/全量适配结果.html`, `<!doctype html><meta charset="utf-8"><title>映雪案例全量适配结果</title><style>body{font:15px system-ui;margin:32px;background:#151619;color:#ececef}input{padding:12px;width:60%;margin:12px 0}table{border-collapse:collapse;width:100%}td,th{padding:12px;border:1px solid #aaa;text-align:left;vertical-align:top}td{overflow-wrap:anywhere}</style><h1>映雪案例全量适配结果</h1><p>${receipt.total} 条已检查，${receipt.published} 条通过适配准备，${receipt.pending} 条待处理，自动舍弃 0 条。</p><p>缺来源、缺输入、缺配置和待适配按原始分层记录保留；不据此断言底座不支持。此结果不是生产发布或真实生成验收。</p><input aria-label="按名称、编号或缺口搜索" placeholder="按名称、编号或缺口搜索" oninput="for(const row of document.querySelectorAll('tbody tr'))row.hidden=!row.textContent.toLowerCase().includes(this.value.toLowerCase())"><table><thead><tr><th>案例</th><th>结果</th><th>参数与依赖缺口</th><th>编号</th></tr></thead><tbody>${rows}</tbody></table>`);
}
console.log(JSON.stringify(receipt, null, 2));
