/**
 * Deterministic canonical form and content hashing.
 *
 *   contentHash = sha256(utf8(JSON.stringify(canonicalize(unit))))
 *
 * Canonicalisation sorts object keys recursively, drops `undefined` values and
 * leaves arrays in order (order is semantic for premise lists). Two structurally
 * equal values therefore serialise to the same bytes whatever key order they
 * were authored in.
 */

import { createHash } from 'node:crypto';

export function canonicalize(value) {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(canonicalize);
  const out = {};
  for (const key of Object.keys(value).sort()) {
    const v = value[key];
    if (v === undefined) continue;
    out[key] = canonicalize(v);
  }
  return out;
}

export function serialize(value) {
  return JSON.stringify(canonicalize(value));
}

export function contentHash(value) {
  return `sha256:${createHash('sha256').update(serialize(value), 'utf8').digest('hex')}`;
}

export function shortHash(hash, length = 12) {
  return hash.replace(/^sha256:/, '').slice(0, length);
}

/** Recursively freeze a value so accepted revisions cannot be mutated in place. */
export function deepFreeze(value) {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const key of Object.keys(value)) deepFreeze(value[key]);
  return value;
}

export function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}
