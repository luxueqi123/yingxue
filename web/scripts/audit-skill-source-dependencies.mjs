import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';

const [sourceDirectory, reviewedPath, contextReportPath, outputDirectory] = process.argv.slice(2);
if (!outputDirectory) throw Error('Usage: <source-detail-dir> <reviewed-skills> <context-reports> <output-dir>');
const read = async (path) => JSON.parse((await readFile(path, 'utf8')).replace(/^\uFEFF/, ''));
const hash = (value) => createHash('sha256').update(value).digest('hex');
const reviewed = new Map((await read(reviewedPath)).map(row => [row.id, row]));
const pending = (await read(contextReportPath)).filter(row => row.status === 'context-needs-attention');
const sources = new Map();
for (const name of await readdir(sourceDirectory)) {
    if (!name.endsWith('.json')) continue;
    const raw = await readFile(resolve(sourceDirectory, name), 'utf8');
    const skill = JSON.parse(raw.replace(/^\uFEFF/, '')).data?.skill;
    if (!skill?.templateUuid) continue;
    let snapshot = null;
    try { snapshot = typeof skill.snapshotData === 'string' ? JSON.parse(skill.snapshotData) : skill.snapshotData; } catch { /* Record absent snapshot separately. */ }
    sources.set(skill.templateUuid, { file: name, sha256: hash(raw), skill, snapshot });
}
const reports = pending.map(row => {
    const sourceId = reviewed.get(row.id)?.sourceId;
    const source = sources.get(sourceId);
    const files = (value) => (value?.skillFiles || []).map(file => ({ path: file.path, characters: (file.content || '').length, sha256: hash(file.content || '') }));
    return {
        id: row.id, name: row.name, sourceId, issue: row.reason,
        sourceFile: source?.file || null, sourceSHA256: source?.sha256 || null,
        rootFiles: files(source?.skill), snapshotFiles: files(source?.snapshot),
        snapshotPresent: Boolean(source?.snapshot),
        disposition: 'pending-adaptation-not-excluded',
        boundary: 'Only this source definition and its embedded snapshot; absent files may exist in other local assets or be runtime outputs',
    };
});
await mkdir(resolve(outputDirectory), { recursive: true });
await writeFile(resolve(outputDirectory, 'reports.json'), JSON.stringify(reports, null, 2));
console.log(JSON.stringify({ checkedSourceDefinitions: sources.size, pendingContexts: reports.length, foundSources: reports.filter(row => row.sourceFile).length, paidRequests: 0, excluded: 0 }));
