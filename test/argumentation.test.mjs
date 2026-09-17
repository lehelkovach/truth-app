import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateGrounded, evaluateSnapshot, attackEdges } from '../src/domain/argumentation.mjs';
import { applyPatch, emptySnapshot } from '../src/domain/truth-patch.mjs';
import { claim, argument, attack, patchOf, addUnit, addRelation } from './helpers.mjs';

test('ARG-001 grounded semantics: chain a←b←c', () => {
  const r = evaluateGrounded({ arguments: ['a', 'b', 'c'], attacks: [{ from: 'b', to: 'a' }, { from: 'c', to: 'b' }] });
  assert.deepEqual(r.accepted, ['a', 'c']);
  assert.deepEqual(r.rejected, ['b']);
  assert.deepEqual(r.undecided, []);
  assert.match(r.derivation.b.reason, /attacked by accepted c/);
  assert.match(r.derivation.a.reason, /all attackers rejected/);
});

test('ARG-002 attack cycle leaves the correct undecided set', () => {
  const r = evaluateGrounded({ arguments: ['a', 'b', 'c'], attacks: [{ from: 'a', to: 'b' }, { from: 'b', to: 'a' }, { from: 'a', to: 'c' }] });
  assert.deepEqual(r.undecided, ['a', 'b', 'c']);
  assert.match(r.derivation.a.reason, /standoff/);
  const r2 = evaluateGrounded({ arguments: ['a'], attacks: [{ from: 'a', to: 'a' }] });
  assert.deepEqual(r2.undecided, ['a'], 'self-attack is undecided');
});

test('premise support: an argument on a defeated derived claim is rejected', () => {
  const r = evaluateGrounded({
    arguments: ['a', 'b', 'x'],
    attacks: [{ from: 'x', to: 'a' }],
    premises: { b: ['c1'] },
    supports: { c1: ['a'] },
    independent: new Set()
  });
  assert.deepEqual(r.rejected, ['a', 'b']);
  assert.equal(r.claims.c1, 'defeated');
  assert.match(r.derivation.b.reason, /premise c1 is defeated/);
});

test('undermine expands to every argument using the premise when target is argument:*', () => {
  const ops = [addUnit(claim('P')), addUnit(claim('Q')), addUnit(claim('C1', { basis: 'derived' })), addUnit(claim('C2', { basis: 'derived' })), addUnit(claim('C3', { basis: 'derived' })),
    addUnit(argument('A', ['P'], 'C1')), addUnit(argument('B', ['P'], 'C2')), addUnit(argument('U', ['Q'], 'C3')),
    addRelation({ ...attack('X', 'U', 'A', 'undermine', { targetRef: 'claim:P' }), to: 'argument:*' })];
  const snap = applyPatch(emptySnapshot(), patchOf(ops));
  assert.deepEqual(attackEdges(snap).map((e) => e.to).sort(), ['argument:A', 'argument:B']);
  const r = evaluateSnapshot(snap);
  assert.deepEqual(r.rejected, ['argument:A', 'argument:B']);
  assert.deepEqual(r.accepted, ['argument:U']);
});

test('structural findings: modal overreach, circularity, unsourced evidence, standoff', () => {
  const ops = [addUnit(claim('P', { modality: 'possible' })), addUnit(claim('C', { basis: 'derived', modality: 'certain' })), addUnit(argument('A', ['P'], 'C')),
    addUnit(claim('E', { basis: 'evidence' })), addUnit(claim('D1', { basis: 'derived' })), addUnit(claim('D2', { basis: 'derived' })),
    addUnit(argument('R1', ['D2'], 'D1')), addUnit(argument('R2', ['D1'], 'D2')),
    addUnit(argument('S1', ['E'], 'C')), addUnit(argument('S2', ['E'], 'D1')),
    addRelation(attack('X1', 'S1', 'S2', 'rebut')), addRelation(attack('X2', 'S2', 'S1', 'rebut'))];
  const snap = applyPatch(emptySnapshot(), patchOf(ops));
  const r = evaluateSnapshot(snap);
  const codes = (code) => r.findings.filter((f) => f.code === code);
  assert.equal(codes('MODAL_OVERREACH')[0].argument, 'argument:A');
  assert.equal(codes('MODAL_OVERREACH')[0].severity, 'major');
  assert.deepEqual(codes('CIRCULAR').map((f) => f.argument).sort(), ['argument:R1', 'argument:R2']);
  assert.equal(codes('UNSOURCED_PREMISE').find((f) => f.claim === 'claim:E').severity, 'major');
  assert.equal(codes('STANDOFF').length, 1);
  assert.deepEqual(r.undecided, ['argument:R1', 'argument:R2', 'argument:S1', 'argument:S2'], 'circular pair hangs off the standoff');
  assert.ok(codes('UNCONTESTED').some((f) => f.argument === 'argument:A'));
});

test('DET-001 100 repeated evaluations return the same canonical result', async () => {
  const { loadFixture } = await import('../src/adapters/local-fixture-store.mjs');
  const { contentHash } = await import('../src/domain/canonicalize.mjs');
  const { fixture } = await import('./helpers.mjs');
  const { store, commits } = await loadFixture(fixture('ai-risk'));
  const snap = store.getSnapshot(commits.at(-1).id);
  const first = contentHash(evaluateSnapshot(snap));
  for (let i = 0; i < 100; i += 1) assert.equal(contentHash(evaluateSnapshot(snap)), first);
});
