import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadFixture } from '../src/adapters/local-fixture-store.mjs';
import { compileCase } from '../src/domain/authoring.mjs';
import { contentHash } from '../src/domain/canonicalize.mjs';
import { formatEvaluationDiff } from '../src/domain/semantic-diff.mjs';
import { coverageReport } from '../scripts/logic-coverage.mjs';
import { fixture } from './helpers.mjs';

const short = (labels) => Object.fromEntries(Object.entries(labels).map(([k, v]) => [k.split(':')[1], v]));

test('pierson-post commit 1: as argued, both standoffs hold, only Keeble stands, and the sides equivocate on possession', async () => {
  const { store, commits } = await loadFixture(fixture('pierson-post'));
  const r = store.evaluate(commits[0].id).result;
  const L = short(r.labels);
  assert.equal(r.thesis.claim, 'claim:H');
  assert.equal(r.thesis.status, 'open', 'the holding is open while the authority and policy standoffs are unresolved');
  assert.deepEqual(r.accepted, ['argument:B4']);
  for (const a of ['A1', 'A2', 'A6', 'B1', 'B2', 'B5']) assert.equal(L[a], 'undecided', a);
  const standoffs = r.findings.filter((f) => f.code === 'STANDOFF').map((f) => f.argument).sort();
  assert.deepEqual(standoffs, ['argument:A1', 'argument:A2']);
  const w002 = r.findings.filter((f) => f.code === 'W002').map((f) => f.argument).sort();
  assert.deepEqual(w002, ['argument:A1', 'argument:B1'], "'possession' is grounded to a different sense on each side of the declared attack");
  const overreach = r.findings.filter((f) => f.code === 'MODAL_OVERREACH').map((f) => f.argument).sort();
  assert.deepEqual(overreach, ['argument:A2', 'argument:B2'], 'both policy arguments assert their rule more strongly than their weakest premise');
  // The formal core of the majority's argument is checked by the native evaluator.
  assert.equal(r.logic.arguments['argument:A1'].result, 'entailed');
  assert.equal(r.logic.claims['claim:M5'].result, 'entailed');
  assert.equal(r.dimensions['argument:A1'].argument, 'undecided (attacked)', 'logical entailment and argument state are reported separately');
});

test('pierson-post commit 2: the dissent\'s unanswered custom argument defeats the holding; Keeble is distinguished', async () => {
  const { store, commits } = await loadFixture(fixture('pierson-post'));
  const r = store.evaluate(commits[1].id).result;
  const L = short(r.labels);
  assert.equal(r.thesis.status, 'defeated');
  assert.equal(L.B3, 'accepted', 'tempora mutantur has no attacker at commit 2');
  assert.equal(L.A1, 'rejected');
  assert.match(r.derivation['argument:A1'].reason, /B3/);
  assert.equal(r.claims['claim:M5'], 'defeated');
  assert.equal(L.A6, 'rejected', 'the holding falls with M5');
  assert.equal(L.A4, 'accepted');
  assert.equal(L.B4, 'rejected', 'Keeble distinguished');
  assert.equal(L.A3, 'undecided', 'A3 needs M8, which is open while the policy standoff holds');
  assert.equal(L.B1, 'undecided');
  assert.equal(r.grounding['claim:M9'].state, 'ambiguous', "the majority's own use of 'possession' is left ambiguous rather than guessed");
});

test('pierson-post branch: making the majority\'s implicit answer explicit flips the holding to established', async () => {
  const { store, commits, branches } = await loadFixture(fixture('pierson-post'));
  assert.equal(commits.length, 2);
  assert.equal(branches['majority-answers-custom'].length, 1);
  assert.equal(store.resolveRef('majority-answers-custom@2'), commits[1].id, 'shared history');
  const cmp = store.compare('main@2', 'majority-answers-custom');
  assert.deepEqual(cmp.diff.units.added.map((u) => u.id).sort(), ['argument:A7', 'argument:A8', 'claim:M12', 'claim:M12c', 'claim:M13', 'claim:M13c']);
  assert.deepEqual(cmp.diff.units.revised, []);
  const text = formatEvaluationDiff(cmp.evaluation);
  assert.match(text, /EVALUATION claim:H \[claim\]: defeated → established/);
  assert.match(text, /EVALUATION argument:B3 \[argument\]: accepted → rejected/);
  assert.match(text, /EVALUATION argument:A1 \[argument\]: rejected → accepted/);
  assert.match(text, /EVALUATION claim:D3 \[claim\]: open → defeated/);
  assert.match(text, /THESIS: defeated → established/);
  const after = store.evaluate('majority-answers-custom').result;
  assert.equal(after.undecided.length, 0, 'no standoff survives once the policy inference is undercut');
  assert.deepEqual(store.verify(branches['majority-answers-custom'][0].id), { ok: true });
});

test('pierson-post compact case compiles to the committed first patch (kept in sync)', () => {
  const dir = fixture('pierson-post');
  const compact = JSON.parse(readFileSync(join(dir, 'source', 'case.json'), 'utf8'));
  const committed = JSON.parse(readFileSync(join(dir, 'commits', '0001-author-case.json'), 'utf8'));
  const compiled = compileCase(compact, { provenance: committed.provenance, message: committed.message });
  assert.equal(contentHash(compiled.operations), contentHash(committed.operations));
});

test('coverage report: formalised share, outside-coverage share and per-dimension tallies', async () => {
  const pp = await coverageReport(fixture('pierson-post'));
  assert.equal(pp.ref, 'main@2');
  assert.equal(pp.units.claims, 26);
  assert.equal(pp.claims.formalised, 6);
  assert.equal(pp.claims.logical.entailed, 6);
  assert.equal(pp.claims.logical.outside_coverage, 20);
  assert.equal(pp.claims.outsideCoverageShare, '76.9%');
  assert.equal(pp.arguments.logical.entailed, 1);
  assert.equal(pp.thesis.status, 'defeated');
  const branch = await coverageReport(fixture('pierson-post'), { branch: 'majority-answers-custom' });
  assert.equal(branch.thesis.status, 'established');
  assert.equal(branch.units.arguments, 12);
  const ai = await coverageReport(fixture('ai-risk'));
  assert.equal(ai.claims.formalised, 0, 'the AI-risk case carries no Logic IR: every claim is outside coverage');
  assert.equal(ai.claims.outsideCoverageShare, '100.0%');
  const first = await coverageReport(fixture('pierson-post'), { commit: 1 });
  assert.equal(first.ref, 'main@1');
  assert.equal(first.thesis.status, 'open');
});
