import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';

// Read only the existing source snapshots and audit; never call a generation provider.
const [auditDirectory, outputDirectory, sourceSkillsDirectory] = process.argv.slice(2);
if (!auditDirectory || !outputDirectory || !sourceSkillsDirectory) throw Error('Usage: <existing-audit-directory> <output-directory> <full-source-skills-directory>; full source index is required, not just installed packages');
const read = async path => JSON.parse((await readFile(path, 'utf8')).replace(/^\uFEFF/, ''));
const hash = value => createHash('sha256').update(value).digest('hex');
// Older definitions keep example projects inside caseItems rather than the root.
const canvasLinks = value => {
    const links = new Set();
    const visit = item => {
        if (!item || typeof item !== 'object') return;
        for (const [key, child] of Object.entries(item)) {
            if (key === 'canvasCaseUrl' && typeof child === 'string' && child.trim()) links.add(child);
            else if (child && typeof child === 'object') visit(child);
        }
    };
    visit(value);
    return [...links];
};
const cache = '.local/cache/case-chain-audit';
const [reports, index, tools, skills, seeds, published] = await Promise.all([
    read(resolve(auditDirectory, 'reports.json')), read(resolve(cache, 'snapshot-results.json')),
    read(resolve(cache, 'source-tool-spec.json')), read('.local/cache/reviewed-skills.json'),
    read('backend/internal/skills/seed/production-skills.json'), read('web/src/lib/production-chain-support.json'),
]);
assert.equal(reports.length, 1024);
assert.equal(skills.length, 572);
assert.equal(new Set(reports.map(row => row.id)).size, reports.length);
const require = createRequire(import.meta.url);
const esbuild = require('../../canvas-agent/node_modules/esbuild');
const compiled = await esbuild.build({ entryPoints: ['web/src/lib/canvas/ltv-parameter-layers.ts'], bundle: true, platform: 'node', format: 'esm', write: false });
const { projectLtvSubmittedFields, resolveLtvSourceModel } = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString('base64')}`);
const schemas = new Map();
for (const tool of tools.data.tools) {
    if (!tool.metadata) continue;
    let schema;
    try { schema = typeof tool.metadata === 'string' ? JSON.parse(tool.metadata) : tool.metadata; } catch { continue; }
    schemas.set(`${tool.type}:${tool.toolKey}`, schema);
}
const snapshots = new Map(index.map(row => [row.id, row]));
const families = new Map();
const cases = [];
for (const report of reports) {
    const source = snapshots.get(report.id);
    const nodeById = new Map();
    let snapshotHash = null;
    if (source?.file) {
        assert.match(source.file, /^\w+\.json$/);
        const data = await read(resolve(cache, source.file));
        const raw = data.data?.detail?.snapshotData;
        if (typeof raw === 'string') {
            snapshotHash = hash(raw);
            const snapshot = JSON.parse(raw);
            for (const node of snapshot.nodes || []) nodeById.set(node.id, node);
        }
    }
    const requirements = [];
    for (const issue of report.issues) {
        const node = nodeById.get(issue.nodeId);
        const params = node?.data?.params || {};
        const model = resolveLtvSourceModel(node);
        const schema = schemas.get(`${node?.type}:${model}`);
        const projection = projectLtvSubmittedFields(params, schema, node?.type || '');
        const operation = String(projection.fields.modeType || node?.data?.action || node?.type || '');
        const key = JSON.stringify([issue.code, node?.type || 'project', model, operation]);
        let family = families.get(key);
        if (!family) {
            family = { id: hash(key).slice(0, 16), issue: issue.code, nodeType: node?.type || 'project', sourceModel: model, operation,
                sourceSchemaKnown: Boolean(schema), caseIds: new Set(), nodeCount: 0, fields: new Map(), examples: [] };
            families.set(key, family);
        }
        family.caseIds.add(report.id);
        family.nodeCount++;
        const fieldNames = ['unmapped-production-parameters', 'advanced-operation'].includes(issue.code)
            ? issue.detail.split(',') : issue.code === 'search-option-unmapped' ? ['search_enabled', 'searchEnabled', 'searchable']
                : issue.code === 'video-quality-adapter-required' ? ['quality'] : [];
        for (const field of fieldNames) {
            if (!Object.hasOwn(projection.fields, field)) continue;
            const value = JSON.stringify(projection.fields[field]);
            const values = family.fields.get(field) || new Map();
            values.set(value, (values.get(value) || 0) + 1);
            family.fields.set(field, values);
        }
        if (family.examples.length < 3) family.examples.push({ caseId: report.id, nodeId: issue.nodeId, detail: issue.detail, sourceFile: source?.file });
        requirements.push({ familyId: family.id, ...issue });
    }
    cases.push({ id: report.id, name: report.name, status: report.adoptable ? 'existing-adapter-accepted' : 'pending-not-incompatible',
        snapshotHash, sourceFile: source?.file || null, sourceReadStatus: source?.status || 'not-indexed', requirements });
}
const bySeed = new Map(seeds.map(seed => [seed.skill_id, seed]));
const publishedIds = new Set(published.map(row => row.id));
const skillRows = skills.map(skill => {
    const seed = bySeed.get(skill.id);
    const instruction = seed?.instruction || '';
    const separator = instruction.indexOf('\n---\n');
    const body = (separator < 0 ? instruction : instruction.slice(separator + '\n---\n'.length)).split('\n\n## 配套文件索引', 1)[0];
    const files = seed?.files || [];
    return { id: skill.id, name: skill.name, origin: seed?.extra_info?.split(' · ')[0] || 'unknown', sourceId: skill.sourceId || null,
        status: publishedIds.has(skill.id) ? 'existing-adapter-accepted' : 'pending-not-incompatible',
        packageStatus: skill.status, bodyHashMatched: hash(body) === skill.bodySHA256,
        missingReferences: skill.missing || [], observedBlockers: skill.blockers || [], sourceTools: skill.toolNames || [],
        sourceCover: skill.sourceCover || null, coverStatus: skill.coverStatus,
        files: files.map(file => ({ path: file.path, sha256: hash(file.content || '') })),
        instructionSHA256: hash(instruction),
        // Source resultType and keyword hits are review evidence, not an execution capability verdict.
        contractPassages: body.split('\n').map((text, index) => ({ line: index + 1, text }))
            .filter(row => /输出格式|最终输出|交付|调用.{0,30}工具|必须.{0,20}(?:生成|创建)|不(?:需要|依赖|生成)/.test(row.text)),
    };
});
const familyRows = [...families.values()].map(({ caseIds, fields, ...family }) => ({ ...family, caseIds: [...caseIds], caseCount: caseIds.size,
    fields: Object.fromEntries([...fields].map(([field, values]) => [field, [...values].map(([value, count]) => ({ value: JSON.parse(value), count }))]))
})).sort((a, b) => b.caseCount - a.caseCount);
const sourceSkills = [];
if (sourceSkillsDirectory) {
    const sourceIndex = await read(resolve(sourceSkillsDirectory, '_技能总表1145条.json'));
    const portableIndex = await read(resolve(sourceSkillsDirectory, '可移植SKILL正文_556个/_索引.json'));
    const portableIds = new Set(portableIndex.map(row => row.templateUuid));
    const detailDirectory = resolve(sourceSkillsDirectory, '详情_完整定义');
    const details = new Map();
    for (const file of await readdir(detailDirectory)) {
        if (!file.endsWith('.json')) continue;
        const raw = await readFile(resolve(detailDirectory, file), 'utf8');
        const response = JSON.parse(raw.replace(/^\uFEFF/, ''));
        const skill = response.data?.skill;
        if (skill?.templateUuid) details.set(skill.templateUuid, { skill, file, sha256: hash(raw) });
    }
    assert.equal(new Set(sourceIndex.map(row => row.templateUuid)).size, sourceIndex.length);
    for (const entry of sourceIndex) {
        const detail = details.get(entry.templateUuid);
        const snapshot = detail?.skill.snapshotData ? JSON.parse(detail.skill.snapshotData) : {};
        sourceSkills.push({ id: entry.templateUuid, name: entry.name, skillKey: entry.skillKey,
            portableBodyIndexed: portableIds.has(entry.templateUuid), detailFile: detail?.file || null, detailSHA256: detail?.sha256 || null,
            importedId: skillRows.find(row => row.sourceId === entry.templateUuid)?.id || null,
            sourceCover: detail?.skill.coverUrl || entry.coverUrl || null,
            input: detail?.skill.inputType, output: detail?.skill.outputContent,
            detailFields: Object.keys(detail?.skill || {}), snapshotFields: Object.keys(snapshot),
            canvasCaseUrl: snapshot.canvasCaseUrl || null,
            canvasCaseUrls: canvasLinks([snapshot, detail?.skill]),
            status: portableIds.has(entry.templateUuid) ? 'covered-by-package-review' : detail ? 'source-implementation-review-required' : 'source-detail-missing',
        });
    }
}
const summary = { sourceAudit: auditDirectory, sourceReportsSHA256: hash(JSON.stringify(reports)),
    cases: cases.length, pendingCases: cases.filter(row => row.status === 'pending-not-incompatible').length,
    skills: skillRows.length, pendingSkills: skillRows.filter(row => row.status === 'pending-not-incompatible').length,
    sourceSkillRecords: sourceSkills.length, sourceSkillBodies: sourceSkills.filter(row => row.portableBodyIndexed).length,
    sourceSkillsOutsidePackageAudit: sourceSkills.filter(row => !row.portableBodyIndexed).length,
    sourceSkillDetailsMissing: sourceSkills.filter(row => !row.detailFile).length,
    sourceSkillProjectLinks: sourceSkills.filter(row => row.canvasCaseUrls.length).length,
    sourceSkillProjectLinksOutsidePackageAudit: sourceSkills.filter(row => !row.portableBodyIndexed && row.canvasCaseUrls.length).length,
    families: familyRows.length, permanentlyExcluded: 0, fullAdaptationComplete: false, paidGenerationRequests: 0, sourceBackendRequests: 0 };
await mkdir(outputDirectory, { recursive: true });
await writeFile(resolve(outputDirectory, 'requirements.json'), JSON.stringify({ summary, families: familyRows, cases, skills: skillRows, sourceSkills }, null, 2));
await writeFile(resolve(outputDirectory, 'summary.json'), JSON.stringify(summary, null, 2));
console.log(JSON.stringify({ ...summary, largestFamilies: familyRows.slice(0, 12).map(({ fields, examples, caseIds, ...row }) => row) }, null, 2));
