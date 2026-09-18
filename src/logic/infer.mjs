/**
 * Logic IR inference core — a faithful mirror of knowshowgo/src/logic_ir/infer.js.
 * Same rules (universal modus ponens, modus ponens, hypothetical syllogism,
 * reiteration), same decisions and diagnostics, over the IR mirror in ./ir.mjs.
 * The fake KSG client evaluates evaluateLogicInference through this, so an
 * offline round-trip matches what the real server would decide.
 * Parity-checked in test/logic.test.mjs against vectors from KSG's module.
 */
import {
  KINDS,
  canonicalize,
  hashIr,
  render,
  strictEvaluate
} from './ir.mjs';

export const INFERENCE_REVISION = 'logic-ir-infer@0.0.1';

export const INFERENCE_DECISION = Object.freeze({
  VALID: 'valid',
  INVALID: 'invalid',
  UNRESOLVED: 'unresolved'
});

export const INFERENCE_RULE = Object.freeze({
  UNIVERSAL_MODUS_PONENS: 'universal_modus_ponens',
  MODUS_PONENS: 'modus_ponens',
  HYPOTHETICAL_SYLLOGISM: 'hypothetical_syllogism',
  REITERATION: 'reiteration'
});

const HS_BOUND = { kind: KINDS.Variable, name: '__hs__' };

function expr(ir) {
  if (!ir || typeof ir !== 'object') return ir;
  if (ir.expression && typeof ir.expression === 'object') return ir.expression;
  return ir;
}

function clone(value) {
  return value && typeof value === 'object' ? JSON.parse(JSON.stringify(value)) : value;
}

function sameIr(left, right) {
  if (!left || !right) return false;
  try {
    return hashIr(left) === hashIr(right);
  } catch {
    return false;
  }
}

function refUuid(node) {
  const value = expr(node);
  if (!value || typeof value !== 'object') return null;
  return value.uuid || null;
}

function substitute(node, varName, replacement) {
  if (!node || typeof node !== 'object') return node;
  const current = expr(node);
  if (current.kind === KINDS.Variable && current.name === varName) {
    return clone(replacement);
  }
  if (Array.isArray(current)) {
    return current.map((item) => substitute(item, varName, replacement));
  }
  const out = { ...current };
  for (const [key, value] of Object.entries(out)) {
    if (key === 'kind' || key === 'logicIrVersion' || key === 'name') continue;
    out[key] = substitute(value, varName, replacement);
  }
  return out;
}

function unify(pattern, fact, varName, env = {}) {
  if (!pattern || !fact) return null;
  const left = expr(pattern);
  const right = expr(fact);
  if (left.kind === KINDS.Variable && left.name === varName) {
    if (env[varName] && !sameIr(env[varName], right)) return null;
    env[varName] = clone(right);
    return env;
  }
  if (left.kind === KINDS.ConceptRef || left.kind === KINDS.EntityRef) {
    return refUuid(left) && refUuid(left) === refUuid(right) ? env : null;
  }
  if (left.kind !== right.kind) return null;
  if (left.kind === KINDS.Predicate) {
    if (refUuid(left.predicate) !== refUuid(right.predicate)) return null;
    const leftArgs = left.args || [];
    const rightArgs = right.args || [];
    if (leftArgs.length !== rightArgs.length) return null;
    for (let i = 0; i < leftArgs.length; i += 1) {
      if (!unify(leftArgs[i], rightArgs[i], varName, env)) return null;
    }
    return env;
  }
  if (sameIr(left, right)) return env;
  return null;
}

function tryReiteration(premises, conclusion) {
  const match = premises.find((premise) => sameIr(premise.ir, conclusion.ir));
  if (!match) return null;
  return {
    rule: INFERENCE_RULE.REITERATION,
    from: [match.uuid].filter(Boolean)
  };
}

function tryModusPonens(premises, conclusion) {
  for (const implication of premises) {
    const node = expr(implication.ir);
    if (node?.kind !== KINDS.Implies) continue;
    for (const fact of premises) {
      if (fact === implication) continue;
      if (!sameIr(node.if, fact.ir)) continue;
      if (!sameIr(node.then, conclusion.ir)) continue;
      return {
        rule: INFERENCE_RULE.MODUS_PONENS,
        from: [implication.uuid, fact.uuid].filter(Boolean)
      };
    }
  }
  return null;
}

function implicationParts(ir) {
  const node = expr(ir);
  if (node?.kind === KINDS.Implies) {
    return { if: node.if, then: node.then };
  }
  if (node?.kind === KINDS.ForAll) {
    const varName = node.variable?.name;
    const body = expr(node.body);
    if (!varName || body?.kind !== KINDS.Implies) return null;
    return {
      if: substitute(body.if, varName, HS_BOUND),
      then: substitute(body.then, varName, HS_BOUND)
    };
  }
  return null;
}

function tryHypotheticalSyllogism(premises, conclusion) {
  const conc = implicationParts(conclusion.ir);
  if (!conc) return null;
  const implications = premises
    .map((premise) => ({ premise, parts: implicationParts(premise.ir) }))
    .filter((item) => item.parts);
  for (const first of implications) {
    for (const second of implications) {
      if (first === second) continue;
      if (!sameIr(first.parts.then, second.parts.if)) continue;
      if (!sameIr(first.parts.if, conc.if) || !sameIr(second.parts.then, conc.then)) continue;
      return {
        rule: INFERENCE_RULE.HYPOTHETICAL_SYLLOGISM,
        from: [first.premise.uuid, second.premise.uuid].filter(Boolean)
      };
    }
  }
  return null;
}

function tryUniversalModusPonens(premises, conclusion) {
  for (const general of premises) {
    const node = expr(general.ir);
    if (node?.kind !== KINDS.ForAll) continue;
    const varName = node.variable?.name;
    const body = expr(node.body);
    if (!varName || body?.kind !== KINDS.Implies) continue;
    for (const fact of premises) {
      if (fact === general) continue;
      const env = unify(body.if, fact.ir, varName, {});
      if (!env || !env[varName]) continue;
      const derived = substitute(body.then, varName, env[varName]);
      if (!sameIr(derived, conclusion.ir)) continue;
      return {
        rule: INFERENCE_RULE.UNIVERSAL_MODUS_PONENS,
        from: [general.uuid, fact.uuid].filter(Boolean),
        substitution: { [varName]: env[varName] },
        derived
      };
    }
  }
  return null;
}

function blockedStatus(item) {
  const evaluation = strictEvaluate({
    ir: item.ir,
    bindings: item.bindings || []
  });
  return evaluation;
}

/**
 * @param {{ premises: Array<{ ir, bindings?, uuid? }>, conclusion: { ir, bindings?, uuid? } }} input
 */
export function inferArgument({ premises = [], conclusion } = {}) {
  if (!conclusion || !conclusion.ir) {
    return {
      decision: INFERENCE_DECISION.UNRESOLVED,
      inferenceRevision: INFERENCE_REVISION,
      diagnostics: [{ code: 'I003', message: 'conclusion Logic IR is missing' }]
    };
  }
  if (!Array.isArray(premises) || premises.length === 0) {
    return {
      decision: INFERENCE_DECISION.INVALID,
      inferenceRevision: INFERENCE_REVISION,
      diagnostics: [{ code: 'I002', message: 'no premises' }]
    };
  }

  const premiseEvals = premises.map((premise, index) => ({
    index,
    uuid: premise.uuid || null,
    evaluation: blockedStatus(premise)
  }));
  const blocked = premiseEvals.filter((item) => item.evaluation.blocked);
  const conclusionEval = blockedStatus(conclusion);
  if (blocked.length > 0 || conclusionEval.blocked) {
    return {
      decision: INFERENCE_DECISION.UNRESOLVED,
      inferenceRevision: INFERENCE_REVISION,
      rule: null,
      diagnostics: [
        ...blocked.flatMap((item) => item.evaluation.diagnostics || []),
        ...(conclusionEval.blocked ? conclusionEval.diagnostics || [] : [])
      ],
      rendering: {
        premises: premises.map((item) => render(item.ir)),
        conclusion: render(conclusion.ir)
      }
    };
  }

  const hit = tryUniversalModusPonens(premises, conclusion)
    || tryModusPonens(premises, conclusion)
    || tryHypotheticalSyllogism(premises, conclusion)
    || tryReiteration(premises, conclusion);

  if (hit) {
    return {
      decision: INFERENCE_DECISION.VALID,
      inferenceRevision: INFERENCE_REVISION,
      rule: hit.rule,
      from: hit.from || [],
      substitution: hit.substitution || null,
      derivedHash: hashIr(hit.derived || conclusion.ir),
      conclusionHash: hashIr(conclusion.ir),
      rendering: {
        premises: premises.map((item) => render(item.ir)),
        conclusion: render(conclusion.ir)
      },
      diagnostics: []
    };
  }

  return {
    decision: INFERENCE_DECISION.INVALID,
    inferenceRevision: INFERENCE_REVISION,
    rule: null,
    diagnostics: [{
      code: 'I002',
      message: 'conclusion is not entailed by the supplied premises under modus ponens or hypothetical syllogism'
    }],
    rendering: {
      premises: premises.map((item) => render(item.ir)),
      conclusion: render(conclusion.ir)
    }
  };
}
