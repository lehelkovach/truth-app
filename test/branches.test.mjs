import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadFixture } from '../src/adapters/local-fixture-store.mjs';
import { formatEvaluationDiff } from '../src/domain/semantic-diff.mjs';
import { fixture } from './helpers.mjs';

test('BRANCH-001 a fixture branch forks from main@n, keeps its history and advances independently', async () => {
  const { store, commits, branches } = await loadFixture(fixture('hermione'));
  assert.equal(commits.length, 2);
  assert.equal(branches.repair.length, 1);
  assert.equal(store.listHistory('repair').length, 3);
  assert.equal(store.listHistory('main').length, 2);
  assert.equal(store.resolveRef('main@2'), commits[1].id);
  assert.equal(store.resolveRef('repair@2'), commits[1].id, 'shared history');
  assert.equal(store.resolveRef('repair'), branches.repair[0].id);
  assert.throws(() => store.resolveRef('main@9'), /has 2 commits/);
  assert.deepEqual(store.verify(branches.repair[0].id), { ok: true });
});

test('BRANCH-002 compare shows the spec §13.2 shape: PREMISES, EVALUATION fail→pass, DIAGNOSTICS', async () => {
  const { store } = await loadFixture(fixture('hermione'));
  const main = store.evaluate('main').result;
  assert.equal(main.logic.arguments['argument:A1'].result, 'entailed');
  assert.equal(main.logic.arguments['argument:A2'].result, 'not_entailed');
  assert.ok(main.logic.arguments['argument:A2'].missingCondition.hints.some((h) => /mammal\(x\) → has fur\(x\)/.test(h)));
  assert.equal(main.grounding['claim:C6'].state, 'unresolved');
  const cmp = store.compare('main', 'repair');
  assert.deepEqual(cmp.diff.units.added.map((u) => u.id), ['claim:C7']);
  assert.deepEqual(cmp.diff.units.revised.map((u) => `${u.id}:${u.fields.join('+')}`), ['argument:A2:premiseRefs+warrant']);
  const logical = cmp.evaluation.changes.find((c) => c.id === 'argument:A2' && c.dimension === 'logical');
  assert.deepEqual([logical.before, logical.after], ['not_entailed', 'entailed']);
  const text = formatEvaluationDiff(cmp.evaluation);
  assert.match(text, /EVALUATION argument:A2 \[logical logic.native\]: not_entailed → entailed/);
  assert.ok(cmp.evaluation.diagnostics.after.red < cmp.evaluation.diagnostics.before.red);
});

test('BRANCH-003 diagnostics carry evaluator, scope and options; dimensions stay separate', async () => {
  const { store, commits } = await loadFixture(fixture('hermione'));
  const ev = store.evaluate('main');
  const red = ev.result.diagnostics.find((d) => d.code === 'LOGIC_NOT_ENTAILED');
  assert.equal(red.target, 'argument:A2');
  assert.equal(red.state, 'red');
  assert.equal(red.scope.commit, commits[1].id);
  assert.match(red.evaluator, /^logic\.native@/);
  assert.ok(red.explanation.options.includes('Add premise'));
  assert.ok(red.explanation.missingCondition);
  const dimA2 = ev.result.dimensions['argument:A2'];
  assert.equal(dimA2.argument, 'accepted', 'grounded semantics: no attacker');
  assert.equal(dimA2.logical, 'not_entailed', 'native logic: does not follow');
  const dimC6 = ev.result.dimensions['claim:C6'];
  assert.equal(dimC6.grounding, 'unresolved');
  assert.equal(dimC6.parser, 'ai_proposed');
  assert.equal(dimC6.lifecycle, 'proposed');
  const x = store.explainUnit('argument:A2', 'main');
  assert.equal(x.logic.result, 'not_entailed');
  assert.ok(x.diagnostics.some((d) => d.code === 'LOGIC_NOT_ENTAILED'));
});

test('BRANCH-004 a case with no formal claims gets one not-applicable diagnostic, not one per argument', async () => {
  const { store } = await loadFixture(fixture('exercise-depression'));
  const ds = store.evaluate('main').result.diagnostics;
  assert.equal(ds.filter((d) => d.code === 'LOGIC_OUTSIDE_COVERAGE').length, 0);
  assert.equal(ds.filter((d) => d.code === 'LOGIC_NOT_APPLICABLE').length, 1);
});
