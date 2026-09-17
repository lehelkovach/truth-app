/**
 * A small text syntax for authoring Logic IR by hand, and projections out of
 * the IR (Prolog / Datalog for the supported subset). The IR is canonical;
 * both directions here are conveniences (spec v1.1 §6.2).
 *
 *   forall x: mammal(x) -> warm_blooded(x)
 *   exists x: mammal(x) & ~bird(x)
 *   mammal(hermione)
 *   a | b, a & b, ~a, (a -> b)
 *
 * Identifiers resolve through `symbols`: a map of name → { uuid, kind }
 * where kind is 'concept' (predicates and concepts) or 'entity'. Unknown
 * identifiers are an error, never guessed.
 */

import { KINDS, and, conceptRef, entityRef, exists, expressionOf, forAll, implies, not, or, predicate, variable, wrapRoot } from './ir.mjs';

const TOKEN = /\s*(forall|exists|->|&|\||~|\(|\)|,|:|[A-Za-z_][A-Za-z0-9_'-]*)/y;

function tokenize(text) {
  const tokens = [];
  let pos = 0;
  while (pos < text.length) {
    TOKEN.lastIndex = pos;
    const m = TOKEN.exec(text);
    if (!m) {
      if (/^\s*$/.test(text.slice(pos))) break;
      throw new SyntaxError(`unexpected input at ${pos}: ${JSON.stringify(text.slice(pos, pos + 12))}`);
    }
    tokens.push(m[1]);
    pos = TOKEN.lastIndex;
  }
  return tokens;
}

export function parseIr(text, symbols = {}) {
  const tokens = tokenize(text);
  let i = 0;
  const bound = new Set();
  const peek = () => tokens[i];
  const take = (expected) => {
    const t = tokens[i];
    if (expected !== undefined && t !== expected) throw new SyntaxError(`expected ${expected} but found ${t ?? 'end'} in ${JSON.stringify(text)}`);
    i += 1;
    return t;
  };
  const resolve = (name) => {
    if (bound.has(name)) return variable(name);
    const sym = symbols[name];
    if (!sym) throw new SyntaxError(`unknown symbol ${name} in ${JSON.stringify(text)}`);
    return sym.kind === 'entity' ? entityRef(sym.uuid) : conceptRef(sym.uuid);
  };
  function quantified() {
    const q = peek();
    if (q === 'forall' || q === 'exists') {
      take();
      const name = take();
      take(':');
      const wasBound = bound.has(name);
      bound.add(name);
      const body = implication();
      if (!wasBound) bound.delete(name);
      return q === 'forall' ? forAll(variable(name), body) : exists(variable(name), body);
    }
    return implication();
  }
  function implication() {
    const left = disjunction();
    if (peek() === '->') { take(); return implies(left, implication()); }
    return left;
  }
  function disjunction() {
    const items = [conjunction()];
    while (peek() === '|') { take(); items.push(conjunction()); }
    return items.length === 1 ? items[0] : or(items);
  }
  function conjunction() {
    const items = [negation()];
    while (peek() === '&') { take(); items.push(negation()); }
    return items.length === 1 ? items[0] : and(items);
  }
  function negation() {
    if (peek() === '~') { take(); return not(negation()); }
    return atom();
  }
  function atom() {
    const t = peek();
    if (t === '(') { take(); const inner = quantified(); take(')'); return inner; }
    if (t === 'forall' || t === 'exists') return quantified();
    const name = take();
    if (name === undefined) throw new SyntaxError(`unexpected end of ${JSON.stringify(text)}`);
    if (peek() === '(') {
      take('(');
      const args = [];
      if (peek() !== ')') {
        args.push(term());
        while (peek() === ',') { take(); args.push(term()); }
      }
      take(')');
      const sym = symbols[name];
      if (!sym) throw new SyntaxError(`unknown predicate ${name} in ${JSON.stringify(text)}`);
      return predicate(conceptRef(sym.uuid), args);
    }
    return resolve(name);
  }
  function term() {
    return resolve(take());
  }
  const expr = quantified();
  if (i < tokens.length) throw new SyntaxError(`trailing input ${tokens.slice(i).join(' ')} in ${JSON.stringify(text)}`);
  return wrapRoot(expr);
}

const prologAtom = (s) => String(s).toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '') || 'x';

/** Prolog projection for the supported subset: facts, negated facts, and universal implications become clauses; anything else is a comment. */
export function toProlog(ir, names = {}) {
  const node = expressionOf(wrapRoot(ir));
  const name = (ref) => prologAtom(names[ref.uuid] ?? ref.uuid);
  const term = (n) => (n.kind === KINDS.Variable ? n.name.toUpperCase() : name(n));
  const atom = (p) => `${name(p.predicate)}(${(p.args || []).map(term).join(', ')})`;
  const lit = (n) => (n.kind === KINDS.Predicate ? atom(n) : n.kind === KINDS.Not && n.of.kind === KINDS.Predicate ? `\\+ ${atom(n.of)}` : null);
  if (node.kind === KINDS.Predicate) return `${atom(node)}.`;
  if (node.kind === KINDS.Not && node.of.kind === KINDS.Predicate) return `% negated fact (Prolog has no negative facts): ${atom(node.of)} is false`;
  const body = node.kind === KINDS.ForAll ? node.body : node;
  if (body.kind === KINDS.Implies && body.then.kind === KINDS.Predicate) {
    const conds = body.if.kind === KINDS.And ? body.if.args : [body.if];
    const lits = conds.map(lit);
    if (lits.every(Boolean)) return `${atom(body.then)} :- ${lits.join(', ')}.`;
  }
  return `% outside the Prolog projection subset: ${JSON.stringify(node)}`;
}

export function toDatalog(ir, names = {}) {
  const out = toProlog(ir, names);
  return out.includes('\\+') ? `% outside the Datalog projection subset (negation): ${out}` : out;
}
