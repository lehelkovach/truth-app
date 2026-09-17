import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadFixture } from '../src/adapters/local-fixture-store.mjs';
import { listEvaluators, registerEvaluator, getEvaluator } from '../src/services/evaluator-registry.mjs';
import { fixture } from './helpers.mjs';

test('PROV-001 evaluation pins the exact input commit, snapshot hash and evaluator version', async () => {
  const { store, commits } = await loadFixture(fixture('ai-risk'));
  const ev = store.evaluate(commits[1].id);
  assert.equal(ev.inputCommitRef, commits[1].id);
  assert.equal(ev.inputSnapshotHash, commits[1].snapshotHash);
  assert.equal(ev.evaluator, 'argumentation.grounded');
  assert.match(ev.evaluatorVersion, /^\d+\.\d+\.\d+$/);
  assert.match(ev.id, /^evaluation:[a-f0-9]{16}$/);
  assert.equal(ev.provenance.sourceType, 'evaluator');
  const again = store.evaluate(commits[1].id);
  assert.equal(again.id, ev.id, 'same input, same evaluation id');
  assert.notEqual(store.evaluate(commits[0].id).id, ev.id);
});

test('explainUnit returns revision, relations, label, derivation and lineage', async () => {
  const { store, commits } = await loadFixture(fixture('ai-risk'));
  const x = store.explainUnit('argument:B3', commits[1].id);
  assert.equal(x.revision.revision, 2);
  assert.equal(x.label, 'rejected');
  assert.match(x.derivation.reason, /A15/);
  assert.deepEqual(x.relations.map((r) => r.id).sort(), ['rel:X19', 'rel:X4']);
  assert.equal(x.lineage.length, 2, 'touched in both commits');
  const ev = store.getEvidence('claim:P13');
  assert.equal(ev.sources.length, 4);
});

test('evaluator registry lists the grounded evaluator and accepts new ones', () => {
  assert.ok(listEvaluators().some((e) => e.id === 'argumentation.grounded'));
  registerEvaluator({ id: 'test.noop', version: '0.0.1', run: () => ({ ok: true }) });
  assert.deepEqual(getEvaluator('test.noop').run({}), { ok: true });
  assert.throws(() => getEvaluator('nope'), /unknown evaluator/);
});
