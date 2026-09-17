import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFixture } from '../src/adapters/local-fixture-store.mjs';
import { applyPatch, emptySnapshot } from '../src/domain/truth-patch.mjs';
import { assertValidPatch, patchSchemaProblems, snapshotProblems, unitSchemaProblems, relationSchemaProblems } from '../src/domain/validate.mjs';
import { fixture, claim, argument, attack, patchOf, addUnit, addRelation, prov } from './helpers.mjs';

test('SCHEMA-001 fixture patches validate and apply', () => {
  for (const name of ['ai-risk', 'exercise-depression']) {
    const { patches } = readFixture(fixture(name));
    let snap = emptySnapshot();
    for (const { patch } of patches) {
      assert.deepEqual(patchSchemaProblems(patch), []);
      snap = applyPatch(snap, patch);
    }
    assert.deepEqual(snapshotProblems(snap), []);
  }
});

test('SCHEMA-002 malformed refs and unknown fields are rejected', () => {
  assert.ok(unitSchemaProblems({ ...claim('A'), id: 'no-colon' }).length > 0);
  assert.ok(unitSchemaProblems({ ...claim('A'), modality: 'very-sure' }).length > 0);
  assert.ok(relationSchemaProblems({ ...attack('X', 'A', 'B'), extra: 1 }).length > 0);
  assert.ok(patchSchemaProblems({ patchVersion: '0.2', message: 'x', operations: [] }).length > 0);
  assert.throws(() => assertValidPatch(patchOf([{ op: 'explode' }])), /patch is not valid/);
});

test('SCHEMA-003 referential invariants: dangling premise, wrong kind, undermine target', () => {
  const snap = applyPatch(emptySnapshot(), patchOf([addUnit(claim('P')), addUnit(claim('C', { basis: 'derived' })), addUnit(argument('A', ['P'], 'C'))]));
  assert.deepEqual(snapshotProblems(snap), []);
  assert.throws(() => applyPatch(snap, patchOf([addUnit(argument('B', ['Q'], 'C'))])), /premise claim:Q does not resolve/);
  assert.throws(() => applyPatch(snap, patchOf([addRelation(attack('X', 'A', 'A'))])), /itself/);
  assert.throws(() => applyPatch(snap, patchOf([addUnit(argument('B', ['P'], 'C')), addRelation(attack('X', 'B', 'A', 'undermine', { targetRef: 'claim:C' }))])), /not a premise/);
  assert.throws(() => applyPatch(snap, patchOf([{ op: 'retractUnit', target: { id: 'claim:P' } }])), /does not resolve to a live unit/);
});

test('annotation must point at a premise of its target when it names one', () => {
  const ann = { id: 'annotation:f1', kind: 'annotation', status: 'accepted', provenance: prov, annotationType: 'fallacy', targetRef: 'argument:A', name: 'equivocation', where: 'premise:claim:Q', text: 'x' };
  const base = patchOf([addUnit(claim('P')), addUnit(claim('C', { basis: 'derived' })), addUnit(argument('A', ['P'], 'C'))]);
  const snap = applyPatch(emptySnapshot(), base);
  assert.throws(() => applyPatch(snap, patchOf([addUnit(ann)])), /not a premise of argument:A/);
});
