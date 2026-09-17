import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadFixture } from '../src/adapters/local-fixture-store.mjs';
import { resolveTerm, equivocations, conceptUsage } from '../src/domain/grounding.mjs';
import { compileCase } from '../src/domain/authoring.mjs';
import { applyPatch, emptySnapshot } from '../src/domain/truth-patch.mjs';
import { fixture } from './helpers.mjs';

test('GROUND-001 exact/alias resolution: one hit resolves, several stop with candidates, none is unresolved', async () => {
  const { store } = await loadFixture(fixture('ai-risk'));
  const snap = store.getSnapshot('main');
  assert.equal(resolveTerm(snap, 'Frontier Models').conceptRef, 'concept:ai-system');
  assert.equal(resolveTerm(snap, 'agency').conceptRef, 'concept:intelligence-agency');
  assert.equal(resolveTerm(snap, 'orthogonality').status, 'unresolved');
  const patch = compileCase({ id: 't', title: 't', question: 'q', parties: [{ id: 'p', name: 'p' }], concepts: { a: { label: 'bank', definition: 'river' }, b: { label: 'bank', definition: 'money' } }, propositions: [{ id: 'X', party: 'p', text: 'bank', terms: ['bank'] }] });
  const s = applyPatch(emptySnapshot(), patch);
  assert.deepEqual(s.units['claim:X'].terms[0].candidates, ['concept:a', 'concept:b']);
  assert.equal(store.evaluate('main').result.grounding['claim:P1'].state, 'ambiguous');
});

test('GROUND-002 W001 equivocation inside A1 names both senses and the claims; W002 across the B1 attack', async () => {
  const { store } = await loadFixture(fixture('ai-risk'));
  const r = store.evaluate('main').result;
  const w1 = r.findings.find((f) => f.code === 'W001' && f.argument === 'argument:A1');
  assert.ok(w1);
  assert.equal(w1.severity, 'major');
  assert.deepEqual(w1.senses.map((s) => s.conceptRef).sort(), ['concept:intelligence-agency', 'concept:intelligence-competence']);
  assert.ok(w1.senses.find((s) => s.conceptRef === 'concept:intelligence-competence').claims.includes('claim:P3'));
  const w2 = r.findings.find((f) => f.code === 'W002' && f.argument === 'argument:B1');
  assert.ok(w2, 'B1 attacks A1 in a different sense');
  const diag = r.diagnostics.find((d) => d.code === 'W001' && d.target === 'argument:A1');
  assert.equal(diag.state, 'red');
  assert.ok(diag.explanation.options.includes('Fork definition'));
});

test('GROUND-003 regrounded branch removes the major equivocation and the diff shows GROUNDING', async () => {
  const { store } = await loadFixture(fixture('ai-risk'));
  const cmp = store.compare('main', 'regrounded');
  assert.ok(cmp.evaluation.changes.some((c) => c.dimension === 'grounding' && c.id === 'claim:P3'));
  const after = store.evaluate('regrounded').result;
  const w1 = after.findings.filter((f) => f.code === 'W001' && f.argument === 'argument:A1');
  assert.ok(!w1.some((f) => f.severity === 'major'), 'no major equivocation once P2 and P3 share a sense');
  assert.ok(w1.some((f) => f.severity === 'minor'), 'P1 is still ambiguous');
  assert.equal(after.thesis.status, 'established');
});

test('GROUND-004 concept usage answers where a concept is used and which arguments a regrounding would touch', async () => {
  const { store } = await loadFixture(fixture('ai-risk'));
  const u = conceptUsage(store.getSnapshot('main'), 'concept:intelligence-competence');
  assert.ok(u.claims.includes('claim:P3'));
  assert.ok(u.arguments.includes('argument:A1'));
  assert.deepEqual(u.competingSenses, ['concept:intelligence-agency']);
  assert.equal(equivocations(store.getSnapshot('exercise' in store.repository.branches ? 'exercise' : 'main')).length >= 1, true);
});
