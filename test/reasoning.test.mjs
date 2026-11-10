import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadFixture } from '../src/adapters/local-fixture-store.mjs';
import { reasoningReport, formatReasoning, VERDICT } from '../src/services/reasoning.mjs';
import { buildBundle } from '../src/services/bundle.mjs';
import { compileCase } from '../src/domain/authoring.mjs';
import { contentHash } from '../src/domain/canonicalize.mjs';
import { compose } from '../src/services/compose.mjs';
import { FALLACIES } from '../src/domain/fallacies.mjs';
import { fixture } from './helpers.mjs';

async function primer() {
  const { store, commits, project } = await loadFixture(fixture('reasoning-primer'));
  const id = commits.at(-1).id;
  const snapshot = store.getSnapshot(id);
  const evaluation = store.evaluate(id);
  const rep = reasoningReport(snapshot, evaluation.result);
  const A = Object.fromEntries(rep.arguments.map((a) => [a.short, a]));
  const C = Object.fromEntries(rep.claims.map((c) => [c.short, c]));
  return { store, project, snapshot, evaluation, rep, A, C };
}

test('REASON-001 valid syllogisms: both engines agree and name the rule', async () => {
  const { A } = await primer();
  assert.equal(A.A1.verdict, VERDICT.VALID);
  assert.equal(A.A1.inference.decision, 'valid');
  assert.equal(A.A1.inference.rule, 'universal_modus_ponens');
  assert.equal(A.A1.entailment.result, 'entailed');
  assert.ok(A.A1.entailment.proof.length >= 2, 'a fact and a UMP step');
  assert.ok(A.A1.entailment.proof.some((s) => s.rule === 'universal_modus_ponens'));
  assert.match(A.A1.headline, /universal modus ponens/);
  assert.equal(A.A2.verdict, VERDICT.VALID);
  assert.equal(A.A2.inference.rule, 'modus_ponens');
  assert.equal(A.A2.entailment.result, 'entailed');
});

test('REASON-002 hypothetical syllogism: proved by rule; the model-checker has no entities for a universal conclusion', async () => {
  const { A } = await primer();
  assert.equal(A.A3.verdict, VERDICT.VALID);
  assert.equal(A.A3.inference.rule, 'hypothetical_syllogism');
  assert.equal(A.A3.entailment.result, 'not_entailed');
  assert.equal(A.A3.entailment.domainSize, 0);
  assert.ok(A.A3.notes.some((n) => /no entities/.test(n)), 'the disagreement is explained');
});

test('REASON-003 a two-step chain: forward chaining derives it where the single-step core cannot', async () => {
  const { A } = await primer();
  assert.equal(A.A4.verdict, VERDICT.VALID);
  assert.equal(A.A4.inference.decision, 'invalid', "KSG's core needs one rule application");
  assert.equal(A.A4.entailment.result, 'entailed');
  assert.ok(A.A4.entailment.proof.length >= 3, 'fact + two universal modus ponens steps');
  assert.ok(A.A4.notes.some((n) => /forward chaining/.test(n)));
});

test('REASON-004 formal fallacies are invalid under both engines and carry their name', async () => {
  const { A } = await primer();
  for (const [id, name] of [['A5', 'affirming_the_consequent'], ['A6', 'denying_the_antecedent'], ['A7', 'undistributed_middle']]) {
    assert.equal(A[id].verdict, VERDICT.INVALID, id);
    assert.equal(A[id].inference.decision, 'invalid', id);
    assert.equal(A[id].entailment.result, 'not_entailed', id);
    assert.equal(A[id].fallacies[0].name, name, id);
    assert.ok(A[id].fallacies[0].catalogue, `${name} is in the catalogue`);
    assert.equal(A[id].fallacies[0].catalogue.category, 'formal');
    assert.match(A[id].headline, new RegExp(name.replace(/_/g, ' ')));
  }
  // The missing condition points at the gap: wise(x) does not give philosopher(x).
  assert.ok(A.A5.entailment.missingCondition.hints.some((h) => /wise\(x\) → philosopher\(x\)/.test(h)), JSON.stringify(A.A5.entailment.missingCondition));
});

test('REASON-005 equivocation is caught structurally: W001 major, two concepts for one word, not entailed', async () => {
  const { A } = await primer();
  assert.equal(A.A8.verdict, VERDICT.INVALID);
  assert.equal(A.A8.inference.decision, 'invalid');
  assert.equal(A.A8.entailment.result, 'not_entailed');
  const w = A.A8.groundingFindings.find((f) => f.code === 'W001');
  assert.ok(w, 'W001 fires');
  assert.equal(w.severity, 'major');
  assert.match(w.message, /'bank' is grounded to 2 different concepts/);
  assert.ok(A.A8.fallacies.some((f) => f.name === 'equivocation'));
  assert.ok(A.A8.entailment.missingCondition.hints.some((h) => /financial bank\(x\) → sloped\(x\)/.test(h)));
  assert.deepEqual(A.A8.concepts.predicates.map((c) => c.label).sort(), ['financial bank', 'riverbank', 'sloped']);
});

test('REASON-006 an inductive leap is not deducible: a boundary, not a defeat', async () => {
  const { A } = await primer();
  assert.equal(A.A9.verdict, VERDICT.NOT_DEDUCIBLE);
  assert.equal(A.A9.scheme, 'inductive');
  assert.equal(A.A9.inference.decision, 'unresolved');
  assert.equal(A.A9.entailment.result, 'outside_coverage');
  assert.equal(A.A9.fallacies[0].name, 'hasty_generalization');
  assert.match(A.A9.headline, /inductive/);
});

test('REASON-007 summary counts and the separation of validity from standing', async () => {
  const { rep, A } = await primer();
  assert.equal(rep.summary.arguments, 9);
  assert.equal(rep.summary.valid, 4);
  assert.equal(rep.summary.invalid, 4);
  assert.equal(rep.summary.not_deducible, 1);
  assert.equal(rep.summary.contradicted, 0);
  assert.equal(rep.summary.schemes.deductive, 8);
  // Standing is reported beside validity, never folded in.
  assert.ok(A.A1.standing.label, 'A1 has an argumentation label');
  assert.ok(A.A1.premises.every((p) => 'standing' in p));
});

test('REASON-008 terms: subjects and predicates with definitions, local until pushed to KnowShowGo', async () => {
  const { A, rep } = await primer();
  const soc = A.A1.concepts.subjects.find((c) => c.label === 'Socrates');
  assert.ok(soc, 'Socrates is a subject');
  assert.match(soc.definition, /Athenian philosopher/);
  assert.equal(soc.binding, 'local');
  const human = A.A1.concepts.predicates.find((c) => c.label === 'human');
  assert.match(human.definition, /Homo sapiens/);
  assert.equal(rep.concepts.length, 17);
  assert.ok(rep.concepts.every((c) => c.definition));
});

test('REASON-009 claims table: Logic IR, Prolog projection, KSG prototype cast, derivations', async () => {
  const { C } = await primer();
  assert.equal(C.C1.prolog, 'mortal(X) :- human(X).');
  assert.equal(C.C3.prolog, 'mortal(socrates).');
  assert.equal(C.C3.ksgCast, 'Proposition');
  assert.deepEqual(C.C3.concludedBy, ['A1', 'A4']);
  assert.equal(C.H2.hasLogic, false);
  assert.equal(C.H2.ksgCast, 'Utterance');
  assert.equal(C.E1.grounding, 'resolved');
  assert.equal(C.F2.ir.startsWith('¬') || C.F2.ir.startsWith('~') || /not/i.test(C.F2.ir), true, C.F2.ir);
});

test('REASON-010 the text rendering carries verdicts, rules, proofs and fallacies', async () => {
  const { rep } = await primer();
  const text = formatReasoning(rep, { all: true });
  assert.match(text, /A1\s+VALID/);
  assert.match(text, /universal modus ponens/);
  assert.match(text, /proof: d1/);
  assert.match(text, /A5\s+INVALID/);
  assert.match(text, /fallacy: affirming_the_consequent/);
  assert.match(text, /A9\s+NOT DEDUCIBLE/);
  assert.match(text, /W001/);
  assert.match(text, /KSG cast Proposition/);
});

test('REASON-011 the bundle carries the report per commit', async () => {
  const { store, project } = await primer();
  const b = buildBundle({ store, project });
  assert.equal(b.commits[0].reasoning.summary.arguments, 9);
  assert.equal(b.commits[0].reasoning.arguments.find((a) => a.short === 'A1').verdict, 'valid');
});

test('REASON-012 fixture sources stay in sync: compact case → committed patch; composer twin → same units', async () => {
  const dir = fixture('reasoning-primer');
  const compact = JSON.parse(readFileSync(join(dir, 'source', 'case.json'), 'utf8'));
  const committed = JSON.parse(readFileSync(join(dir, 'commits', '0001-reasoning-primer.json'), 'utf8'));
  const compiled = compileCase(compact, { provenance: committed.provenance, message: committed.message });
  assert.equal(contentHash(compiled.operations), contentHash(committed.operations));
  const t = compose(readFileSync(join(dir, 'source', 'case.truth'), 'utf8'));
  assert.equal(t.ok, true, JSON.stringify(t.diagnostics.filter((d) => d.state === 'red')));
  const { snapshot } = await primer();
  const ids = (u) => Object.keys(u).filter((k) => !k.startsWith('issue:')).sort();
  assert.deepEqual(ids(t.snapshot.units), ids(snapshot.units));
});

test('REASON-013 formal fallacies joined the catalogue', () => {
  for (const n of ['affirming_the_consequent', 'denying_the_antecedent', 'undistributed_middle', 'non_sequitur']) assert.equal(FALLACIES[n].category, 'formal', n);
  assert.equal(FALLACIES.non_sequitur.code, 'LOGIC_NOT_ENTAILED');
});

test('REASON-014 regression: hermione — the syllogism is valid, "has fur" is invalid', async () => {
  const { store, commits } = await loadFixture(fixture('hermione'));
  const id = commits.at(-1).id;
  const rep = reasoningReport(store.getSnapshot(id), store.evaluate(id).result);
  const A = Object.fromEntries(rep.arguments.map((a) => [a.short, a]));
  assert.equal(A.A1.verdict, 'valid');
  assert.equal(A.A2.verdict, 'invalid');
  assert.match(A.A2.entailment.missingCondition.hints.join(' '), /warm-blooded\(x\) → has fur\(x\)/);
});
