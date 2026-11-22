import assert from 'node:assert/strict';

/** Validate the frozen source order, not a newly sorted or auto-replaced selection. */
export function validateFeaturedAuditScope(scope, reports, support) {
  assert.equal(scope.version, 1, 'Unsupported featured scope version');
  assert.equal(scope.target, 200, 'Featured scope must contain 200 seats');
  assert.equal(scope.sourceOrder, 'one-continuous-original-selected-feed-session', 'Original selected feed order is required');
  assert.match(scope.selectionSha256, /^[a-f0-9]{64}$/, 'Missing frozen selection digest');
  assert.ok(Array.isArray(scope.initial) && scope.initial.length === 200, 'Incomplete frozen selection');
  assert.ok(Array.isArray(scope.replacementDecisions) && scope.replacementDecisions.length === 0,
    'Replacement decisions require separate source-order and evidence review; automatic replacement is disabled');
  const expected = scope.initial.map((row, index) => {
    assert.equal(row.rank, index + 1, 'Frozen ranks must be contiguous');
    assert.match(row.id, /^case-[A-Za-z0-9_-]+$/, 'Invalid frozen case ID');
    return row.id;
  });
  assert.equal(new Set(expected).size, 200, 'Duplicate frozen case ID');
  assert.ok(Array.isArray(reports), 'Missing audit reports');
  assert.deepEqual(reports.map(row => row.id), expected, 'Audit must match all 200 cases in original frozen order');
  assert.ok(reports.every(row => typeof row.adoptable === 'boolean'), 'Missing adoption decisions');
  assert.deepEqual(support.map(row => row.id), reports.filter(row => row.adoptable).map(row => row.id),
    'Support must be the ordered adoptable subset, not an independent selection');
  return { target: 200, selectionSha256: scope.selectionSha256, adoptable: support.length,
    pending: 200 - support.length, deployed: 0, publicationReady: false };
}
