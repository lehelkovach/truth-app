/**
 * Knowledge base built from a TruthIR snapshot.
 *
 * A claim contributes to the KB when it has a formal expression and every
 * material term is grounded. Its expression comes from `logicIr` (KSG AST,
 * uuids are local `concept:` refs until pushed) or, failing that, from the
 * proposition-centric shape (`proposition.predicateRef` + `roles`, with
 * `polarity`), which compiles to one predicate.
 *
 * Nothing here decides truth. The KB records what was said, by which claim.
 */

import { KINDS, canonicalize, conceptRef, entityRef, not, predicate, validate, wrapRoot } from './ir.mjs';

/** Canonical expression node without the version wrapper: the shape facts are keyed by. */
export function bareNode(ir) {
  const { logicIrVersion, ...node } = canonicalize(ir);
  return node;
}
import { unitsOfKind } from '../domain/truth-patch.mjs';

export const ROLE_ORDER = ['subject', 'agent', 'cause', 'experiencer', 'object', 'patient', 'effect', 'theme', 'instrument', 'location', 'time'];

/** Expression for a claim, or null. Also says where it came from. */
export function claimExpression(claim, snapshot) {
  if (claim.logicIr) {
    const ir = wrapRoot(claim.logicIr);
    return { ir, from: 'logicIr', valid: validate(ir) };
  }
  const p = claim.proposition;
  if (p?.predicateRef) {
    const roles = p.roles || {};
    const keys = Object.keys(roles).sort((a, b) => (ROLE_ORDER.indexOf(a) === -1 ? 99 : ROLE_ORDER.indexOf(a)) - (ROLE_ORDER.indexOf(b) === -1 ? 99 : ROLE_ORDER.indexOf(b)) || a.localeCompare(b));
    const args = keys.map((k) => {
      const ref = roles[k];
      const unit = snapshot?.units?.[ref];
      return unit?.conceptKind === 'entity' ? entityRef(ref) : conceptRef(ref);
    });
    let expr = predicate(conceptRef(p.predicateRef), args);
    if (p.polarity === 'negative') expr = not(expr);
    const ir = wrapRoot(expr);
    return { ir, from: 'proposition', valid: validate(ir) };
  }
  return null;
}

/** Grounding status of a claim from its `terms`. */
export function termStatuses(claim) {
  return (claim.terms || []).map((t) => {
    const candidates = t.candidates || [];
    let status;
    if (t.conceptRef) status = 'resolved';
    else if (candidates.length > 1) status = 'ambiguous';
    else status = 'unresolved';
    return { symbol: t.symbol, conceptRef: t.conceptRef ?? null, candidates, status };
  });
}

export function groundingState(claim) {
  const terms = termStatuses(claim);
  if (!terms.length) return 'none';
  if (terms.some((t) => t.status === 'unresolved')) return 'unresolved';
  if (terms.some((t) => t.status === 'ambiguous')) return 'ambiguous';
  return 'resolved';
}

const LIVE = new Set(['proposed', 'accepted']);

/**
 * Build the KB. `formalisable(claim)` is true when it has a valid expression
 * and no unresolved/ambiguous term.
 */
export function buildKb(snapshot, { claimIds = null } = {}) {
  const facts = [];
  const rules = [];
  const skipped = [];
  const names = {};
  for (const c of unitsOfKind(snapshot, 'concept')) names[c.id] = c.label ?? c.id;
  const claims = unitsOfKind(snapshot, 'claim').filter((c) => LIVE.has(c.status) && (!claimIds || claimIds.includes(c.id)));
  for (const claim of claims) {
    const ex = claimExpression(claim, snapshot);
    if (!ex) { skipped.push({ claim: claim.id, reason: 'no formal expression' }); continue; }
    if (!ex.valid.ok) { skipped.push({ claim: claim.id, reason: 'invalid Logic IR', diagnostics: ex.valid.diagnostics }); continue; }
    const g = groundingState(claim);
    if (g === 'unresolved' || g === 'ambiguous') { skipped.push({ claim: claim.id, reason: `grounding ${g}` }); continue; }
    const node = bareNode(ex.ir);
    const entry = { id: claim.id, ir: ex.ir, node, from: ex.from };
    if (node.kind === KINDS.ForAll || node.kind === KINDS.Implies) rules.push(entry);
    else facts.push(entry);
  }
  return { facts, rules, skipped, names, claims: claims.map((c) => c.id) };
}
