import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';

// Local evidence only. An example project link is not an executable Skill body.
const [requirementsPath, cacheDirectory, outputPath] = process.argv.slice(2);
if (!outputPath) throw Error('Usage: <requirements.json> <snapshot-cache> <output.json>');
const read = async path => JSON.parse((await readFile(path, 'utf8')).replace(/^\uFEFF/, ''));
const requirements = await read(requirementsPath);
const snapshots = await read(resolve(cacheDirectory, 'snapshot-results.json'));
const links = new Map();
for (const skill of requirements.sourceSkills) for (const link of skill.canvasCaseUrls || []) {
    if (links.has(link)) continue;
    let url;
    try { url = new URL(link); } catch { links.set(link, { link, status: 'invalid-source-link', matches: [] }); continue; }
    const projectId = url.searchParams.get('projectId');
    const shareId = url.searchParams.get('shareId');
    links.set(link, { link, projectId, shareId, matches: [], status: 'not-matched-in-local-snapshot-cache' });
}
const searchable = [...links.values()].filter(row => row.projectId || row.shareId);
for (const snapshot of snapshots) {
    if (!snapshot.file) continue;
    if (!/^\w+\.json$/.test(snapshot.file)) throw Error('Invalid snapshot filename');
    const raw = await readFile(resolve(cacheDirectory, snapshot.file), 'utf8');
    for (const row of searchable) {
        const token = row.projectId || row.shareId;
        if (!raw.includes(token) && !snapshot.id.includes(token)) continue;
        row.matches.push({ caseId: snapshot.id, file: snapshot.file, sha256: createHash('sha256').update(raw).digest('hex'),
            evidence: 'exact-source-identifier-present', executionEquivalent: false });
        row.status = 'local-candidate-needs-graph-and-skill-contract-review';
    }
}
const skills = requirements.sourceSkills.filter(row => row.canvasCaseUrls?.length).map(row => ({
    id: row.id, name: row.name, portableBodyIndexed: row.portableBodyIndexed,
    sourceCover: row.sourceCover, sourceDetail: row.detailFile, sourceDetailSHA256: row.detailSHA256,
    links: row.canvasCaseUrls.map(link => links.get(link)),
    decision: 'pending-source-contract-review',
}));
const summary = { skillsWithLinks: skills.length, outsideBodyPackages: skills.filter(row => !row.portableBodyIndexed).length,
    uniqueLinks: links.size, matchedLinks: [...links.values()].filter(row => row.matches.length).length,
    reviewedSnapshotFiles: snapshots.filter(row => row.file).length,
    paidCalls: 0, sourceBackendCalls: 0, fullAdaptationComplete: false };
await writeFile(outputPath, JSON.stringify({ summary, skills }, null, 2));
console.log(JSON.stringify(summary, null, 2));
