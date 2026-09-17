import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canonicalize, contentHash, serialize, deepFreeze } from '../src/domain/canonicalize.mjs';

test('REV-002 hash is independent of key order and undefined fields', () => {
  const a = { z: 1, a: { y: [3, { q: 1, p: 2 }], x: 'x' }, u: undefined };
  const b = { a: { x: 'x', y: [3, { p: 2, q: 1 }] }, z: 1 };
  assert.equal(serialize(a), serialize(b));
  assert.equal(contentHash(a), contentHash(b));
  assert.match(contentHash(a), /^sha256:[a-f0-9]{64}$/);
});

test('array order is semantic', () => {
  assert.notEqual(contentHash({ premises: ['a', 'b'] }), contentHash({ premises: ['b', 'a'] }));
});

test('canonicalize sorts keys recursively', () => {
  assert.deepEqual(Object.keys(canonicalize({ b: 1, a: { d: 1, c: 2 } }).a), ['c', 'd']);
});

test('deepFreeze makes nested values immutable', () => {
  const v = deepFreeze({ a: { b: [1] } });
  assert.throws(() => { v.a.b.push(2); });
  assert.throws(() => { v.a.c = 1; });
});
