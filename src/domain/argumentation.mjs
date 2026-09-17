/**
 * Grounded argumentation semantics (Dung 1995) with premise support.
 *
 * `evaluateGrounded({ arguments, attacks })` is the bare evaluator from the
 * handoff (§32): arguments are ids, attacks are {from, to}. An argument is
 * accepted when every attacker is rejected, rejected when some attacker is
 * accepted, undecided otherwise. Labels only move from undecided to a decided
 * value, so the fixpoint is unique and the result is deterministic.
 *
 * `evaluateSnapshot(snapshot)` derives arguments and attacks from a TruthIR
 * snapshot, expands `undermine` relations, and adds premise support: an
 * argument whose premise is a *derived* claim needs some accepted argument
 * for that claim, and is rejected when every argument for it is rejected. A
 * mutual rebuttal leaves both sides undecided; the evaluator never breaks a
 * standoff on its own.
 */

import { liveRelations, unitsOfKind } from './truth-patch.mjs';
import { FALLACIES } from './fallacies.mjs';

export const EVALUATOR_ID = 'argumentation.grounded';
export const EVALUATOR_VERSION = '0.1.0';

export const MODALITIES = ['speculative', 'possible', 'plausible', 'probable', 'certain'];
const ATTACK_OPERATORS = ['attacks', 'rebut', 'undercut', 'undermine'];

export function modalityRank(m) {
  const i = MODALITIES.indexOf(m);
  if (i < 0) throw new Error(`unknown modality ${m}`);
  return i;
}

/**
 * @param {{ arguments: string[], attacks: {from: string, to: string}[], premises?: Record<string, string[]>, supports?: Record<string, string[]>, independent?: Set<string>|string[] }} input
 *   `premises[arg]` lists claim ids the argument needs; `supports[claim]` lists
 *   arguments concluding that claim; `independent` lists claims established
 *   without argument. Omit the last three for a plain Dung framework.
 */
export function evaluateGrounded({ arguments: args, attacks, premises = {}, supports = {}, independent = new Set() }) {
  const indep = independent instanceof Set ? independent : new Set(independent);
  const label = Object.fromEntries(args.map((a) => [a, 'undecided']));
  const attackers = Object.fromEntries(args.map((a) => [a, []]));
  for (const { from, to } of attacks) {
    if (!(to in attackers) || !(from in label)) continue;
    if (!attackers[to].includes(from)) attackers[to].push(from);
  }
  const derivation = {};
  const claimStatus = (claim) => {
    if (indep.has(claim) || !(claim in supports)) return supports[claim] ? 'open' : indep.has(claim) ? 'established' : 'defeated';
    const sup = supports[claim];
    if (sup.some((a) => label[a] === 'accepted')) return 'established';
    if (sup.length === 0 || sup.every((a) => label[a] === 'rejected')) return 'defeated';
    return 'open';
  };
  let changed = true;
  let round = 0;
  while (changed) {
    changed = false;
    round += 1;
    for (const a of args) {
      if (label[a] !== 'undecided') continue;
      const atk = attackers[a];
      const acceptedAttacker = atk.find((x) => label[x] === 'accepted');
      const prem = premises[a] ?? [];
      const defeatedPremise = prem.find((p) => claimStatus(p) === 'defeated');
      if (acceptedAttacker) {
        label[a] = 'rejected';
        derivation[a] = { label: 'rejected', round, reason: `attacked by accepted ${acceptedAttacker}`, attackers: [...atk] };
        changed = true;
      } else if (defeatedPremise) {
        label[a] = 'rejected';
        derivation[a] = { label: 'rejected', round, reason: `premise ${defeatedPremise} is defeated (no accepted argument supports it)`, attackers: [...atk] };
        changed = true;
      } else if (atk.every((x) => label[x] === 'rejected') && prem.every((p) => claimStatus(p) === 'established')) {
        label[a] = 'accepted';
        derivation[a] = {
          label: 'accepted',
          round,
          reason: atk.length ? `all attackers rejected (${atk.join(', ')})` : 'no attackers and all premises established',
          attackers: [...atk]
        };
        changed = true;
      }
    }
  }
  for (const a of args) {
    if (label[a] === 'undecided') {
      derivation[a] = { label: 'undecided', round: null, reason: `standoff: attackers ${attackers[a].join(', ') || 'none'} are not decided`, attackers: [...attackers[a]] };
    }
  }
  const claims = {};
  for (const c of new Set([...Object.keys(supports), ...indep])) claims[c] = claimStatus(c);
  return {
    accepted: args.filter((a) => label[a] === 'accepted'),
    rejected: args.filter((a) => label[a] === 'rejected'),
    undecided: args.filter((a) => label[a] === 'undecided'),
    labels: label,
    claims,
    derivation
  };
}

/** Attack edges in a snapshot, with undermine expanded to the arguments it hits. */
export function attackEdges(snapshot) {
  const args = unitsOfKind(snapshot, 'argument');
  const edges = [];
  for (const r of liveRelations(snapshot, ATTACK_OPERATORS)) {
    if (r.operator === 'undermine' && r.to === 'argument:*') {
      for (const a of args) if (a.premiseRefs.includes(r.targetRef) && a.id !== r.from) edges.push({ id: r.id, from: r.from, to: a.id, operator: r.operator, targetRef: r.targetRef });
    } else {
      edges.push({ id: r.id, from: r.from, to: r.to, operator: r.operator, targetRef: r.targetRef ?? null });
    }
  }
  return edges;
}

function supportReaches(argsFor, startClaim, targetClaim) {
  const seen = new Set();
  const stack = [startClaim];
  while (stack.length) {
    const c = stack.pop();
    if (seen.has(c)) continue;
    seen.add(c);
    for (const a of argsFor[c] ?? []) {
      for (const p of a.premiseRefs) {
        if (p === targetClaim) return true;
        stack.push(p);
      }
    }
  }
  return false;
}

/** Automated structural checks; conservative by design (handoff §36). */
export function structuralFindings(snapshot, edges, labels) {
  const findings = [];
  const units = snapshot.units;
  const args = unitsOfKind(snapshot, 'argument');
  const argsFor = {};
  for (const a of args) (argsFor[a.conclusionRef] ??= []).push(a);
  const attacked = new Set(edges.map((e) => e.to));
  const used = new Set();
  for (const a of args) {
    a.premiseRefs.forEach((p) => used.add(p));
    const concl = units[a.conclusionRef];
    const ranks = a.premiseRefs.map((p) => (units[p].kind === 'claim' ? modalityRank(units[p].modality) : modalityRank('plausible')));
    const weakest = Math.min(...ranks);
    const gap = modalityRank(concl.modality) - weakest;
    if (gap > 0) {
      const weakestIds = a.premiseRefs.filter((p, i) => ranks[i] === weakest);
      findings.push({
        code: 'MODAL_OVERREACH',
        severity: gap >= 2 || a.scheme === 'deductive' ? 'major' : 'minor',
        argument: a.id,
        claim: a.conclusionRef,
        message: `conclusion ${a.conclusionRef} is asserted as '${concl.modality}' but the weakest premise (${weakestIds.join(', ')}) is only '${units[weakestIds[0]].modality}' (${a.scheme} scheme)`
      });
    }
    if (a.premiseRefs.some((p) => supportReaches(argsFor, p, a.conclusionRef))) {
      findings.push({ code: 'CIRCULAR', severity: 'major', argument: a.id, claim: a.conclusionRef, message: `support chain for ${a.conclusionRef} returns to itself` });
    }
    if (!attacked.has(a.id) && labels[a.id] !== 'rejected') {
      findings.push({ code: 'UNCONTESTED', severity: 'info', argument: a.id, message: `${a.id} has no attacks declared against it` });
    }
    if (!(a.warrant || '').trim()) {
      findings.push({ code: 'NO_WARRANT', severity: 'minor', argument: a.id, message: `${a.id} does not state why its premises support its conclusion` });
    }
  }
  for (const c of unitsOfKind(snapshot, 'claim')) {
    const sources = c.sourceRefs ?? [];
    if (c.basis === 'evidence' && !sources.length) {
      findings.push({ code: 'UNSOURCED_PREMISE', severity: 'major', claim: c.id, message: `${c.id} claims an evidential basis but cites no source` });
    } else if (c.basis === 'assumption' && used.has(c.id) && !sources.length) {
      findings.push({ code: 'UNSOURCED_PREMISE', severity: 'info', claim: c.id, message: `${c.id} is an unsourced assumption used as a premise; accepted until undermined` });
    }
    if (c.basis === 'derived' && !(argsFor[c.id] ?? []).length) {
      findings.push({ code: 'DERIVED_UNSUPPORTED', severity: 'major', claim: c.id, message: `${c.id} is marked derived but no argument concludes it` });
    }
  }
  const rebuts = new Set(edges.filter((e) => e.operator === 'rebut').map((e) => `${e.from}>${e.to}`));
  const reported = new Set();
  for (const e of edges) {
    if (e.operator !== 'rebut') continue;
    const back = `${e.to}>${e.from}`;
    if (rebuts.has(back) && !reported.has(back) && labels[e.from] === 'undecided' && labels[e.to] === 'undecided') {
      reported.add(`${e.from}>${e.to}`);
      findings.push({ code: 'STANDOFF', severity: 'info', argument: e.from, message: `${e.from} and ${e.to} rebut each other and neither is defeated: contested` });
    }
  }
  for (const ann of unitsOfKind(snapshot, 'annotation')) {
    if (ann.annotationType === 'fallacy' && !(ann.name in FALLACIES)) {
      findings.push({ code: 'UNKNOWN_FALLACY', severity: 'minor', argument: ann.targetRef, message: `fallacy '${ann.name}' on ${ann.targetRef} is not in the catalogue` });
    }
  }
  const order = { major: 0, minor: 1, info: 2 };
  findings.sort((x, y) => order[x.severity] - order[y.severity] || (x.argument ?? '').localeCompare(y.argument ?? '') || (x.claim ?? '').localeCompare(y.claim ?? '') || x.code.localeCompare(y.code));
  return findings;
}

/**
 * Evaluate a whole snapshot. Returns labels per argument, status per claim,
 * expanded attack edges, structural findings and a verdict per argued claim.
 */
export function evaluateSnapshot(snapshot) {
  const args = unitsOfKind(snapshot, 'argument');
  const edges = attackEdges(snapshot);
  const premises = Object.fromEntries(args.map((a) => [a.id, a.premiseRefs]));
  const supports = {};
  const independent = new Set();
  for (const c of unitsOfKind(snapshot, 'claim')) {
    if (c.basis === 'derived') supports[c.id] = args.filter((a) => a.conclusionRef === c.id).map((a) => a.id);
    else independent.add(c.id);
  }
  for (const a of unitsOfKind(snapshot, 'assumption')) independent.add(a.id);
  const result = evaluateGrounded({ arguments: args.map((a) => a.id), attacks: edges, premises, supports, independent });
  // Claims that are independently established but also argued for: report supporters.
  const verdicts = {};
  for (const c of unitsOfKind(snapshot, 'claim')) {
    const sup = args.filter((a) => a.conclusionRef === c.id);
    if (!sup.length) continue;
    verdicts[c.id] = {
      claim: c.id,
      status: result.claims[c.id] ?? (independent.has(c.id) ? 'established' : 'open'),
      supporting: sup.map((a) => ({ argument: a.id, label: result.labels[a.id] }))
    };
  }
  const findings = structuralFindings(snapshot, edges, result.labels);
  const issue = unitsOfKind(snapshot, 'issue')[0] ?? null;
  const thesis = issue?.thesisRef ? { claim: issue.thesisRef, status: result.claims[issue.thesisRef] ?? (independent.has(issue.thesisRef) ? 'established' : 'open'), supporting: verdicts[issue.thesisRef]?.supporting ?? [] } : null;
  return {
    evaluator: EVALUATOR_ID,
    evaluatorVersion: EVALUATOR_VERSION,
    accepted: result.accepted,
    rejected: result.rejected,
    undecided: result.undecided,
    labels: result.labels,
    claims: result.claims,
    derivation: result.derivation,
    edges,
    verdicts,
    thesis,
    findings
  };
}
