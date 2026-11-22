import { expect, test } from 'bun:test';
import { validateFeaturedAuditScope } from '../scripts/featured-release-scope.mjs';
import { fileURLToPath } from 'node:url';

const fixture = () => {
    const initial = Array.from({ length: 200 }, (_, index) => ({ rank: index + 1, id: `case-${index + 1}` }));
    return {
        scope: { version: 1, target: 200, sourceOrder: 'one-continuous-original-selected-feed-session',
            selectionSha256: 'a'.repeat(64), initial, reserves: [{ rank: 201, id: 'case-201' }], replacementDecisions: [] },
        reports: initial.map(({ id }) => ({ id, adoptable: true })),
        support: initial.map(({ id }) => ({ id })),
    };
};

test('accepts the complete frozen 200 audit and its ordered supported subset', () => {
    const { scope, reports, support } = fixture();
    reports[1].adoptable = false;
    support.splice(1, 1);
    const result = validateFeaturedAuditScope(scope, reports, support);
    expect(result.target).toBe(200);
    expect(result.adoptable).toBe(199);
    expect(result.pending).toBe(1);
    expect(result.deployed).toBe(0);
});

test('rejects missing cases, duplicate cases and local reordering', () => {
    for (const change of ['missing', 'duplicate', 'reorder']) {
        const { scope, reports, support } = fixture();
        if (change === 'missing') reports.pop();
        if (change === 'duplicate') reports[1] = reports[0];
        if (change === 'reorder') reports.reverse();
        expect(() => validateFeaturedAuditScope(scope, reports, support)).toThrow();
    }
});

test('rejects out-of-order support and support not justified by adoption', () => {
    const { scope, reports, support } = fixture();
    support.reverse();
    expect(() => validateFeaturedAuditScope(scope, reports, support)).toThrow();
    support.reverse();
    reports[0].adoptable = false;
    expect(() => validateFeaturedAuditScope(scope, reports, support)).toThrow();
});

test('does not auto substitute reserves or treat approval flags as deployment proof', () => {
    const { scope, reports, support } = fixture();
    reports[0].id = 'case-201';
    expect(() => validateFeaturedAuditScope(scope, reports, support)).toThrow();
    reports[0].id = 'case-1';
    expect(validateFeaturedAuditScope({ ...scope, publicationApproved: true }, reports, support).deployed).toBe(0);
    expect(() => validateFeaturedAuditScope({ ...scope, replacementDecisions: [{ rank: 1 }] }, reports, support)).toThrow();
});

test('rejects an invalid source contract or frozen rank sequence', () => {
    const { scope, reports, support } = fixture();
    for (const override of [{ sourceOrder: 'local-table' }, { selectionSha256: '' }, { target: 199 }]) {
        expect(() => validateFeaturedAuditScope({ ...scope, ...override }, reports, support)).toThrow();
    }
    scope.initial[1].rank = 3;
    expect(() => validateFeaturedAuditScope(scope, reports, support)).toThrow();
});

test('the actual release CLI rejects featured writes before reading or modifying assets', () => {
    const script = fileURLToPath(new URL('../scripts/prepare-native-case-release.mjs', import.meta.url));
    const result = Bun.spawnSync([process.execPath, script, 'nonexistent-audit', '--featured-scope=nonexistent-scope']);
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr.toString()).toContain('only --check is enabled');
    expect(result.stderr.toString()).not.toContain('ENOENT');
});
