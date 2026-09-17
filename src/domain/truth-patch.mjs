/**
 * Pure semantic patch application.
 *
 * `applyPatch(snapshot, patch)` returns a new frozen snapshot; the input is
 * never mutated. Each unit and relation carries a `revision` counter and a
 * `contentHash` in `snapshot.revisions[id]`, so a later revision can prove
 * the earlier one is unchanged (REV-001).
 */

import { clone, contentHash, deepFreeze } from './canonicalize.mjs';
import { assertValidPatch, assertValidSnapshot, ValidationError } from './validate.mjs';

export function emptySnapshot() {
  return deepFreeze({ units: {}, relations: {}, revisions: {} });
}

function revisionOf(snapshot, id) {
  return snapshot.revisions?.[id]?.revision ?? 0;
}

function checkTarget(snapshot, coll, target, label) {
  const existing = snapshot[coll][target.id];
  if (!existing) throw new ValidationError(`${label}: ${target.id} does not exist`);
  if (target.revision !== undefined && String(target.revision) !== String(revisionOf(snapshot, target.id))) {
    throw new ValidationError(`${label}: ${target.id} is at revision ${revisionOf(snapshot, target.id)}, patch targets ${target.revision}`);
  }
  return existing;
}

/**
 * @param {object} snapshot frozen snapshot
 * @param {object} patch TruthPatch v0.1
 * @param {{ validate?: boolean }} [opts]
 * @returns {object} new frozen snapshot
 */
export function applyPatch(snapshot, patch, { validate = true } = {}) {
  assertValidPatch(patch);
  const units = { ...snapshot.units };
  const relations = { ...snapshot.relations };
  const revisions = { ...(snapshot.revisions || {}) };
  const bump = (id, value) => {
    revisions[id] = { revision: revisionOf({ revisions }, id) + 1, contentHash: contentHash(value) };
  };

  for (const op of patch.operations) {
    switch (op.op) {
      case 'addUnit': {
        if (units[op.unit.id]) throw new ValidationError(`addUnit: ${op.unit.id} already exists (use reviseUnit)`);
        units[op.unit.id] = clone(op.unit);
        bump(op.unit.id, units[op.unit.id]);
        break;
      }
      case 'reviseUnit': {
        const existing = checkTarget({ units, relations, revisions }, 'units', op.target, 'reviseUnit');
        const next = { ...clone(existing), ...clone(op.next), id: existing.id, kind: existing.kind };
        units[existing.id] = next;
        bump(existing.id, next);
        break;
      }
      case 'retractUnit': {
        const existing = checkTarget({ units, relations, revisions }, 'units', op.target, 'retractUnit');
        const next = { ...clone(existing), status: 'retracted' };
        units[existing.id] = next;
        bump(existing.id, next);
        break;
      }
      case 'addRelation': {
        if (relations[op.relation.id]) throw new ValidationError(`addRelation: ${op.relation.id} already exists`);
        relations[op.relation.id] = clone(op.relation);
        bump(op.relation.id, relations[op.relation.id]);
        break;
      }
      case 'reviseRelation': {
        const existing = checkTarget({ units, relations, revisions }, 'relations', op.target, 'reviseRelation');
        const next = { ...clone(existing), ...clone(op.next), id: existing.id };
        relations[existing.id] = next;
        bump(existing.id, next);
        break;
      }
      case 'retractRelation': {
        const existing = checkTarget({ units, relations, revisions }, 'relations', op.target, 'retractRelation');
        const next = { ...clone(existing), status: 'retracted' };
        relations[existing.id] = next;
        bump(existing.id, next);
        break;
      }
      default:
        throw new ValidationError(`unknown op ${op.op}`);
    }
  }
  const next = { units, relations, revisions };
  if (validate) assertValidSnapshot(next);
  return deepFreeze(next);
}

/** Live (non-retracted) units of a kind, in id order. */
export function unitsOfKind(snapshot, kind) {
  return Object.values(snapshot.units)
    .filter((u) => u.kind === kind && u.status !== 'retracted' && u.status !== 'deprecated')
    .sort((a, b) => a.id.localeCompare(b.id));
}

export function liveRelations(snapshot, operators = null) {
  return Object.values(snapshot.relations)
    .filter((r) => r.status !== 'retracted' && r.status !== 'deprecated' && (!operators || operators.includes(r.operator)))
    .sort((a, b) => a.id.localeCompare(b.id));
}
