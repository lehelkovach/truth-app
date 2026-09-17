/**
 * Evaluators are replaceable projections over one canonical snapshot.
 * Register more (defeasible, probabilistic, LNN) here later; each must be
 * deterministic and must return a plain JSON result.
 */

import { EVALUATOR_ID, EVALUATOR_VERSION, evaluateSnapshot } from '../domain/argumentation.mjs';

const registry = new Map();

export function registerEvaluator({ id, version, run, description = '' }) {
  if (typeof run !== 'function') throw new TypeError('evaluator needs run(snapshot)');
  registry.set(id, { id, version, run, description });
}

export function getEvaluator(id) {
  const e = registry.get(id);
  if (!e) throw new Error(`unknown evaluator ${id}`);
  return e;
}

export function listEvaluators() {
  return [...registry.values()].map(({ id, version, description }) => ({ id, version, description }));
}

registerEvaluator({
  id: EVALUATOR_ID,
  version: EVALUATOR_VERSION,
  description: 'Grounded argumentation + native Logic IR entailment + grounding/equivocation + diagnostics.',
  run: evaluateSnapshot
});
