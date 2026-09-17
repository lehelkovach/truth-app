/**
 * Diagnostics and status dimensions (spec v1.1 §8, §17).
 *
 * A diagnostic is a colour with a reason: `state` is green | yellow | red,
 * and `explanation` says what was detected, under which evaluator and scope,
 * what was checked, and what the user can do. Colour is diagnostic state,
 * never a truth label. Dimensions keep lifecycle, logical result, argument
 * state, evidence state, grounding state and parser state apart.
 */

import { unitsOfKind, liveRelations } from './truth-patch.mjs';
import { LABEL_WORD } from '../report/markdown.mjs';

const FINDING_STATE = {
  MODAL_OVERREACH: 'yellow', UNSOURCED_PREMISE: 'yellow', DERIVED_UNSUPPORTED: 'red', CIRCULAR: 'red', STANDOFF: 'yellow', UNCONTESTED: 'green', NO_WARRANT: 'yellow', UNKNOWN_FALLACY: 'yellow', W001: 'red', W002: 'yellow'
};

const REMEDY = {
  MODAL_OVERREACH: ['Lower the conclusion modality', 'Add a premise that supplies the probability', 'Challenge flag'],
  UNSOURCED_PREMISE: ['Add a source', 'Mark the claim as an assumption', 'Undermine it'],
  DERIVED_UNSUPPORTED: ['Add an argument for the claim', 'Change basis to assumption or evidence'],
  CIRCULAR: ['Break the chain by grounding one claim independently'],
  STANDOFF: ['Add an argument that attacks one side', 'Leave as contested'],
  UNCONTESTED: ['Attack it', 'Accept it'],
  NO_WARRANT: ['State why the premises support the conclusion'],
  W001: ['Change grounding so one sense is used throughout', 'Split the term into two claims', 'Fork definition'],
  W002: ['Re-ground the attacker to the target\'s sense', 'Record the attack as a definition dispute']
};

export function buildDiagnostics({ snapshot, evaluation, commitId }) {
  const scope = { commit: commitId ?? null };
  const out = [];
  let n = 0;
  const push = (d) => out.push({ id: `diag:${String(++n).padStart(3, '0')}`, scope, ...d });
  const argEval = `${evaluation.evaluator}@${evaluation.evaluatorVersion}`;
  // Argument labels
  for (const [id, label] of Object.entries(evaluation.labels)) {
    const d = evaluation.derivation[id];
    push({ target: id, code: `ARG_${label.toUpperCase()}`, state: label === 'accepted' ? 'green' : label === 'rejected' ? 'red' : 'yellow', evaluator: argEval, message: `${id} ${LABEL_WORD[label]} under grounded semantics`, explanation: { detected: d.reason, why: 'Grounded labelling: accepted when every attacker is rejected and every premise established; rejected when an attacker is accepted or a premise defeated; otherwise contested.', checked: d.attackers.length ? d.attackers : ['no attackers'], options: label === 'rejected' ? ['Attack the attacker', 'Undermine its premise', 'Revise the argument'] : ['Attack it'] } });
  }
  // Native logic per argument. When no claim in the snapshot has a formal
  // expression the evaluator simply does not apply; say so once.
  const formalClaims = Object.values(evaluation.logic?.claims ?? {}).filter((c) => c.result !== 'outside_coverage' || (c.reason && !c.reason.startsWith('no formal'))).length;
  const argLogic = Object.entries(evaluation.logic?.arguments ?? {});
  if (argLogic.length && formalClaims === 0) {
    const [, any] = argLogic[0];
    push({ target: null, code: 'LOGIC_NOT_APPLICABLE', state: 'yellow', evaluator: `${any.evaluator}@${any.evaluatorVersion}`, message: 'no claim carries a Logic IR expression, so entailment was not checked for any argument', explanation: { detected: 'zero formal claims', why: 'The native evaluator needs Logic IR on premises and conclusion. Informal arguments are still labelled by grounded argumentation above.', checked: [], options: ['Formalise a claim (logic: ...)', 'Ground its terms'] } });
  }
  for (const [id, L] of argLogic) {
    if (formalClaims === 0) break;
    const nat = `${L.evaluator}@${L.evaluatorVersion}`;
    if (L.result === 'entailed') push({ target: id, code: 'LOGIC_ENTAILED', state: 'green', evaluator: nat, message: `conclusion follows from the premises (${L.proof.length} steps)`, explanation: { detected: `${L.expression} evaluates true from ${L.checked.join(', ')}`, why: 'Forward chaining from the premises alone derived the conclusion.', checked: L.checked, proof: L.proof, options: ['Show proof', 'Challenge a premise'] } });
    else if (L.result === 'contradicted') push({ target: id, code: 'LOGIC_CONTRADICTED', state: 'red', evaluator: nat, message: 'the premises entail the negation of the conclusion', explanation: { detected: `${L.expression} evaluates false`, why: 'A negated fact or derivation of the negation was found among the premises.', checked: L.checked, proof: L.proof, options: ['Show proof', 'Revise the conclusion'] } });
    else if (L.result === 'not_entailed') push({ target: id, code: 'LOGIC_NOT_ENTAILED', state: 'red', evaluator: nat, message: `conclusion does not follow under ${nat}`, explanation: { detected: `${L.expression} is unknown from ${L.checked.join(', ')}`, why: 'Open world: the premises neither derive the conclusion nor its negation. This is a formal gap, not a claim that the conclusion is false.', checked: L.checked, missingCondition: L.missingCondition, options: ['Add premise', 'Show proof attempt', 'Challenge flag', 'Change evaluator'] } });
    else push({ target: id, code: 'LOGIC_OUTSIDE_COVERAGE', state: 'yellow', evaluator: nat, message: 'outside evaluator coverage', explanation: { detected: (L.missing ?? []).map((m) => `${m.claim}: ${m.reason}`).join('; '), why: 'The native evaluator only checks arguments whose premises and conclusion all have a valid, fully grounded Logic IR expression.', checked: L.checked, options: ['Formalise the claims', 'Ground the terms', 'Leave informal'] } });
  }
  // Grounding per claim
  for (const [id, g] of Object.entries(evaluation.grounding ?? {})) {
    if (g.state === 'none') continue;
    const bad = g.terms.filter((t) => t.status !== 'resolved');
    push({ target: id, code: `GROUNDING_${g.state.toUpperCase()}`, state: g.state === 'resolved' ? 'green' : 'yellow', evaluator: 'grounding.exact@0.1.0', message: g.state === 'resolved' ? `all ${g.terms.length} terms grounded` : `${bad.map((t) => `'${t.symbol}' ${t.status}`).join(', ')}`, explanation: { detected: bad.length ? bad.map((t) => `${t.symbol}: ${t.status}${t.candidates?.length ? ` (${t.candidates.join(', ')})` : ''}`).join('; ') : 'every term maps to one concept', why: 'Terms resolve by exact label or alias only; ambiguity stops for review rather than being guessed.', checked: g.terms.map((t) => t.symbol), options: bad.length ? ['Choose a concept', 'Create a concept', 'Compare senses'] : ['Change grounding'] } });
  }
  // Structural findings
  for (const f of evaluation.findings) {
    const base = FINDING_STATE[f.code] ?? 'yellow';
    push({ target: f.argument ?? f.claim ?? null, code: f.code, state: f.severity === 'minor' && base === 'red' ? 'yellow' : f.severity === 'info' && base === 'red' ? 'yellow' : base, evaluator: f.code.startsWith('W00') ? 'grounding.exact@0.1.0' : argEval, message: f.message, explanation: { detected: f.message, why: WHY[f.code] ?? 'Structural check.', checked: f.senses ? f.senses.map((s) => `${s.label}: ${s.claims.join('/')}`) : [f.argument ?? f.claim].filter(Boolean), options: REMEDY[f.code] ?? [] } });
  }
  // Evidence per claim
  for (const c of unitsOfKind(snapshot, 'claim')) {
    if (c.basis !== 'evidence') continue;
    const srcs = (c.sourceRefs ?? []).map((s) => snapshot.units[s]).filter(Boolean);
    const retracted = srcs.filter((s) => s.status === 'retracted');
    const sup = liveRelations(snapshot, ['supports', 'evidence_for']).filter((r) => r.to === c.id).length;
    if (!srcs.length) continue; // UNSOURCED_PREMISE covers it
    push({ target: c.id, code: retracted.length ? 'EVIDENCE_RETRACTED' : 'EVIDENCE_PRESENT', state: retracted.length ? 'red' : 'green', evaluator: 'evidence.presence@0.1.0', message: retracted.length ? `${retracted.length} of ${srcs.length} sources retracted` : `${srcs.length} source${srcs.length > 1 ? 's' : ''}${sup ? `, ${sup} evidence relation${sup > 1 ? 's' : ''}` : ''}`, explanation: { detected: srcs.map((s) => `${s.id} (${s.status})`).join(', '), why: 'Checks that cited sources exist in the snapshot and are not retracted. It does not judge source quality.', checked: srcs.map((s) => s.id), options: ['Open source', 'Add evidence fragment'] } });
  }
  const order = { red: 0, yellow: 1, green: 2 };
  out.sort((a, b) => order[a.state] - order[b.state] || (a.target ?? '').localeCompare(b.target ?? '') || a.code.localeCompare(b.code));
  return out;
}

const WHY = {
  MODAL_OVERREACH: 'A conclusion cannot be asserted more strongly than its weakest premise licenses.',
  UNSOURCED_PREMISE: 'An evidential claim needs a source; an assumption is accepted until undermined.',
  DERIVED_UNSUPPORTED: 'A derived claim with no argument has nothing holding it up.',
  CIRCULAR: 'The support chain returns to the conclusion.',
  STANDOFF: 'Mutual rebuttal with neither side defeated.',
  UNCONTESTED: 'No attack has been declared; this is where the other side should push.',
  NO_WARRANT: 'An argument should say why its premises support its conclusion.',
  W001: 'The same word is grounded to two different concepts inside one argument, so the inference may only look valid.',
  W002: 'Attacker and target use the same word for different concepts, so the attack may not engage the target.'
};

export function dimensions({ snapshot, evaluation }) {
  const out = {};
  const attacked = new Set(evaluation.edges.map((e) => e.to));
  for (const u of Object.values(snapshot.units)) {
    if (u.kind === 'claim') {
      const srcs = (u.sourceRefs ?? []).map((s) => snapshot.units[s]).filter(Boolean);
      out[u.id] = {
        lifecycle: u.status,
        logical: evaluation.logic?.claims?.[u.id]?.result ?? 'outside_coverage',
        argument: evaluation.claims[u.id] ?? (u.basis === 'derived' ? 'open' : 'established'),
        evidence: u.basis !== 'evidence' ? 'not_applicable' : !srcs.length ? 'missing' : srcs.some((s) => s.status === 'retracted') ? 'retracted' : 'present',
        grounding: evaluation.grounding?.[u.id]?.state ?? 'none',
        parser: u.provenance?.sourceType === 'llm' ? (u.status === 'accepted' ? 'ai_proposed_accepted' : 'ai_proposed') : u.provenance?.sourceType === 'import' ? 'imported' : 'human'
      };
    } else if (u.kind === 'argument') {
      out[u.id] = {
        lifecycle: u.status,
        logical: evaluation.logic?.arguments?.[u.id]?.result ?? 'outside_coverage',
        argument: evaluation.labels[u.id] ? (attacked.has(u.id) ? `${evaluation.labels[u.id]} (attacked)` : evaluation.labels[u.id]) : 'not_evaluated',
        evidence: 'not_applicable',
        grounding: 'not_applicable',
        parser: u.provenance?.sourceType === 'llm' ? 'ai_proposed' : 'human'
      };
    }
  }
  return out;
}
