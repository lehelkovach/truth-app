/**
 * Logic IR v0.0.1 — a faithful mirror of `knowshowgo/src/logic_ir/core.js`.
 *
 * KSG's Logic IR is the canonical reasoning representation (spec v1.1 §6,
 * "extend; do not fork"). This file adds nothing to the language: same AST
 * kinds, same validation codes (E001–E006), same canonicalisation (And/Or
 * arguments sorted, keys sorted, version-wrapped root) and therefore the same
 * `sha256:` hash for the same expression. `test/logic-ir-parity.test.mjs`
 * checks it against vectors produced by KSG's module. It exists here only
 * because `@lehelkovach/knowshowgo-client` does not export the core yet
 * (docs/OPEN_QUESTIONS.md); when it does, this file becomes a re-export.
 */

import { createHash } from 'node:crypto';

export const LOGIC_IR_VERSION = '0.0.1';

export const KINDS = Object.freeze({
  ConceptRef: 'ConceptRef',
  EntityRef: 'EntityRef',
  Variable: 'Variable',
  Predicate: 'Predicate',
  Not: 'Not',
  And: 'And',
  Or: 'Or',
  Implies: 'Implies',
  ForAll: 'ForAll',
  Exists: 'Exists'
});

export const BINDING_STATUS = Object.freeze({ RESOLVED: 'resolved', UNRESOLVED: 'unresolved', AMBIGUOUS: 'ambiguous', CONFLICTING: 'conflicting' });
export const DIAGNOSTIC_CODES = Object.freeze({ E001: 'E001', E002: 'E002', E003: 'E003', E004: 'E004', E005: 'E005', E006: 'E006' });

const KIND_SET = new Set(Object.values(KINDS));

function diagnostic(code, message, extra = {}) {
  return {
    code,
    severity: extra.severity || 'error',
    message,
    ...(extra.path ? { path: extra.path } : {}),
    ...(extra.sourceSpan ? { sourceSpan: extra.sourceSpan } : {}),
    ...(extra.relatedUuids ? { relatedUuids: extra.relatedUuids } : {})
  };
}

const uniqueStrings = (values) => [...new Set(values.filter((v) => v !== null && v !== undefined && String(v).trim()).map(String))];

export const conceptRef = (uuid, revisionUuid = undefined) => ({ kind: KINDS.ConceptRef, uuid, ...(revisionUuid ? { revisionUuid } : {}) });
export const entityRef = (uuid, revisionUuid = undefined) => ({ kind: KINDS.EntityRef, uuid, ...(revisionUuid ? { revisionUuid } : {}) });
export const variable = (name) => ({ kind: KINDS.Variable, name });
export const predicate = (concept, args = []) => ({ kind: KINDS.Predicate, predicate: concept, args });
export const not = (of) => ({ kind: KINDS.Not, of });
export const and = (args) => ({ kind: KINDS.And, args });
export const or = (args) => ({ kind: KINDS.Or, args });
export const implies = (ifNode, thenNode) => ({ kind: KINDS.Implies, if: ifNode, then: thenNode });
export const forAll = (variableNode, body) => ({ kind: KINDS.ForAll, variable: variableNode, body });
export const exists = (variableNode, body) => ({ kind: KINDS.Exists, variable: variableNode, body });

export function wrapRoot(node) {
  if (!node || typeof node !== 'object') return node;
  if (node.logicIrVersion) return node;
  return { logicIrVersion: LOGIC_IR_VERSION, ...node };
}

export function expressionOf(ir) {
  if (!ir || typeof ir !== 'object') return ir;
  return ir.expression || ir;
}

export function walk(node, path, visit) {
  if (!node || typeof node !== 'object') return;
  visit(node, path);
  switch (node.kind) {
    case KINDS.Predicate:
      walk(node.predicate, `${path}.predicate`, visit);
      if (Array.isArray(node.args)) node.args.forEach((arg, i) => walk(arg, `${path}.args[${i}]`, visit));
      break;
    case KINDS.Not:
      walk(node.of, `${path}.of`, visit);
      break;
    case KINDS.And:
    case KINDS.Or:
      if (Array.isArray(node.args)) node.args.forEach((arg, i) => walk(arg, `${path}.args[${i}]`, visit));
      break;
    case KINDS.Implies:
      walk(node.if, `${path}.if`, visit);
      walk(node.then, `${path}.then`, visit);
      break;
    case KINDS.ForAll:
    case KINDS.Exists:
      walk(node.variable, `${path}.variable`, visit);
      walk(node.body, `${path}.body`, visit);
      break;
    default:
      break;
  }
}

export function validate(ir) {
  const diagnostics = [];
  if (!ir || typeof ir !== 'object' || Array.isArray(ir)) {
    return { ok: false, diagnostics: [diagnostic(DIAGNOSTIC_CODES.E006, 'Logic IR must be an object', { path: '$' })] };
  }
  const version = ir.logicIrVersion || ir.version;
  if (version !== LOGIC_IR_VERSION) diagnostics.push(diagnostic(DIAGNOSTIC_CODES.E006, `logicIrVersion must be "${LOGIC_IR_VERSION}"`, { path: '$.logicIrVersion' }));
  const root = expressionOf(ir);
  if (!root || typeof root !== 'object' || !root.kind) {
    diagnostics.push(diagnostic(DIAGNOSTIC_CODES.E006, 'Logic IR expression is missing', { path: '$' }));
    return { ok: false, diagnostics };
  }
  walk(root, '$', (node, path) => {
    if (!KIND_SET.has(node.kind)) { diagnostics.push(diagnostic(DIAGNOSTIC_CODES.E006, `unsupported Logic IR kind: ${node.kind}`, { path })); return; }
    if ((node.kind === KINDS.ConceptRef || node.kind === KINDS.EntityRef) && (!node.uuid || !String(node.uuid).trim())) diagnostics.push(diagnostic(DIAGNOSTIC_CODES.E004, `${node.kind} is missing uuid`, { path }));
    if (node.kind === KINDS.Variable && !String(node.name || '').trim()) diagnostics.push(diagnostic(DIAGNOSTIC_CODES.E006, 'Variable name is required', { path }));
    if (node.kind === KINDS.Predicate) {
      if (!node.predicate || node.predicate.kind !== KINDS.ConceptRef) diagnostics.push(diagnostic(DIAGNOSTIC_CODES.E006, 'Predicate.predicate must be a ConceptRef', { path: `${path}.predicate` }));
      if (!Array.isArray(node.args)) diagnostics.push(diagnostic(DIAGNOSTIC_CODES.E005, 'Predicate.args must be an array', { path: `${path}.args` }));
    }
    if ((node.kind === KINDS.And || node.kind === KINDS.Or) && (!Array.isArray(node.args) || node.args.length < 2)) diagnostics.push(diagnostic(DIAGNOSTIC_CODES.E006, `${node.kind} requires at least two arguments`, { path: `${path}.args` }));
    if (node.kind === KINDS.Implies && (!node.if || !node.then)) diagnostics.push(diagnostic(DIAGNOSTIC_CODES.E006, 'Implies requires if and then', { path }));
    if ((node.kind === KINDS.ForAll || node.kind === KINDS.Exists) && (!node.variable || !node.body)) diagnostics.push(diagnostic(DIAGNOSTIC_CODES.E006, `${node.kind} requires variable and body`, { path }));
    if (node.kind === KINDS.Not && !node.of) diagnostics.push(diagnostic(DIAGNOSTIC_CODES.E006, 'Not requires of', { path }));
  });
  return { ok: diagnostics.length === 0, diagnostics };
}

function sortedObject(value) {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(sortedObject);
  const out = {};
  for (const key of Object.keys(value).sort()) {
    if (value[key] === undefined) continue;
    out[key] = sortedObject(value[key]);
  }
  return out;
}

function canonicalizeNode(node) {
  if (!node || typeof node !== 'object') return node;
  const kind = node.kind;
  if (kind === KINDS.And || kind === KINDS.Or) {
    const args = (node.args || []).map(canonicalizeNode);
    const serialized = args.map((arg) => serialize(arg));
    const order = serialized.map((_, i) => i).sort((a, b) => (serialized[a] < serialized[b] ? -1 : 1));
    return { kind, args: order.map((i) => args[i]) };
  }
  if (kind === KINDS.Predicate) return { kind, predicate: canonicalizeNode(node.predicate), args: (node.args || []).map(canonicalizeNode) };
  if (kind === KINDS.Not) return { kind, of: canonicalizeNode(node.of) };
  if (kind === KINDS.Implies) return { kind, if: canonicalizeNode(node.if), then: canonicalizeNode(node.then) };
  if (kind === KINDS.ForAll || kind === KINDS.Exists) return { kind, variable: canonicalizeNode(node.variable), body: canonicalizeNode(node.body) };
  if (kind === KINDS.ConceptRef || kind === KINDS.EntityRef) return { kind, uuid: node.uuid, ...(node.revisionUuid ? { revisionUuid: node.revisionUuid } : {}) };
  if (kind === KINDS.Variable) return { kind, name: node.name };
  return node;
}

export function canonicalize(ir) {
  const root = wrapRoot(ir);
  const expr = expressionOf(root);
  return sortedObject({ logicIrVersion: LOGIC_IR_VERSION, ...canonicalizeNode(expr) });
}

export function serialize(ir) {
  return JSON.stringify(sortedObject(ir));
}

export function hashIr(ir) {
  const canonical = typeof ir === 'string' ? ir : serialize(canonicalize(ir));
  return `sha256:${createHash('sha256').update(canonical).digest('hex')}`;
}

function labelFor(node, names) {
  if (!node) return '?';
  if (node.kind === KINDS.Variable) return node.name;
  if (node.kind === KINDS.ConceptRef || node.kind === KINDS.EntityRef) return names[node.uuid] || names[node.revisionUuid] || String(node.uuid).slice(0, 8);
  return render(node, names);
}

export function render(ir, names = {}) {
  const node = expressionOf(ir);
  if (!node || typeof node !== 'object') return String(node ?? '');
  switch (node.kind) {
    case KINDS.Variable: return node.name;
    case KINDS.ConceptRef:
    case KINDS.EntityRef: return labelFor(node, names);
    case KINDS.Predicate: return `${labelFor(node.predicate, names)}(${(node.args || []).map((arg) => render(arg, names)).join(', ')})`;
    case KINDS.Not: return `¬${render(node.of, names)}`;
    case KINDS.And: return (node.args || []).map((arg) => render(arg, names)).join(' ∧ ');
    case KINDS.Or: return (node.args || []).map((arg) => render(arg, names)).join(' ∨ ');
    case KINDS.Implies: return `${render(node.if, names)} → ${render(node.then, names)}`;
    case KINDS.ForAll: return `∀${render(node.variable, names)} (${render(node.body, names)})`;
    case KINDS.Exists: return `∃${render(node.variable, names)} (${render(node.body, names)})`;
    default: return serialize(node);
  }
}

function collectCandidateUuids(binding) {
  const nested = Array.isArray(binding?.candidates)
    ? binding.candidates.flatMap((item) => (typeof item === 'string' || typeof item === 'number') ? [item] : (!item || typeof item !== 'object') ? [] : [item.uuid, item.targetUuid, item.revisionUuid, item.targetRevisionUuid])
    : [];
  return uniqueStrings([binding?.targetUuid, binding?.targetRevisionUuid, binding?.uuid, binding?.revisionUuid, ...nested]);
}

export function inspectBindings(bindings = []) {
  const list = Array.isArray(bindings) ? bindings : [];
  const inspected = list.map((binding) => {
    const symbol = String(binding.symbol || binding.label || binding.name || 'unknown');
    const uuids = collectCandidateUuids(binding);
    const hinted = binding.status || binding.bindingStatus;
    let status = BINDING_STATUS.RESOLVED;
    if (hinted === BINDING_STATUS.CONFLICTING || hinted === 'conflict') status = BINDING_STATUS.CONFLICTING;
    else if (hinted === BINDING_STATUS.AMBIGUOUS || binding.ambiguous === true || uuids.length > 1) status = BINDING_STATUS.AMBIGUOUS;
    else if (hinted === BINDING_STATUS.UNRESOLVED || binding.resolved === false || uuids.length === 0) status = BINDING_STATUS.UNRESOLVED;
    return {
      symbol,
      status,
      ...(binding.targetUuid || binding.uuid ? { targetUuid: binding.targetUuid || binding.uuid } : {}),
      ...(binding.targetRevisionUuid || binding.revisionUuid ? { targetRevisionUuid: binding.targetRevisionUuid || binding.revisionUuid } : {}),
      ...(status === BINDING_STATUS.AMBIGUOUS || status === BINDING_STATUS.CONFLICTING ? { candidates: uuids } : {}),
      ...(binding.sourceSpan ? { sourceSpan: binding.sourceSpan } : {}),
      ...(binding.provenance ? { provenance: binding.provenance } : {})
    };
  });
  const bySymbol = new Map();
  for (const item of inspected) {
    const prior = bySymbol.get(item.symbol);
    if (!prior) { bySymbol.set(item.symbol, item); continue; }
    if ((prior.status === BINDING_STATUS.RESOLVED && item.status === BINDING_STATUS.RESOLVED && (prior.targetUuid || prior.targetRevisionUuid) !== (item.targetUuid || item.targetRevisionUuid)) || prior.status === BINDING_STATUS.CONFLICTING || item.status === BINDING_STATUS.CONFLICTING) {
      bySymbol.set(item.symbol, { symbol: item.symbol, status: BINDING_STATUS.CONFLICTING, candidates: uniqueStrings([...(prior.candidates || []), ...(item.candidates || []), prior.targetUuid, item.targetUuid]) });
      continue;
    }
    if (item.status === BINDING_STATUS.AMBIGUOUS || prior.status === BINDING_STATUS.AMBIGUOUS) {
      bySymbol.set(item.symbol, { symbol: item.symbol, status: BINDING_STATUS.AMBIGUOUS, candidates: uniqueStrings([...(prior.candidates || []), ...(item.candidates || []), prior.targetUuid, item.targetUuid]) });
      continue;
    }
    if (item.status === BINDING_STATUS.UNRESOLVED || prior.status === BINDING_STATUS.UNRESOLVED) bySymbol.set(item.symbol, { symbol: item.symbol, status: BINDING_STATUS.UNRESOLVED });
  }
  const result = [...bySymbol.values()];
  const diagnostics = [];
  for (const item of result) {
    if (item.status === BINDING_STATUS.UNRESOLVED) diagnostics.push(diagnostic(DIAGNOSTIC_CODES.E001, `UnresolvedSymbol: ${item.symbol}`, { relatedUuids: [], sourceSpan: item.sourceSpan }));
    else if (item.status === BINDING_STATUS.AMBIGUOUS) diagnostics.push(diagnostic(DIAGNOSTIC_CODES.E002, `AmbiguousBinding: ${item.symbol}`, { relatedUuids: item.candidates || [] }));
    else if (item.status === BINDING_STATUS.CONFLICTING) diagnostics.push(diagnostic(DIAGNOSTIC_CODES.E003, `ConflictingBinding: ${item.symbol}`, { relatedUuids: item.candidates || [] }));
  }
  return { bindings: result, diagnostics, evaluationBlocked: diagnostics.length > 0 };
}

export function strictEvaluate({ ir = null, bindings = [] } = {}) {
  const bindingResult = inspectBindings(bindings);
  if (bindingResult.evaluationBlocked) return { ok: false, blocked: true, decision: 'unresolved', diagnostics: bindingResult.diagnostics, bindings: bindingResult.bindings };
  if (!ir) return { ok: false, blocked: true, decision: 'unresolved', diagnostics: [diagnostic(DIAGNOSTIC_CODES.E006, 'Logic IR is missing')], bindings: bindingResult.bindings };
  const validated = validate(ir);
  if (!validated.ok) return { ok: false, blocked: true, decision: 'unresolved', diagnostics: validated.diagnostics, bindings: bindingResult.bindings };
  return { ok: true, blocked: false, decision: 'valid', diagnostics: [], bindings: bindingResult.bindings, canonical: canonicalize(ir), hash: hashIr(ir), rendering: render(ir) };
}

/** Uuids referenced anywhere in an expression, with kind. */
export function referencedUuids(ir) {
  const out = [];
  walk(expressionOf(wrapRoot(ir)), '$', (node) => {
    if (node.kind === KINDS.ConceptRef || node.kind === KINDS.EntityRef) out.push({ kind: node.kind, uuid: node.uuid });
  });
  return out;
}
