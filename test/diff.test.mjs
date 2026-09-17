import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadFixture } from '../src/adapters/local-fixture-store.mjs';
import { semanticDiff, formatDiff } from '../src/domain/semantic-diff.mjs';
import { fixture } from './helpers.mjs';

test('DIFF-001 added, revised units are identified with diff classes', async () => {
  const { store, commits } = await loadFixture(fixture('exercise-depression'));
  const d = store.diff(commits[0].id, commits[1].id);
  assert.deepEqual(d.units.added.map((u) => u.id), ['argument:L1', 'claim:C4', 'claim:C5', 'evidence:E3', 'source:S3']);
  assert.deepEqual(d.units.revised.map((u) => u.id), ['hypothesis:H1']);
  assert.deepEqual(d.units.revised[0].fields, ['prediction', 'scope']);
  assert.deepEqual(d.units.revised[0].classes, ['scope/context']);
  assert.ok(d.classes.includes('evidence'));
  assert.equal(d.units.removed.length, 0);
});

test('DIFF-002 relation changes are identified semantically', async () => {
  const { store, commits } = await loadFixture(fixture('exercise-depression'));
  const d = store.diff(commits[0].id, commits[1].id);
  assert.deepEqual(d.relations.added.map((r) => r.id), ['rel:E3-supports-C2', 'rel:L1-qualifies-A1', 'rel:S3-replicates-S1']);
  assert.ok(d.affected.includes('argument:A1'), 'qualified argument is affected');
  assert.match(formatDiff(d), /\+ rel:L1-qualifies-A1 argument:L1 qualifies argument:A1/);
});

test('empty diff between identical snapshots', async () => {
  const { store, commits } = await loadFixture(fixture('ai-risk'));
  const s = store.getSnapshot(commits[0].id);
  const d = semanticDiff(s, s);
  assert.equal(d.empty, true);
  assert.equal(formatDiff(d), '(no semantic change)');
});

test('ai-risk second commit revises B3 and adds A15 undercutting it', async () => {
  const { store, commits } = await loadFixture(fixture('ai-risk'));
  const d = store.diff(commits[0].id, commits[1].id);
  assert.deepEqual(d.units.added.map((u) => u.id), ['argument:A15', 'claim:R5', 'claim:R5c']);
  assert.deepEqual(d.units.revised.map((u) => `${u.id}:${u.fields.join('+')}`), ['argument:B3:notes']);
  assert.deepEqual(d.relations.added.map((r) => r.id), ['rel:X19']);
});
