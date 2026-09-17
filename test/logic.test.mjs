import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { canonicalize, hashIr, render, serialize, validate, inspectBindings, strictEvaluate, conceptRef, entityRef, variable, predicate, implies, forAll, and, not } from '../src/logic/ir.mjs';
import { parseIr, toProlog, toDatalog } from '../src/logic/text.mjs';
import { buildKb, claimExpression, groundingState } from '../src/logic/kb.mjs';
import { saturate, evaluateFormula, entails, evaluateClaim, TRUTH, LOGIC_RESULT } from '../src/logic/evaluate.mjs';
import { applyPatch, emptySnapshot } from '../src/domain/truth-patch.mjs';
import { patchOf, addUnit, prov } from './helpers.mjs';

const vectors = JSON.parse(readFileSync(new URL('./vectors/logic-ir-ksg.json', import.meta.url), 'utf8'));

test('LOGIC-000 mirror is byte-compatible with KSG core.js on canonical form, hash and rendering', () => {
  for (const [name, v] of Object.entries(vectors)) {
    assert.equal(serialize(canonicalize(v.ir)), v.canonical, `${name} canonical`);
    assert.equal(hashIr(v.ir), v.hash, `${name} hash`);
    assert.equal(render(v.ir, v.names), v.rendering, `${name} rendering`);
  }
});

test('LOGIC-001 validation codes match the handoff (E004 ref, E005 arity, E006 malformed) and bindings E001-E003', () => {
  assert.ok(validate({ logicIrVersion: '0.0.1', kind: 'Predicate', predicate: conceptRef(''), args: [] }).diagnostics.some((d) => d.code === 'E004'));
  assert.ok(validate({ logicIrVersion: '0.0.1', kind: 'Predicate', predicate: conceptRef('P'), args: 'x' }).diagnostics.some((d) => d.code === 'E005'));
  assert.ok(validate({ logicIrVersion: '0.0.1', kind: 'ModalBox', body: variable('x') }).diagnostics.some((d) => d.code === 'E006'));
  assert.equal(inspectBindings([{ symbol: 'God', resolved: false }]).diagnostics[0].code, 'E001');
  assert.equal(inspectBindings([{ symbol: 'God', candidates: ['a', 'b'] }]).diagnostics[0].code, 'E002');
  assert.equal(inspectBindings([{ symbol: 'h', targetUuid: 'a' }, { symbol: 'h', targetUuid: 'b' }]).diagnostics[0].code, 'E003');
  assert.equal(strictEvaluate({ ir: null, bindings: [{ symbol: 'God', resolved: false }] }).decision, 'unresolved');
});

const syms = { mammal: { uuid: 'concept:mammal', kind: 'concept' }, warm_blooded: { uuid: 'concept:wb', kind: 'concept' }, bird: { uuid: 'concept:bird', kind: 'concept' }, hermione: { uuid: 'concept:hermione', kind: 'entity' } };

test('LOGIC-002 text syntax parses to the same IR as the constructors; Prolog/Datalog projections', () => {
  const x = variable('x');
  const expected = forAll(x, implies(predicate(conceptRef('concept:mammal'), [x]), predicate(conceptRef('concept:wb'), [x])));
  assert.equal(hashIr(parseIr('forall x: mammal(x) -> warm_blooded(x)', syms)), hashIr(expected));
  assert.equal(hashIr(parseIr('mammal(hermione) & ~bird(hermione)', syms)), hashIr(and([predicate(conceptRef('concept:mammal'), [entityRef('concept:hermione')]), not(predicate(conceptRef('concept:bird'), [entityRef('concept:hermione')]))])));
  assert.throws(() => parseIr('mammal(crookshanks)', syms), /unknown symbol crookshanks/);
  assert.throws(() => parseIr('mammal(hermione) ->', syms), /unexpected end/);
  const names = { 'concept:mammal': 'mammal', 'concept:wb': 'warm-blooded', 'concept:hermione': 'Hermione' };
  assert.equal(toProlog(parseIr('forall x: mammal(x) -> warm_blooded(x)', syms), names), 'warm_blooded(X) :- mammal(X).');
  assert.equal(toProlog(parseIr('mammal(hermione)', syms), names), 'mammal(hermione).');
  assert.match(toDatalog(parseIr('forall x: mammal(x) & ~bird(x) -> warm_blooded(x)', syms), names), /outside the Datalog projection subset/);
});

const concept = (key, kind = 'concept', label = key) => ({ id: `concept:${key}`, kind: 'concept', status: 'accepted', provenance: prov, label, conceptKind: kind });
const fclaim = (id, text, logic, terms, extra = {}) => ({ id: `claim:${id}`, kind: 'claim', status: 'accepted', provenance: prov, text, claimKind: 'empirical', modality: 'certain', basis: 'assumption', logicIr: parseIr(logic, syms), terms, ...extra });
const T = (symbol, key) => ({ symbol, conceptRef: `concept:${key}` });
const world = () => applyPatch(emptySnapshot(), patchOf([
  addUnit(concept('mammal')), addUnit(concept('wb', 'concept', 'warm-blooded')), addUnit(concept('bird')), addUnit(concept('hermione', 'entity', 'Hermione')),
  addUnit(fclaim('C1', 'Every mammal is warm-blooded.', 'forall x: mammal(x) -> warm_blooded(x)', [T('mammal', 'mammal'), T('warm-blooded', 'wb')])),
  addUnit(fclaim('C2', 'Hermione is a mammal.', 'mammal(hermione)', [T('Hermione', 'hermione'), T('mammal', 'mammal')])),
  addUnit(fclaim('C3', 'Hermione is warm-blooded.', 'warm_blooded(hermione)', [T('Hermione', 'hermione'), T('warm-blooded', 'wb')], { basis: 'derived' })),
  addUnit(fclaim('C4', 'Hermione is a bird.', 'bird(hermione)', [T('Hermione', 'hermione'), T('bird', 'bird')], { basis: 'derived' })),
  addUnit(fclaim('C5', 'Hermione is not a bird.', '~bird(hermione)', [T('Hermione', 'hermione'), T('bird', 'bird')])),
  addUnit({ id: 'argument:A1', kind: 'argument', status: 'accepted', provenance: prov, title: 'wb', premiseRefs: ['claim:C1', 'claim:C2'], conclusionRef: 'claim:C3', scheme: 'deductive', warrant: 'UMP' }),
  addUnit({ id: 'argument:A2', kind: 'argument', status: 'accepted', provenance: prov, title: 'bird', premiseRefs: ['claim:C1', 'claim:C2'], conclusionRef: 'claim:C4', scheme: 'deductive', warrant: 'nope' }),
  addUnit({ id: 'argument:A3', kind: 'argument', status: 'accepted', provenance: prov, title: 'contra', premiseRefs: ['claim:C5'], conclusionRef: 'claim:C4', scheme: 'deductive', warrant: 'nope' })
]));

test('LOGIC-003 forward chaining derives with provenance; three-valued evaluation; unknown is never false', () => {
  const snap = world();
  const kb = buildKb(snap, { claimIds: ['claim:C1', 'claim:C2'] });
  assert.equal(kb.rules.length, 1);
  assert.equal(kb.facts.length, 1);
  const sat = saturate(kb);
  assert.equal(sat.complete, true);
  const derived = [...sat.store.values()].find((v) => v.derivation.rule === 'universal_modus_ponens');
  assert.ok(derived, 'warm_blooded(hermione) derived');
  assert.deepEqual(derived.derivation.from.slice(0, 1), ['claim:C1']);
  assert.equal(evaluateFormula(parseIr('warm_blooded(hermione)', syms), sat, kb).truth, TRUTH.TRUE);
  assert.equal(evaluateFormula(parseIr('bird(hermione)', syms), sat, kb).truth, TRUTH.UNKNOWN, 'absence is unknown');
  assert.equal(evaluateFormula(parseIr('~bird(hermione)', syms), sat, kb).truth, TRUTH.UNKNOWN, 'negation of unknown is unknown');
  assert.equal(evaluateFormula(parseIr('mammal(hermione) & bird(hermione)', syms), sat, kb).truth, TRUTH.UNKNOWN);
  assert.equal(evaluateFormula(parseIr('mammal(hermione) | bird(hermione)', syms), sat, kb).truth, TRUTH.TRUE);
  assert.equal(evaluateFormula(parseIr('forall x: mammal(x) -> warm_blooded(x)', syms), sat, kb).truth, TRUTH.TRUE, 'quantifier over the snapshot domain');
  assert.equal(evaluateFormula(parseIr('exists x: bird(x)', syms), sat, kb).truth, TRUTH.UNKNOWN);
});

test('LOGIC-004 entails: entailed with proof, not_entailed with missing condition, contradicted, outside coverage', () => {
  const snap = world();
  const a1 = entails(snap, snap.units['argument:A1']);
  assert.equal(a1.result, LOGIC_RESULT.ENTAILED);
  assert.deepEqual(a1.proof.map((s) => s.rule), ['fact', 'universal_modus_ponens']);
  assert.match(a1.proof.at(-1).expression, /warm-blooded\(Hermione\)/);
  const a2 = entails(snap, snap.units['argument:A2']);
  assert.equal(a2.result, LOGIC_RESULT.NOT_ENTAILED);
  assert.ok(a2.missingCondition.hints.some((h) => /mammal\(x\) → bird\(x\)/.test(h)), JSON.stringify(a2.missingCondition));
  const a3 = entails(snap, snap.units['argument:A3']);
  assert.equal(a3.result, LOGIC_RESULT.CONTRADICTED);
  const informal = applyPatch(snap, patchOf([addUnit({ id: 'claim:C9', kind: 'claim', status: 'accepted', provenance: prov, text: 'Cats are nice.', claimKind: 'normative', modality: 'plausible', basis: 'assumption' }), addUnit({ id: 'argument:A4', kind: 'argument', status: 'accepted', provenance: prov, title: 'x', premiseRefs: ['claim:C9'], conclusionRef: 'claim:C3', scheme: 'inductive', warrant: 'w' })]));
  const a4 = entails(informal, informal.units['argument:A4']);
  assert.equal(a4.result, LOGIC_RESULT.OUTSIDE_COVERAGE);
  assert.equal(a4.missing[0].claim, 'claim:C9');
});

test('LOGIC-005 unresolved or ambiguous grounding blocks evaluation instead of guessing', () => {
  const snap = world();
  const c = { ...snap.units['claim:C2'], terms: [{ symbol: 'Hermione' }, T('mammal', 'mammal')] };
  assert.equal(groundingState(c), 'unresolved');
  const s2 = applyPatch(snap, patchOf([{ op: 'reviseUnit', target: { id: 'claim:C2' }, next: { terms: c.terms } }]));
  assert.equal(entails(s2, s2.units['argument:A1']).result, LOGIC_RESULT.OUTSIDE_COVERAGE);
  assert.equal(evaluateClaim(s2, 'claim:C2').result, LOGIC_RESULT.OUTSIDE_COVERAGE);
});

test('LOGIC-006 proposition-centric shape compiles to a predicate; polarity to negation', () => {
  const snap = world();
  const claim = { ...snap.units['claim:C4'], logicIr: undefined, proposition: { predicateRef: 'concept:bird', roles: { subject: 'concept:hermione' }, polarity: 'negative' } };
  const ex = claimExpression(claim, snap);
  assert.equal(ex.from, 'proposition');
  assert.equal(render(ex.ir, { 'concept:bird': 'bird', 'concept:hermione': 'Hermione' }), '¬bird(Hermione)');
});
