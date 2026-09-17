/**
 * Native deterministic evaluator (spec v1.1 §7 "Native deterministic
 * evaluator", §6.1 subset, §22.1 acceptance).
 *
 * - Facts and rules come from the KB (`kb.mjs`). Forward chaining derives new
 *   ground facts with universal modus ponens, modus ponens and conjunction,
 *   bounded (`maxRounds`), and every derived fact carries a derivation.
 * - Formulas are evaluated three-valued (Kleene). Absence is `unknown`, never
 *   `false`; `false` needs an explicit negated fact or a derivation of ¬A.
 * - Quantifiers range over the entities the snapshot mentions. That is a
 *   closed, enumerable domain, so unlike KSG's KG1 (which refuses ∀ because
 *   its domain would be a top-K sample) this evaluator answers, and says so
 *   with `domain: 'snapshot'` on the result.
 * - `entails(premises, conclusion)` is the argument check: KB from the
 *   premises only; `entailed` when the conclusion evaluates true, `contradicted`
 *   when false, `not_entailed` when unknown, `outside_coverage` when any side
 *   has no usable expression. A proof is the derivation chain behind the atoms
 *   the conclusion consulted.
 */

import { KINDS, expressionOf, hashIr, render, serialize } from './ir.mjs';
import { bareNode, buildKb, claimExpression, groundingState } from './kb.mjs';

export const NATIVE_EVALUATOR_ID = 'logic.native';
export const NATIVE_EVALUATOR_VERSION = '0.1.0';
export const TRUTH = Object.freeze({ TRUE: 'true', FALSE: 'false', UNKNOWN: 'unknown' });
export const LOGIC_RESULT = Object.freeze({ ENTAILED: 'entailed', CONTRADICTED: 'contradicted', NOT_ENTAILED: 'not_entailed', OUTSIDE_COVERAGE: 'outside_coverage' });
export const RULE = Object.freeze({ FACT: 'fact', UMP: 'universal_modus_ponens', MP: 'modus_ponens', CONJ_ELIM: 'conjunction_elimination', CONJ_INTRO: 'conjunction_introduction', REITERATION: 'reiteration' });

const key = (node) => serialize(node);

function isGround(node) {
  if (!node || typeof node !== 'object') return true;
  if (node.kind === KINDS.Variable) return false;
  if (node.kind === KINDS.Predicate) return (node.args || []).every(isGround);
  if (node.kind === KINDS.Not) return isGround(node.of);
  if (node.kind === KINDS.And || node.kind === KINDS.Or) return node.args.every(isGround);
  if (node.kind === KINDS.Implies) return isGround(node.if) && isGround(node.then);
  return true;
}

function substitute(node, env) {
  if (!node || typeof node !== 'object') return node;
  if (node.kind === KINDS.Variable) return env[node.name] ? JSON.parse(JSON.stringify(env[node.name])) : node;
  if (Array.isArray(node)) return node.map((n) => substitute(n, env));
  const out = {};
  for (const [k, v] of Object.entries(node)) out[k] = k === 'kind' || k === 'name' || k === 'uuid' || k === 'logicIrVersion' ? v : substitute(v, env);
  return out;
}

function unify(pattern, fact, env) {
  if (!pattern || !fact) return null;
  if (pattern.kind === KINDS.Variable) {
    if (env[pattern.name]) return key(env[pattern.name]) === key(fact) ? env : null;
    return { ...env, [pattern.name]: fact };
  }
  if (pattern.kind !== fact.kind) return null;
  if (pattern.kind === KINDS.ConceptRef || pattern.kind === KINDS.EntityRef) return pattern.uuid === fact.uuid ? env : null;
  if (pattern.kind === KINDS.Predicate) {
    if (pattern.predicate.uuid !== fact.predicate.uuid || (pattern.args || []).length !== (fact.args || []).length) return null;
    let e = env;
    for (let i = 0; i < pattern.args.length; i += 1) { e = unify(pattern.args[i], fact.args[i], e); if (!e) return null; }
    return e;
  }
  if (pattern.kind === KINDS.Not) return unify(pattern.of, fact.of, env);
  return key(pattern) === key(fact) ? env : null;
}

/** Split a rule into { vars, if: [literals], then } where literals are ground-able predicates or negations. */
function ruleParts(node) {
  const vars = [];
  let body = node;
  while (body.kind === KINDS.ForAll) { vars.push(body.variable.name); body = expressionOf(body.body); }
  if (body.kind !== KINDS.Implies) return null;
  const conds = body.if.kind === KINDS.And ? body.if.args : [body.if];
  if (!conds.every((c) => c.kind === KINDS.Predicate || (c.kind === KINDS.Not && c.of.kind === KINDS.Predicate))) return null;
  const heads = body.then.kind === KINDS.And ? body.then.args : [body.then];
  if (!heads.every((h) => h.kind === KINDS.Predicate || (h.kind === KINDS.Not && h.of.kind === KINDS.Predicate))) return null;
  return { vars, if: conds, then: heads };
}

/**
 * Forward-chain to a bounded fixpoint. Returns a fact store: Map key → { node, derivation }.
 */
export function saturate(kb, { maxRounds = 50 } = {}) {
  const store = new Map();
  const add = (node, derivation) => {
    const k = key(node);
    if (store.has(k)) return false;
    store.set(k, { node, derivation, id: `d${store.size + 1}` });
    return true;
  };
  for (const f of kb.facts) {
    const n = f.node;
    if (n.kind === KINDS.And) {
      for (const part of n.args) add(bareNode(part), { rule: RULE.CONJ_ELIM, from: [f.id], claim: f.id });
      add(n, { rule: RULE.FACT, from: [f.id], claim: f.id });
    } else add(n, { rule: RULE.FACT, from: [f.id], claim: f.id });
  }
  const parsed = kb.rules.map((r) => ({ id: r.id, parts: ruleParts(r.node), node: r.node })).filter((r) => r.parts);
  const unparsed = kb.rules.filter((r) => !ruleParts(r.node)).map((r) => r.id);
  let rounds = 0;
  let complete = false;
  while (rounds < maxRounds) {
    rounds += 1;
    let changed = false;
    const ground = [...store.values()].map((v) => v.node);
    for (const rule of parsed) {
      const { vars, if: conds, then } = rule.parts;
      const match = (idx, env, used) => {
        if (idx === conds.length) {
          for (const head of then) {
            const derived = substitute(head, env);
            if (!isGround(derived)) continue;
            if (add(bareNode(derived), { rule: vars.length ? RULE.UMP : RULE.MP, from: [rule.id, ...used], substitution: Object.fromEntries(Object.entries(env).map(([k, v]) => [k, v.uuid ?? serialize(v)])) })) changed = true;
          }
          return;
        }
        const cond = conds[idx];
        for (const g of ground) {
          const env2 = unify(cond, g, env);
          if (env2) match(idx + 1, env2, [...used, store.get(key(g)).id]);
        }
      };
      match(0, {}, []);
    }
    if (!changed) { complete = true; break; }
  }
  return { store, rounds, complete, unparsedRules: unparsed };
}

function domainOf(kb, store) {
  const ents = new Map();
  const visit = (node) => {
    if (!node || typeof node !== 'object') return;
    if (node.kind === KINDS.EntityRef) ents.set(node.uuid, node);
    for (const v of Object.values(node)) if (v && typeof v === 'object') Array.isArray(v) ? v.forEach(visit) : visit(v);
  };
  for (const { node } of store.values()) visit(node);
  for (const r of kb.rules) visit(r.node);
  for (const f of kb.facts) visit(f.node);
  return [...ents.values()];
}

/** Three-valued evaluation of a formula against a saturated store. */
export function evaluateFormula(ir, saturated, kb, { domain = null } = {}) {
  const { store } = saturated;
  const consulted = new Set();
  const dom = domain ?? domainOf(kb, store);
  const NOT = { true: TRUTH.FALSE, false: TRUTH.TRUE, unknown: TRUTH.UNKNOWN };
  const andOf = (vals) => (vals.includes(TRUTH.FALSE) ? TRUTH.FALSE : vals.includes(TRUTH.UNKNOWN) ? TRUTH.UNKNOWN : TRUTH.TRUE);
  const orOf = (vals) => (vals.includes(TRUTH.TRUE) ? TRUTH.TRUE : vals.includes(TRUTH.UNKNOWN) ? TRUTH.UNKNOWN : TRUTH.FALSE);
  const ev = (node, env) => {
    const n = substitute(node, env);
    switch (n.kind) {
      case KINDS.Predicate: {
        const pos = store.get(key(n));
        if (pos) { consulted.add(pos.id); return TRUTH.TRUE; }
        const neg = store.get(key({ kind: KINDS.Not, of: n }));
        if (neg) { consulted.add(neg.id); return TRUTH.FALSE; }
        return TRUTH.UNKNOWN;
      }
      case KINDS.Not: {
        if (n.of.kind === KINDS.Predicate) {
          const neg = store.get(key(n));
          if (neg) { consulted.add(neg.id); return TRUTH.TRUE; }
        }
        return NOT[ev(n.of, env)];
      }
      case KINDS.And: return andOf(n.args.map((a) => ev(a, env)));
      case KINDS.Or: return orOf(n.args.map((a) => ev(a, env)));
      case KINDS.Implies: return orOf([NOT[ev(n.if, env)], ev(n.then, env)]);
      case KINDS.ForAll: {
        if (!dom.length) return TRUTH.UNKNOWN;
        return andOf(dom.map((e) => ev(n.body, { ...env, [n.variable.name]: e })));
      }
      case KINDS.Exists: {
        if (!dom.length) return TRUTH.UNKNOWN;
        return orOf(dom.map((e) => ev(n.body, { ...env, [n.variable.name]: e })));
      }
      default: return TRUTH.UNKNOWN;
    }
  };
  const truth = ev(bareNode(ir), {});
  return { truth, consulted: [...consulted], domain: 'snapshot', domainSize: dom.length };
}

/** Derivation chain (proof) for a set of store entry ids, oldest first. */
export function proofFor(ids, saturated, kb) {
  const { store } = saturated;
  const byId = new Map([...store.values()].map((v) => [v.id, v]));
  const seen = new Set();
  const steps = [];
  const visit = (id) => {
    if (seen.has(id)) return;
    const entry = byId.get(id);
    if (!entry) return;
    seen.add(id);
    for (const dep of entry.derivation.from) if (byId.has(dep)) visit(dep);
    steps.push({ step: entry.id, rule: entry.derivation.rule, from: entry.derivation.from, expression: render(entry.node, kb.names), ...(entry.derivation.substitution ? { substitution: entry.derivation.substitution } : {}) });
  };
  ids.forEach(visit);
  return steps;
}

/** Evaluate one claim's expression against everything the snapshot holds. */
export function evaluateClaim(snapshot, claimId, { kb = null, saturated = null } = {}) {
  const claim = snapshot.units[claimId];
  const ex = claimExpression(claim, snapshot);
  const g = groundingState(claim);
  if (!ex || !ex.valid.ok || g === 'unresolved' || g === 'ambiguous') {
    return { claim: claimId, result: LOGIC_RESULT.OUTSIDE_COVERAGE, reason: !ex ? 'no formal expression' : !ex.valid.ok ? 'invalid Logic IR' : `grounding ${g}`, evaluator: NATIVE_EVALUATOR_ID, evaluatorVersion: NATIVE_EVALUATOR_VERSION };
  }
  const base = kb ?? buildKb(snapshot, { claimIds: null });
  const others = { ...base, facts: base.facts.filter((f) => f.id !== claimId), rules: base.rules.filter((r) => r.id !== claimId) };
  const sat = saturated ?? saturate(others);
  const ev = evaluateFormula(ex.ir, sat, others);
  return {
    claim: claimId,
    result: ev.truth === TRUTH.TRUE ? LOGIC_RESULT.ENTAILED : ev.truth === TRUTH.FALSE ? LOGIC_RESULT.CONTRADICTED : LOGIC_RESULT.NOT_ENTAILED,
    truth: ev.truth,
    expression: render(ex.ir, base.names),
    hash: hashIr(ex.ir),
    consulted: ev.consulted,
    proof: proofFor(ev.consulted, sat, others),
    domain: ev.domain,
    domainSize: ev.domainSize,
    evaluator: NATIVE_EVALUATOR_ID,
    evaluatorVersion: NATIVE_EVALUATOR_VERSION
  };
}

/** Does the argument's conclusion follow from its premises alone? */
export function entails(snapshot, argument) {
  const premiseIds = argument.premiseRefs;
  const conclusion = snapshot.units[argument.conclusionRef];
  const missing = [];
  for (const id of [...premiseIds, argument.conclusionRef]) {
    const u = snapshot.units[id];
    const ex = u ? claimExpression(u, snapshot) : null;
    const g = u ? groundingState(u) : 'none';
    if (!ex) missing.push({ claim: id, reason: 'no formal expression' });
    else if (!ex.valid.ok) missing.push({ claim: id, reason: 'invalid Logic IR', diagnostics: ex.valid.diagnostics });
    else if (g === 'unresolved' || g === 'ambiguous') missing.push({ claim: id, reason: `grounding ${g}` });
  }
  const base = { argument: argument.id, evaluator: NATIVE_EVALUATOR_ID, evaluatorVersion: NATIVE_EVALUATOR_VERSION, checked: premiseIds, conclusion: argument.conclusionRef };
  if (missing.length) return { ...base, result: LOGIC_RESULT.OUTSIDE_COVERAGE, missing };
  const kb = buildKb(snapshot, { claimIds: premiseIds });
  const sat = saturate(kb);
  const ex = claimExpression(conclusion, snapshot);
  const ev = evaluateFormula(ex.ir, sat, kb);
  const result = ev.truth === TRUTH.TRUE ? LOGIC_RESULT.ENTAILED : ev.truth === TRUTH.FALSE ? LOGIC_RESULT.CONTRADICTED : LOGIC_RESULT.NOT_ENTAILED;
  const out = { ...base, result, truth: ev.truth, expression: render(ex.ir, kb.names), proof: proofFor(ev.consulted, sat, kb), rounds: sat.rounds, complete: sat.complete, domain: ev.domain, domainSize: ev.domainSize };
  if (result === LOGIC_RESULT.NOT_ENTAILED) out.missingCondition = missingCondition(sat, kb, ex.ir);
  return out;
}

/**
 * A best-effort hint for a failed entailment: the ground atoms of the
 * conclusion that were unknown, and the rule shape that would supply them
 * from what is known (spec v1.1 §8.1 "Missing condition: A(x) -> C(x)").
 */
function missingCondition(saturated, kb, conclusionIr) {
  const node = bareNode(conclusionIr);
  const atoms = [];
  const collect = (n) => { if (!n || typeof n !== 'object') return; if (n.kind === KINDS.Predicate) atoms.push(n); else for (const v of Object.values(n)) if (v && typeof v === 'object') Array.isArray(v) ? v.forEach(collect) : collect(v); };
  collect(node);
  const unknown = atoms.filter((a) => !saturated.store.has(key(a)) && !saturated.store.has(key({ kind: KINDS.Not, of: a })));
  const known = [...saturated.store.values()].filter((v) => v.node.kind === KINDS.Predicate);
  const hints = [];
  for (const a of unknown) {
    const sameArgs = known.filter((k) => serialize(k.node.args) === serialize(a.args));
    for (const k of sameArgs) hints.push(`${render(k.node.predicate, kb.names)}(x) → ${render(a.predicate, kb.names)}(x)`);
    if (!sameArgs.length) hints.push(`a premise establishing ${render(a, kb.names)}`);
  }
  return { unknownAtoms: unknown.map((a) => render(a, kb.names)), hints: [...new Set(hints)] };
}
