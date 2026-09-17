/**
 * Identifier helpers. Every semantic reference is `<kind>:<name>`, e.g.
 * `claim:P1`, `argument:B9`, `rel:X4`, `commit:3f9a…`.
 */

const REF_RE = /^[a-z]+:[A-Za-z0-9_.-]+$/;

export function isRef(value) {
  return typeof value === 'string' && REF_RE.test(value);
}

export function parseRef(ref) {
  if (!isRef(ref)) throw new TypeError(`not a ref: ${String(ref)}`);
  const i = ref.indexOf(':');
  return { kind: ref.slice(0, i), name: ref.slice(i + 1) };
}

export function makeRef(kind, name) {
  const ref = `${kind}:${name}`;
  if (!isRef(ref)) throw new TypeError(`invalid ref parts: ${kind}, ${name}`);
  return ref;
}

export function refKind(ref) {
  return parseRef(ref).kind;
}

export function refName(ref) {
  return parseRef(ref).name;
}
