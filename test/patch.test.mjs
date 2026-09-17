import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyPatch, emptySnapshot, unitsOfKind, liveRelations } from '../src/domain/truth-patch.mjs';
import { contentHash } from '../src/domain/canonicalize.mjs';
import { claim, argument, attack, patchOf, addUnit, addRelation } from './helpers.mjs';

const base = () => applyPatch(emptySnapshot(), patchOf([addUnit(claim('P')), addUnit(claim('C', { basis: 'derived' })), addUnit(argument('A', ['P'], 'C'))]));

test('applyPatch never mutates its input and bumps revisions', () => {
  const s1 = base();
  const h1 = contentHash(s1.units);
  const s2 = applyPatch(s1, patchOf([{ op: 'reviseUnit', target: { id: 'claim:P', revision: 1 }, next: { text: 'revised' } }]));
  assert.equal(contentHash(s1.units), h1, 'REV-001 earlier snapshot unchanged');
  assert.equal(s1.units['claim:P'].text, 'claim P');
  assert.equal(s2.units['claim:P'].text, 'revised');
  assert.equal(s1.revisions['claim:P'].revision, 1);
  assert.equal(s2.revisions['claim:P'].revision, 2);
  assert.notEqual(s1.revisions['claim:P'].contentHash, s2.revisions['claim:P'].contentHash);
  assert.ok(Object.isFrozen(s2.units['claim:P']));
});

test('reviseUnit cannot change id or kind and checks the expected revision', () => {
  const s1 = base();
  const s2 = applyPatch(s1, patchOf([{ op: 'reviseUnit', target: { id: 'claim:P' }, next: { id: 'claim:Z', kind: 'source', text: 't' } }]));
  assert.equal(s2.units['claim:P'].id, 'claim:P');
  assert.equal(s2.units['claim:P'].kind, 'claim');
  assert.throws(() => applyPatch(s1, patchOf([{ op: 'reviseUnit', target: { id: 'claim:P', revision: 7 }, next: { text: 'x' } }])), /revision 1, patch targets 7/);
  assert.throws(() => applyPatch(s1, patchOf([addUnit(claim('P'))])), /already exists/);
  assert.throws(() => applyPatch(s1, patchOf([{ op: 'retractUnit', target: { id: 'claim:Nope' } }])), /does not exist/);
});

test('retracted units and relations drop out of live views', () => {
  const s1 = applyPatch(base(), patchOf([addUnit(argument('B', ['P'], 'C')), addRelation(attack('X', 'B', 'A'))]));
  assert.equal(liveRelations(s1).length, 1);
  const s2 = applyPatch(s1, patchOf([{ op: 'retractRelation', target: { id: 'rel:X' }, reason: 'withdrawn' }, { op: 'retractUnit', target: { id: 'argument:B' } }]));
  assert.equal(liveRelations(s2).length, 0);
  assert.deepEqual(unitsOfKind(s2, 'argument').map((a) => a.id), ['argument:A']);
  assert.equal(s2.units['argument:B'].status, 'retracted');
});
