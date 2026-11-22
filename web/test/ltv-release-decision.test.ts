import { expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

test('旧finalize入口在读取或覆盖公开集合之前拒绝整体排除未适配项', () => {
    const support = new URL('../src/lib/production-case-support.json', import.meta.url);
    const before = readFileSync(support, 'utf8');
    const run = spawnSync(process.execPath, [fileURLToPath(new URL('../scripts/prepare-native-case-release.mjs', import.meta.url)), 'nonexistent-audit', '--finalize'], { encoding: 'utf8' });
    expect(run.status).not.toBe(0);
    expect(run.stderr).toContain('pending adaptation is not evidence of incompatibility');
    expect(readFileSync(support, 'utf8')).toBe(before);
});
