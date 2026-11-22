import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { createSkillRuntime } from '../src/services/skill-runtime.ts';

// Exercise the production context loader with local package transport only.
// This does not establish tool execution or model output quality.
const [seedPath, outputPath, aliasReportPath] = process.argv.slice(2);
if (!seedPath || !outputPath) throw new Error('Usage: bun audit-skill-context.mjs <seed-json> <output-dir>');
const raw = await readFile(seedPath, 'utf8');
const seeds = JSON.parse(raw.replace(/^\uFEFF/, ''));
const hash = (text) => createHash('sha256').update(text).digest('hex');
const aliasRaw = aliasReportPath ? await readFile(aliasReportPath, 'utf8') : null;
const aliasReports = new Map((aliasRaw ? JSON.parse(aliasRaw.replace(/^\uFEFF/, '')) : []).map(row => [row.id, row.aliases || {}]));
const rows = [];
for (const seed of seeds) {
    const files = new Map([['SKILL.md', seed.instruction], ...(seed.files || []).map(file => [file.path, file.content])]);
    for (const [alias, source] of Object.entries(aliasReports.get(seed.skill_id) || {})) {
        if (!files.has(source)) throw new Error(`Alias source missing: ${seed.skill_id} ${source}`);
        if (files.has(alias) && files.get(alias) !== files.get(source)) throw new Error(`Alias collision: ${seed.skill_id} ${alias}`);
        files.set(alias, files.get(source));
    }
    const manifest = [...files].map(([path, content]) => ({ path, kind: 'markdown', mimeType: 'text/plain', size: content.length, sha256: hash(content) }));
    const reads = [];
    const runtime = createSkillRuntime({
        getFile: async (_id, path) => {
            if (!files.has(path)) throw new Error(`Missing package file: ${path}`);
            reads.push(path);
            const originalPath = aliasReports.get(seed.skill_id)?.[path] || path;
            return { file: { file: manifest.find(file => file.path === originalPath), content: files.get(originalPath), binary: false } };
        },
        listFiles: async () => ({ files: manifest }),
        searchFiles: async () => { throw new Error('Unexpected transport'); },
        getBundle: async () => { throw new Error('Unexpected transport'); },
    });
    const skill = { skillId: seed.skill_id, skillName: seed.skill_name, description: seed.description, versionId: hash(seed.instruction), version: 'local-audit', isAdded: true };
    const aliases = aliasReports.get(seed.skill_id) || {};
    try {
        const result = await runtime.prepare({ profile: 'canvas', prompt: `${seed.skill_name} ${seed.description}`, skills: [skill], selectedSkillIds: [skill.skillId] });
        // The runtime inlines must-read files whole and may list lookup appendices by path for
        // progressive reading. Both are valid deliveries; verify each read file against the
        // contract it actually got, instead of demanding every read file be inlined.
        const inlinedPaths = new Set(result.provenance.skillFiles.map(file => file.path));
        const listedOnly = new Set((/<skill-reference-only>([\s\S]*?)<\/skill-reference-only>/.exec(result.prompt)?.[1] || '').split('\n').map(line => line.trim()).filter(line => line.startsWith('- ')).map(line => line.slice(2).trim()));
        const problems = [];
        for (const requested of new Set(reads)) {
            const canonical = aliases[requested] || requested;
            const content = files.get(canonical);
            if (inlinedPaths.has(canonical)) {
                if (!result.prompt.includes(content)) problems.push(`内联文件正文不完整: ${canonical}`);
            } else if (!listedOnly.has(canonical)) {
                problems.push(`已读取但既未内联也未列入渐进读取: ${canonical}`);
            } else if (result.prompt.includes(content)) {
                problems.push(`已列入渐进读取却又内联了正文: ${canonical}`);
            }
        }
        if (problems.length) throw new Error(problems.join('；'));
        rows.push({ id: skill.skillId, name: skill.skillName, status: 'context-prepared-only', characters: result.prompt.length, files: result.provenance.skillFiles, referenceOnly: [...listedOnly] });
    } catch (error) {
        rows.push({ id: skill.skillId, name: skill.skillName, status: 'context-needs-attention', reason: String(error.message), readFiles: reads });
    }
}
const summary = { seedSHA256: hash(raw), aliasReportSHA256: aliasRaw ? hash(aliasRaw) : null, total: rows.length, prepared: rows.filter(row => row.status === 'context-prepared-only').length, needsAttention: rows.filter(row => row.status === 'context-needs-attention').length, paidGenerationRequests: 0, scope: 'Local context preparation for seed packages with optional reviewed aliases; not publication status, all source catalog entries, or production workflow acceptance' };
await mkdir(resolve(outputPath), { recursive: true });
await writeFile(resolve(outputPath, 'reports.json'), JSON.stringify(rows, null, 2));
await writeFile(resolve(outputPath, 'summary.json'), JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary));
