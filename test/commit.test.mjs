import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRepository, commit, history, createBranch, headOf, snapshotAt, verifyCommit } from '../src/domain/commit.mjs';
import { commitSchemaProblems } from '../src/domain/validate.mjs';
import { claim, argument, patchOf, addUnit } from './helpers.mjs';

const p1 = () => patchOf([addUnit(claim('P')), addUnit(claim('C', { basis: 'derived' })), addUnit(argument('A', ['P'], 'C'))], 'first');
const p2 = () => patchOf([{ op: 'reviseUnit', target: { id: 'claim:P' }, next: { text: 'revised' } }], 'second');

test('commits are content-addressed, immutable and deterministic', () => {
  const mk = () => { const repo = createRepository({ id: 'repo:t' }); const c1 = commit(repo, { patch: p1(), createdAt: '2026-01-01T00:00:00Z' }); const c2 = commit(repo, { patch: p2(), createdAt: '2026-01-02T00:00:00Z' }); return { repo, c1, c2 }; };
  const a = mk();
  const b = mk();
  assert.equal(a.c1.id, b.c1.id, 'same patches, same times → same commit id');
  assert.equal(a.c2.id, b.c2.id);
  assert.deepEqual(a.c2.parentRefs, [a.c1.id]);
  assert.deepEqual(commitSchemaProblems(a.c1), []);
  assert.ok(Object.isFrozen(a.c1));
  assert.throws(() => { a.c1.message = 'x'; });
  assert.equal(history(a.repo).map((c) => c.message).join(','), 'second,first');
  assert.equal(snapshotAt(a.repo, a.c1.id).units['claim:P'].text, 'claim P', 'REV-001 historical snapshot intact');
  assert.equal(snapshotAt(a.repo, a.c2.id).units['claim:P'].text, 'revised');
  assert.deepEqual(verifyCommit(a.repo, a.c2.id), { ok: true });
});

test('baseCommitRef must match the branch head', () => {
  const repo = createRepository();
  const c1 = commit(repo, { patch: p1(), createdAt: '2026-01-01T00:00:00Z' });
  assert.throws(() => commit(repo, { patch: { ...p2(), baseCommitRef: 'commit:deadbeef' } }), /based on commit:deadbeef/);
  const c2 = commit(repo, { patch: { ...p2(), baseCommitRef: c1.id }, createdAt: '2026-01-02T00:00:00Z' });
  assert.equal(headOf(repo), c2.id);
});

test('branches fork from a commit and advance independently', () => {
  const repo = createRepository();
  const c1 = commit(repo, { patch: p1(), createdAt: '2026-01-01T00:00:00Z' });
  createBranch(repo, 'alt', c1.id);
  const c2 = commit(repo, { patch: p2(), branch: 'alt', createdAt: '2026-01-02T00:00:00Z' });
  assert.equal(headOf(repo, 'main'), c1.id);
  assert.equal(headOf(repo, 'alt'), c2.id);
  assert.equal(history(repo, 'alt').length, 2);
  assert.throws(() => createBranch(repo, 'alt'), /exists/);
});
