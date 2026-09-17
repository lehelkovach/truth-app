/**
 * Schema validation (AJV, JSON Schema draft-07) plus the referential
 * invariants a schema cannot express: every ref resolves, premises and
 * conclusions are claims, undermine names a premise, and so on.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import Ajv from 'ajv';

const here = dirname(fileURLToPath(import.meta.url));
const schemaDir = join(here, '..', '..', 'schema');

function loadSchema(name) {
  return JSON.parse(readFileSync(join(schemaDir, name), 'utf8'));
}

export const profileSchema = loadSchema('truthir-profile-v0.1.schema.json');
export const patchSchema = loadSchema('truth-patch-v0.1.schema.json');
export const commitSchema = loadSchema('truth-commit-v0.1.schema.json');

const ajv = new Ajv({ allErrors: true, strict: false });
ajv.addSchema(profileSchema, 'truthir-profile-v0.1.schema.json');
ajv.addSchema(patchSchema, 'truth-patch-v0.1.schema.json');
ajv.addSchema(commitSchema, 'truth-commit-v0.1.schema.json');

const validateUnitSchema = ajv.compile({ $ref: 'truthir-profile-v0.1.schema.json#/definitions/unit' });
const validateRelationSchema = ajv.compile({ $ref: 'truthir-profile-v0.1.schema.json#/definitions/relation' });
const validateSnapshotSchema = ajv.getSchema('truthir-profile-v0.1.schema.json');
const validatePatchSchema = ajv.getSchema('truth-patch-v0.1.schema.json');
const validateCommitSchema = ajv.getSchema('truth-commit-v0.1.schema.json');

function formatErrors(errors) {
  // AJV's oneOf produces a wall of alternatives; keep the most specific messages.
  return (errors || [])
    .filter((e) => e.keyword !== 'oneOf' && e.keyword !== 'allOf' && e.keyword !== 'const')
    .map((e) => `${e.instancePath || '/'} ${e.message}${e.params?.additionalProperty ? ` (${e.params.additionalProperty})` : ''}`);
}

export class ValidationError extends Error {
  constructor(message, problems = []) {
    super(problems.length ? `${message}:\n  ${problems.join('\n  ')}` : message);
    this.name = 'ValidationError';
    this.problems = problems;
  }
}

export function unitSchemaProblems(unit) {
  return validateUnitSchema(unit) ? [] : formatErrors(validateUnitSchema.errors).map((m) => `${unit?.id ?? '?'}: ${m}`);
}

export function relationSchemaProblems(relation) {
  return validateRelationSchema(relation) ? [] : formatErrors(validateRelationSchema.errors).map((m) => `${relation?.id ?? '?'}: ${m}`);
}

export function patchSchemaProblems(patch) {
  return validatePatchSchema(patch) ? [] : formatErrors(validatePatchSchema.errors);
}

export function commitSchemaProblems(commit) {
  return validateCommitSchema(commit) ? [] : formatErrors(validateCommitSchema.errors);
}

const LIVE = new Set(['proposed', 'accepted']);

/**
 * Referential invariants over a whole snapshot. Retracted units are ignored
 * as targets, so retracting a claim that an argument still uses is reported.
 */
export function snapshotInvariantProblems(snapshot) {
  const problems = [];
  const units = snapshot.units || {};
  const relations = snapshot.relations || {};
  const live = (ref) => units[ref] && LIVE.has(units[ref].status);
  const kindOf = (ref) => units[ref]?.kind;
  const need = (owner, ref, kinds, label) => {
    if (!ref) return;
    if (!live(ref)) problems.push(`${owner}: ${label} ${ref} does not resolve to a live unit`);
    else if (kinds && !kinds.includes(kindOf(ref))) problems.push(`${owner}: ${label} ${ref} is a ${kindOf(ref)}, expected ${kinds.join('|')}`);
  };
  for (const [id, u] of Object.entries(units)) {
    if (u.id !== id) problems.push(`${id}: unit id mismatch (${u.id})`);
    if (!LIVE.has(u.status)) continue;
    switch (u.kind) {
      case 'position':
        need(id, u.issueRef, ['issue'], 'issueRef');
        break;
      case 'claim':
        need(id, u.positionRef, ['position'], 'positionRef');
        for (const s of u.sourceRefs || []) need(id, s, ['source'], 'sourceRef');
        break;
      case 'argument':
        for (const p of u.premiseRefs || []) need(id, p, ['claim', 'assumption'], 'premise');
        need(id, u.conclusionRef, ['claim'], 'conclusionRef');
        if ((u.premiseRefs || []).includes(u.conclusionRef)) problems.push(`${id}: conclusion ${u.conclusionRef} is also a premise`);
        need(id, u.positionRef, ['position'], 'positionRef');
        for (const s of u.sourceRefs || []) need(id, s, ['source'], 'sourceRef');
        break;
      case 'evidence':
        need(id, u.sourceRef, ['source'], 'sourceRef');
        break;
      case 'hypothesis':
        need(id, u.claimRef, ['claim'], 'claimRef');
        break;
      case 'theory':
        for (const h of u.hypothesisRefs || []) need(id, h, ['hypothesis'], 'hypothesisRef');
        for (const a of u.assumptionRefs || []) need(id, a, ['assumption', 'claim'], 'assumptionRef');
        break;
      case 'annotation':
        need(id, u.targetRef, null, 'targetRef');
        need(id, u.byRef, ['position', 'actor'], 'byRef');
        if (u.where && u.where.startsWith('premise:')) {
          const pid = u.where.slice('premise:'.length);
          const target = units[u.targetRef];
          if (target?.kind === 'argument' && !(target.premiseRefs || []).includes(pid)) problems.push(`${id}: ${pid} is not a premise of ${u.targetRef}`);
        }
        break;
      case 'issue':
        need(id, u.thesisRef, ['claim'], 'thesisRef');
        break;
      default:
        break;
    }
  }
  for (const [id, r] of Object.entries(relations)) {
    if (r.id !== id) problems.push(`${id}: relation id mismatch (${r.id})`);
    if (!LIVE.has(r.status)) continue;
    const wildcard = r.to === 'argument:*';
    need(id, r.from, null, 'from');
    if (!wildcard) need(id, r.to, null, 'to');
    else if (r.operator !== 'undermine') problems.push(`${id}: only undermine may target argument:*`);
    if (r.from === r.to) problems.push(`${id}: relation from a unit to itself`);
    if (['rebut', 'undercut', 'undermine', 'attacks'].includes(r.operator)) {
      if (kindOf(r.from) !== 'argument') problems.push(`${id}: ${r.operator} must come from an argument (got ${kindOf(r.from)})`);
      if (!wildcard && kindOf(r.to) !== 'argument') problems.push(`${id}: ${r.operator} must target an argument (got ${kindOf(r.to)})`);
    }
    if (r.operator === 'undermine') {
      if (!r.targetRef) problems.push(`${id}: undermine must name the premise in targetRef`);
      else if (units[r.to]?.kind === 'argument' && !(units[r.to].premiseRefs || []).includes(r.targetRef)) problems.push(`${id}: ${r.targetRef} is not a premise of ${r.to}`);
    }
  }
  return problems;
}

export function snapshotProblems(snapshot) {
  const problems = [];
  if (!validateSnapshotSchema(snapshot)) {
    // Re-validate per unit so messages name the offending unit.
    for (const u of Object.values(snapshot.units || {})) problems.push(...unitSchemaProblems(u));
    for (const r of Object.values(snapshot.relations || {})) problems.push(...relationSchemaProblems(r));
    if (!problems.length) problems.push(...formatErrors(validateSnapshotSchema.errors));
  }
  problems.push(...snapshotInvariantProblems(snapshot));
  return problems;
}

export function assertValidSnapshot(snapshot) {
  const problems = snapshotProblems(snapshot);
  if (problems.length) throw new ValidationError('snapshot is not valid', problems);
  return snapshot;
}

export function assertValidPatch(patch) {
  const problems = patchSchemaProblems(patch);
  if (problems.length) throw new ValidationError('patch is not valid', problems);
  return patch;
}

export function assertValidCommit(commit) {
  const problems = commitSchemaProblems(commit);
  if (problems.length) throw new ValidationError('commit is not valid', problems);
  return commit;
}
