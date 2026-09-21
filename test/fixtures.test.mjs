import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadFixture } from '../src/adapters/local-fixture-store.mjs';
import { compileCase } from '../src/domain/authoring.mjs';
import { contentHash } from '../src/domain/canonicalize.mjs';
import { fixture } from './helpers.mjs';

const short = (labels) => Object.fromEntries(Object.entries(labels).map(([k, v]) => [k.split(':')[1], v]));

test('ai-risk commit 1: thesis stands, doom chain breaks at takeoff, probability and iteration', async () => {
  const { store, commits } = await loadFixture(fixture('ai-risk'));
  const r = store.evaluate(commits[0].id).result;
  const L = short(r.labels);
  assert.equal(r.thesis.claim, 'claim:S12');
  assert.equal(r.thesis.status, 'established');
  assert.equal(r.undecided.length, 0);
  for (const a of ['A1', 'A2', 'A4', 'A5', 'A6', 'A7', 'A8', 'A9', 'A10', 'A11', 'A13']) assert.equal(L[a], 'rejected', a);
  for (const a of ['A3', 'A12', 'A14']) assert.equal(L[a], 'accepted', a);
  for (const b of ['B1', 'B4']) assert.equal(L[b], 'rejected', b);
  for (const b of ['B2', 'B3', 'B5', 'B6', 'B7', 'B8', 'B9', 'B10', 'B11', 'B12', 'B13', 'B14']) assert.equal(L[b], 'accepted', b);
  assert.equal(r.claims['claim:P11'], 'defeated', 'everyone dies is defeated');
  assert.equal(r.claims['claim:P9'], 'established', 'shutdown resistance stands');
  const overreach = r.findings.filter((f) => f.code === 'MODAL_OVERREACH').map((f) => f.argument.split(':')[1]).sort();
  assert.deepEqual(overreach, ['A1', 'A10', 'A2', 'A4', 'A5', 'A7', 'A8']);
  assert.equal(r.findings.filter((f) => f.severity === 'major' && f.code !== 'W001').length, 5);
  assert.ok(r.findings.some((f) => f.code === 'W001' && f.argument === 'argument:A1'), 'A1 equivocates on intelligence');
  const x5 = r.edges.find((e) => e.id === 'rel:X5');
  const back = r.edges.find((e) => e.derivedFrom === 'rel:X5');
  assert.deepEqual([x5.from, x5.to], ['argument:B2', 'argument:A4']);
  assert.deepEqual([back.from, back.to, back.operator, back.derived], ['argument:A4', 'argument:B2', 'rebut', true], 'X5 is mirrored');
  assert.equal(r.edges.filter((e) => e.derived).length, 1, 'only the one authored rebut is mirrored');
});

test('ai-risk commit 2: A15 flips the takeoff chain; thesis still stands', async () => {
  const { store, commits } = await loadFixture(fixture('ai-risk'));
  const before = short(store.evaluate(commits[0].id).result.labels);
  const after = store.evaluate(commits[1].id).result;
  const L = short(after.labels);
  assert.equal(after.thesis.status, 'established');
  assert.equal(L.A15, 'accepted');
  assert.equal(L.B3, 'rejected');
  for (const a of ['A2', 'A4', 'A13']) { assert.equal(before[a], 'rejected'); assert.equal(L[a], 'accepted', a); }
  for (const b of ['B2', 'B14']) { assert.equal(before[b], 'accepted'); assert.equal(L[b], 'rejected', b); }
  assert.equal(L.A5, 'rejected', 'A5 still falls because P5 (A1) is defeated');
  assert.equal(after.claims['claim:P10'], 'established');
  assert.match(after.derivation['argument:B3'].reason, /A15/);
});

test('compact case compiles to the committed first patch (kept in sync)', async () => {
  const dir = fixture('ai-risk');
  const compact = JSON.parse(readFileSync(join(dir, 'source', 'case.json'), 'utf8'));
  const committed = JSON.parse(readFileSync(join(dir, 'commits', '0001-author-case.json'), 'utf8'));
  const compiled = compileCase(compact, { provenance: committed.provenance, message: committed.message });
  assert.equal(contentHash(compiled.operations), contentHash(committed.operations));
});

test('exercise-depression: qualifies does not defeat; A1 stays accepted after commit 2', async () => {
  const { store, commits } = await loadFixture(fixture('exercise-depression'));
  const r1 = store.evaluate(commits[0].id).result;
  const r2 = store.evaluate(commits[1].id).result;
  assert.deepEqual(r1.accepted, ['argument:A1']);
  assert.deepEqual(r2.accepted, ['argument:A1', 'argument:L1']);
  assert.equal(r2.claims['claim:C3'], 'established');
  assert.equal(store.getSnapshot(commits[1].id).units['hypothesis:H1'].scope, 'adults with mild-to-moderate depressive symptoms');
  assert.equal(store.getSnapshot(commits[0].id).units['hypothesis:H1'].scope, 'adults with depressive symptoms');
});

test('fixture commit ids are stable across loads', async () => {
  const a = await loadFixture(fixture('ai-risk'));
  const b = await loadFixture(fixture('ai-risk'));
  assert.deepEqual(a.commits.map((c) => c.id), b.commits.map((c) => c.id));
  assert.deepEqual(a.store.verify(a.commits.at(-1).id), { ok: true });
});
