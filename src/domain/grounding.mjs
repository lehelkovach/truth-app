/**
 * Concept grounding (spec v1.1 §5).
 *
 * Labels are not identity. A `concept` unit is TruthApp's handle on a KSG
 * concept (`ksgRef` when resolved, null while local). A claim grounds each
 * material term through `terms[]`: `{ symbol, conceptRef | candidates }`.
 * Resolution here is exact label/alias only; anything ambiguous stops with
 * candidates and is never guessed (§5.3).
 *
 * Equivocation (§5.4) is structural: the same symbol grounded to different
 * concepts inside one argument (W001), or across an attack (W002).
 */

import { unitsOfKind } from './truth-patch.mjs';
import { termStatuses, groundingState } from '../logic/kb.mjs';

export { termStatuses, groundingState };

const norm = (s) => String(s ?? '').trim().toLowerCase();

/** Exact / alias resolution against the snapshot's concepts. */
export function resolveTerm(snapshot, symbol) {
  const wanted = norm(symbol);
  const hits = unitsOfKind(snapshot, 'concept').filter((c) => norm(c.label) === wanted || (c.aliases || []).some((a) => norm(a) === wanted));
  if (hits.length === 1) return { symbol, conceptRef: hits[0].id, status: 'resolved' };
  if (hits.length > 1) return { symbol, conceptRef: null, candidates: hits.map((h) => h.id), status: 'ambiguous' };
  return { symbol, conceptRef: null, candidates: [], status: 'unresolved' };
}

/** Where a concept is used and what changes if its grounding changes (§18). */
export function conceptUsage(snapshot, conceptId) {
  const claims = unitsOfKind(snapshot, 'claim').filter((c) => (c.terms || []).some((t) => t.conceptRef === conceptId || (t.candidates || []).includes(conceptId)) || c.proposition?.predicateRef === conceptId || Object.values(c.proposition?.roles || {}).includes(conceptId) || JSON.stringify(c.logicIr || {}).includes(`"${conceptId}"`));
  const claimIds = new Set(claims.map((c) => c.id));
  const args = unitsOfKind(snapshot, 'argument').filter((a) => a.premiseRefs.some((p) => claimIds.has(p)) || claimIds.has(a.conclusionRef));
  const senses = unitsOfKind(snapshot, 'concept').filter((c) => c.id !== conceptId && c.senseOf && c.senseOf === snapshot.units[conceptId]?.senseOf);
  return { concept: snapshot.units[conceptId] ?? null, claims: claims.map((c) => c.id), arguments: args.map((a) => a.id), competingSenses: senses.map((s) => s.id) };
}

function symbolMap(claim) {
  const out = new Map();
  for (const t of termStatuses(claim)) out.set(norm(t.symbol), t);
  return out;
}

/** W001 inside arguments, W002 across attacks. */
export function equivocations(snapshot, attackEdges = []) {
  const findings = [];
  const args = unitsOfKind(snapshot, 'argument');
  for (const a of args) {
    const uses = new Map(); // symbol -> Map(conceptRef -> [claim ids])
    const ambiguous = new Map();
    for (const id of [...a.premiseRefs, a.conclusionRef]) {
      const c = snapshot.units[id];
      if (c?.kind !== 'claim') continue;
      for (const [sym, t] of symbolMap(c)) {
        if (t.status === 'resolved') {
          const m = uses.get(sym) ?? new Map();
          m.set(t.conceptRef, [...(m.get(t.conceptRef) ?? []), id]);
          uses.set(sym, m);
        } else if (t.status === 'ambiguous') ambiguous.set(sym, [...(ambiguous.get(sym) ?? []), id]);
      }
    }
    for (const [sym, m] of uses) {
      if (m.size >= 2) {
        const senses = [...m.entries()].map(([conceptRef, claims]) => ({ conceptRef, label: snapshot.units[conceptRef]?.label ?? conceptRef, claims }));
        findings.push({ code: 'W001', severity: 'major', argument: a.id, symbol: sym, senses, message: `'${sym}' is grounded to ${m.size} different concepts within ${a.id}: ${senses.map((s) => `${s.label} in ${s.claims.join('/')}`).join('; ')}` });
      } else if (ambiguous.has(sym)) {
        findings.push({ code: 'W001', severity: 'minor', argument: a.id, symbol: sym, senses: [...m.entries()].map(([conceptRef, claims]) => ({ conceptRef, label: snapshot.units[conceptRef]?.label ?? conceptRef, claims })), message: `'${sym}' is resolved in some premises of ${a.id} but ambiguous in ${ambiguous.get(sym).join('/')}` });
      }
    }
  }
  for (const e of attackEdges) {
    const from = snapshot.units[e.from];
    const to = snapshot.units[e.to];
    if (!from || !to) continue;
    const senseOf = (arg) => {
      const m = new Map();
      for (const id of [...arg.premiseRefs, arg.conclusionRef]) for (const [sym, t] of symbolMap(snapshot.units[id] ?? {})) if (t.status === 'resolved') m.set(sym, t.conceptRef);
      return m;
    };
    const a = senseOf(from);
    const b = senseOf(to);
    for (const [sym, ref] of a) {
      if (b.has(sym) && b.get(sym) !== ref) {
        findings.push({ code: 'W002', severity: 'minor', argument: e.from, attack: e.id, symbol: sym, senses: [{ conceptRef: ref, label: snapshot.units[ref]?.label ?? ref, claims: [e.from] }, { conceptRef: b.get(sym), label: snapshot.units[b.get(sym)]?.label ?? b.get(sym), claims: [e.to] }], message: `${e.from} attacks ${e.to} but grounds '${sym}' to ${snapshot.units[ref]?.label ?? ref} while ${e.to} grounds it to ${snapshot.units[b.get(sym)]?.label ?? b.get(sym)}: the attack may be talking past its target` });
      }
    }
  }
  return findings;
}

/** Grounding summary per claim. */
export function groundingReport(snapshot) {
  const out = {};
  for (const c of unitsOfKind(snapshot, 'claim')) out[c.id] = { state: groundingState(c), terms: termStatuses(c) };
  return out;
}
