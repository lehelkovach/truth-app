/**
 * The Reasoning Explorer: one honest verdict per argument, with every engine's
 * evidence shown separately so nothing collapses into a score.
 *
 * For each argument it combines
 *   - the KnowShowGo inference core (byte-faithful mirror in ../logic/infer.mjs):
 *     a *rule-based proof* — valid / invalid / unresolved, naming the rule
 *     (universal modus ponens, modus ponens, hypothetical syllogism, reiteration);
 *   - the native evaluator's *entailment* (../logic/evaluate.mjs, surfaced on the
 *     evaluation result): forward chaining over the snapshot with a proof trace
 *     and, on failure, the missing condition;
 *   - the Prolog projection of every premise and the conclusion as a goal;
 *   - the fallacy annotations analysts attached, plus grounding findings (W001);
 *   - the concepts (subjects and predicates) the argument rests on, with their
 *     definitions and KnowShowGo binding, and the KSG prototype each claim casts to.
 *
 * Validity is not truth. The verdict speaks only to whether the conclusion
 * follows; a premise's standing (established / defeated / open) is reported
 * beside it as a separate dimension, never folded in.
 */

import { inferArgument, INFERENCE_DECISION } from '../logic/infer.mjs';
import { canonicalize, serialize, wrapRoot, render, KINDS, expressionOf } from '../logic/ir.mjs';
import { toProlog } from '../logic/text.mjs';
import { claimExpression, termStatuses, groundingState } from '../logic/kb.mjs';
import { bindingsFor, formalizeClaim } from '../logic/formalize.mjs';
import { unitsOfKind } from '../domain/truth-patch.mjs';
import { describeFallacy } from '../domain/fallacies.mjs';

export const VERDICT = Object.freeze({ VALID: 'valid', INVALID: 'invalid', NOT_DEDUCIBLE: 'not_deducible', CONTRADICTED: 'contradicted' });
export const REASONING_VERSION = 'reasoning-explorer@0.1.0';

const short = (id) => String(id ?? '').split(':').slice(1).join(':') || id;
const DEDUCTIVE = new Set(['deductive']);

/** Prolog goal for a conclusion: a fact becomes `?- fact.`; a rule is shown as the clause to derive. */
function goalOf(prolog) {
  if (!prolog) return null;
  if (prolog.startsWith('%')) return prolog;
  return prolog.includes(':-') ? `% derive: ${prolog}` : `?- ${prolog}`;
}

/** The KSG inference core on this argument, fed exactly what the fake/live client feeds it. */
function ksgInference(argument, snapshot, resolve) {
  const pack = (id) => {
    const claim = snapshot.units[id];
    const ex = claim ? claimExpression(claim, snapshot) : null;
    if (!ex || !ex.valid.ok) return { uuid: id, ir: null, bindings: [] };
    return { uuid: id, ir: JSON.parse(serialize(canonicalize(wrapRoot(ex.ir)))), bindings: claim ? bindingsFor(claim, resolve) : [] };
  };
  const out = inferArgument({ premises: argument.premiseRefs.map(pack), conclusion: pack(argument.conclusionRef) });
  return { decision: out.decision, rule: out.rule ?? null, from: (out.from ?? []).map(short), substitution: out.substitution ?? null, diagnostics: out.diagnostics ?? [], revision: out.inferenceRevision };
}

function conceptCard(c) {
  return { id: c.id, label: c.label ?? short(c.id), kind: c.conceptKind ?? 'concept', definition: c.definition ?? null, aliases: c.aliases ?? [], ksgRef: c.ksgRef ?? null, binding: c.ksgRef ? 'knowshowgo' : 'local', senseOf: c.senseOf ?? null };
}

/**
 * Decide the verdict from both engines. Rule-based validity (a named inference
 * rule fired) or forward-chaining entailment makes an argument VALID. When both
 * engines could evaluate and neither confirms, it is INVALID. When logic cannot
 * get a grip (no formal expression, ungrounded terms, a non-deductive scheme),
 * it is NOT DEDUCIBLE — a boundary, not a defeat.
 */
function decide({ argument, inference, entailment, conclusionNode, fallacies }) {
  const inf = inference.decision;
  const ent = entailment?.result ?? null;
  const universal = conclusionNode?.kind === KINDS.ForAll;
  const notes = [];
  if (ent === 'contradicted') return { verdict: VERDICT.CONTRADICTED, headline: 'The premises entail the negation of the conclusion.', notes };
  if (inf === INFERENCE_DECISION.VALID || ent === 'entailed') {
    const by = inf === INFERENCE_DECISION.VALID ? `by ${String(inference.rule).replace(/_/g, ' ')}` : 'by forward chaining';
    if (inf === INFERENCE_DECISION.VALID && ent === 'not_entailed') notes.push(universal && (entailment.domainSize ?? 0) === 0 ? 'The model-checker had no entities to range over for a universal conclusion; the rule-based proof stands on its own.' : 'The rule-based core proves it in one step; forward chaining over the snapshot did not reach it.');
    if (inf !== INFERENCE_DECISION.VALID && ent === 'entailed') notes.push(`Derived by forward chaining in ${entailment.proof?.length ?? 0} steps; KSG's single-step core found no single rule application (${inf}).`);
    if (!DEDUCTIVE.has(argument.scheme)) notes.push(`Labelled ${argument.scheme}, but the formalisation is deductively valid.`);
    return { verdict: VERDICT.VALID, headline: `Deductively valid ${by}: the conclusion follows necessarily from the premises.`, notes };
  }
  const bothRan = inf !== INFERENCE_DECISION.UNRESOLVED || (ent && ent !== 'outside_coverage');
  if (!DEDUCTIVE.has(argument.scheme)) {
    return { verdict: VERDICT.NOT_DEDUCIBLE, headline: `A ${argument.scheme} argument: it does not claim to deduce, so logic cannot settle it. Its standing is decided by grounded argumentation (attacks and support), not by entailment.`, notes };
  }
  if (bothRan && (inf === INFERENCE_DECISION.INVALID || ent === 'not_entailed')) {
    const named = fallacies.map((f) => f.name.replace(/_/g, ' '));
    return { verdict: VERDICT.INVALID, headline: `Not valid: the premises do not license the conclusion${named.length ? ` (${named.join(', ')})` : ''}.`, notes };
  }
  const why = [];
  if (entailment?.missing?.length) why.push(...entailment.missing.map((m) => `${short(m.claim)}: ${m.reason}`));
  else if (inference.diagnostics?.length) why.push(...inference.diagnostics.map((d) => `${d.code} ${d.message}`));
  return { verdict: VERDICT.NOT_DEDUCIBLE, headline: `Logic cannot evaluate this yet: ${why.join('; ') || 'no formal expression on every claim'}.`, notes };
}

/**
 * @param {object} snapshot  a store snapshot (units, relations)
 * @param {object} result    evaluation.result from the native evaluator
 */
export function reasoningReport(snapshot, result = {}) {
  const U = snapshot.units;
  const concepts = unitsOfKind(snapshot, 'concept');
  const names = Object.fromEntries(concepts.map((c) => [c.id, c.label ?? short(c.id)]));
  const resolve = (ref) => ref; // local concept ids are the symbols; a KSG push remaps them
  const claimsById = Object.fromEntries(unitsOfKind(snapshot, 'claim').map((c) => [c.id, c]));
  const args = unitsOfKind(snapshot, 'argument');
  const annotations = unitsOfKind(snapshot, 'annotation').filter((a) => a.annotationType === 'fallacy');
  const logicArgs = result.logic?.arguments ?? {};
  const logicClaims = result.logic?.claims ?? {};
  const findings = result.findings ?? [];

  const claimInfo = (id) => {
    const c = claimsById[id];
    if (!c) return { id, short: short(id), text: '(missing claim)', hasLogic: false };
    const ex = claimExpression(c, snapshot);
    const valid = !!(ex && ex.valid.ok);
    const terms = termStatuses(c);
    const cast = formalizeClaim(c, snapshot, resolve);
    return {
      id, short: short(id), text: c.text, modality: c.modality, basis: c.basis, claimKind: c.claimKind,
      hasLogic: valid, from: ex?.from ?? null,
      ir: valid ? render(ex.ir, names) : null, prolog: valid ? toProlog(ex.ir, names) : null, logicText: c.logicText ?? null,
      grounding: groundingState(c), terms: terms.map((t) => ({ symbol: t.symbol, status: t.status, concept: t.conceptRef ? names[t.conceptRef] ?? t.conceptRef : null, conceptRef: t.conceptRef ?? null, candidates: (t.candidates ?? []).map((x) => names[x] ?? x) })),
      standing: result.claims?.[id] ?? null,
      againstSnapshot: logicClaims[id] && logicClaims[id].result !== 'outside_coverage' ? logicClaims[id].result : null,
      ksgCast: cast.prototype,
      concludedBy: args.filter((a) => a.conclusionRef === id).map((a) => short(a.id)),
      premiseOf: args.filter((a) => a.premiseRefs.includes(id)).map((a) => short(a.id))
    };
  };

  const conceptsUsedBy = (ids) => {
    const seen = new Set();
    for (const id of ids) for (const t of termStatuses(claimsById[id] ?? {})) { if (t.conceptRef) seen.add(t.conceptRef); for (const cand of t.candidates ?? []) seen.add(cand); }
    for (const id of ids) {
      const c = claimsById[id];
      const walk = (n) => { if (!n || typeof n !== 'object') return; if ((n.kind === KINDS.ConceptRef || n.kind === KINDS.EntityRef) && U[n.uuid]) seen.add(n.uuid); for (const v of Object.values(n)) if (v && typeof v === 'object') Array.isArray(v) ? v.forEach(walk) : walk(v); };
      if (c?.logicIr) walk(c.logicIr);
    }
    return [...seen].filter((id) => U[id]?.kind === 'concept').map((id) => conceptCard(U[id]));
  };

  const argumentsOut = args.map((a) => {
    const premises = a.premiseRefs.map(claimInfo);
    const conclusion = claimInfo(a.conclusionRef);
    const inference = ksgInference(a, snapshot, resolve);
    const entailment = logicArgs[a.id] ?? null;
    const concEx = claimsById[a.conclusionRef] ? claimExpression(claimsById[a.conclusionRef], snapshot) : null;
    const conclusionNode = concEx?.valid?.ok ? expressionOf(wrapRoot(concEx.ir)) : null;
    const fallacies = annotations.filter((x) => x.targetRef === a.id).map((x) => ({ id: x.id, name: x.name, where: x.where, severity: x.severity, explanation: x.text, catalogue: describeFallacy(x.name) }));
    const groundingFindings = findings.filter((f) => f.argument === a.id && (f.code === 'W001' || f.code === 'W002'));
    const decision = decide({ argument: a, inference, entailment, conclusionNode, fallacies });
    const used = conceptsUsedBy([...a.premiseRefs, a.conclusionRef]);
    return {
      id: a.id, short: short(a.id), title: a.title, scheme: a.scheme, warrant: a.warrant ?? null,
      premises, conclusion,
      prolog: { clauses: premises.map((p) => p.prolog).filter(Boolean), goal: goalOf(conclusion.prolog) },
      inference,
      entailment: entailment ? { result: entailment.result, truth: entailment.truth ?? null, expression: entailment.expression ?? null, proof: entailment.proof ?? [], missingCondition: entailment.missingCondition ?? null, missing: entailment.missing ?? null, domainSize: entailment.domainSize ?? null, evaluator: `${entailment.evaluator}@${entailment.evaluatorVersion}` } : null,
      fallacies, groundingFindings,
      standing: { label: result.labels?.[a.id] ?? null, reason: result.derivation?.[a.id]?.reason ?? null },
      concepts: { subjects: used.filter((c) => c.kind === 'entity'), predicates: used.filter((c) => c.kind !== 'entity') },
      ...decision
    };
  });

  const claimsOut = Object.keys(claimsById).map(claimInfo);
  const counts = Object.fromEntries(Object.values(VERDICT).map((v) => [v, 0]));
  for (const a of argumentsOut) counts[a.verdict] += 1;
  const formalClaims = claimsOut.filter((c) => c.hasLogic).length;
  return {
    version: REASONING_VERSION,
    summary: { arguments: argumentsOut.length, ...counts, claims: claimsOut.length, formalClaims, groundedClaims: claimsOut.filter((c) => c.grounding === 'resolved').length, schemes: argumentsOut.reduce((acc, a) => ((acc[a.scheme] = (acc[a.scheme] ?? 0) + 1), acc), {}) },
    arguments: argumentsOut,
    claims: claimsOut,
    concepts: concepts.map(conceptCard)
  };
}

/** Plain-text rendering shared by the CLI and tests. */
export function formatReasoning(rep, { all = false } = {}) {
  const lines = [];
  const s = rep.summary;
  lines.push(`${s.arguments} arguments · ${s.valid} valid deduction${s.valid === 1 ? '' : 's'} · ${s.invalid} invalid · ${s.not_deducible} not deducible${s.contradicted ? ` · ${s.contradicted} contradicted` : ''} · ${s.formalClaims}/${s.claims} claims carry Logic IR`);
  for (const a of rep.arguments) {
    const inf = `KSG inference: ${a.inference.decision}${a.inference.rule ? ' (' + a.inference.rule.replace(/_/g, ' ') + ')' : ''}`;
    const ent = a.entailment ? `native: ${a.entailment.result.replace(/_/g, ' ')}${a.entailment.proof?.length ? ` in ${a.entailment.proof.length} steps` : ''}` : 'native: —';
    lines.push('');
    lines.push(`${a.short.padEnd(4)} ${a.verdict.toUpperCase().replace('_', ' ').padEnd(14)} ${a.title ?? ''}  [${a.scheme}]`);
    lines.push(`     ${a.headline}`);
    for (const p of a.premises) lines.push(`     ${p.short.padEnd(4)} ${(p.ir ?? p.text).padEnd(44)} ${p.prolog ?? ''}`);
    lines.push(`     ∴ ${a.conclusion.short.padEnd(2)} ${(a.conclusion.ir ?? a.conclusion.text).padEnd(44)} ${a.prolog.goal ?? ''}`);
    lines.push(`     ${inf} · ${ent}`);
    if (a.entailment?.proof?.length) lines.push(`     proof: ${a.entailment.proof.map((st) => `${st.step} ${st.expression} [${st.rule}${st.from.length ? ' ← ' + st.from.map(short).join(',') : ''}${st.substitution ? ' ' + JSON.stringify(st.substitution) : ''}]`).join(' · ')}`);
    if (a.entailment?.missingCondition?.hints?.length) lines.push(`     missing: ${a.entailment.missingCondition.hints.join(' or ')}`);
    for (const f of a.fallacies) lines.push(`     fallacy: ${f.name} at ${f.where} (${f.severity}) — ${f.explanation}`);
    for (const g of a.groundingFindings) lines.push(`     ${g.code}: ${g.message}`);
    for (const n of a.notes) lines.push(`     note: ${n}`);
    lines.push(`     standing: ${a.standing.label ?? '—'}${a.standing.reason ? ' — ' + a.standing.reason : ''}`);
    const cs = [...a.concepts.subjects, ...a.concepts.predicates];
    if (cs.length) lines.push(`     terms: ${cs.map((c) => `${c.label}${c.definition ? ' = ' + c.definition : ''}${c.binding === 'knowshowgo' ? ' [KSG ' + c.ksgRef + ']' : ''}`).join(' · ')}`);
  }
  if (all) {
    lines.push('');
    lines.push('claims:');
    for (const c of rep.claims) lines.push(`  ${c.short.padEnd(4)} ${c.hasLogic ? 'IR ' : '—  '} ${String(c.grounding).padEnd(10)} ${(c.ir ?? c.text).padEnd(44)} ${c.prolog ?? ''}${c.againstSnapshot ? '  → ' + c.againstSnapshot : ''}  · KSG cast ${c.ksgCast}`);
  }
  return lines.join('\n');
}
