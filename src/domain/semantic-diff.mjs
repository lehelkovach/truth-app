/**
 * Semantic diff between two snapshots.
 *
 * Reports added / removed / revised units and relations, and classifies each
 * revision by the diff classes in the handoff: claim content, evidence,
 * inference, status, grounding, scope/context.
 */

import { serialize } from './canonicalize.mjs';

const CLASS_BY_FIELD = {
  text: 'claim content',
  title: 'claim content',
  question: 'claim content',
  modality: 'claim content',
  claimKind: 'claim content',
  basis: 'grounding',
  sourceRefs: 'evidence',
  sourceRef: 'evidence',
  fragment: 'evidence',
  premiseRefs: 'inference',
  conclusionRef: 'inference',
  scheme: 'inference',
  warrant: 'inference',
  strict: 'inference',
  status: 'status',
  scope: 'scope/context',
  prediction: 'scope/context',
  falsificationCriterion: 'scope/context',
  positionRef: 'scope/context',
  notes: 'annotation',
  provenance: 'provenance'
};

function changedFields(a, b) {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  const out = [];
  for (const k of keys) {
    if (serialize(a[k]) !== serialize(b[k])) out.push(k);
  }
  return out.sort();
}

function diffCollection(before, after) {
  const added = [];
  const removed = [];
  const revised = [];
  const ids = new Set([...Object.keys(before), ...Object.keys(after)]);
  for (const id of [...ids].sort()) {
    const a = before[id];
    const b = after[id];
    if (!a && b) added.push({ id, kind: b.kind ?? b.operator, unit: b });
    else if (a && !b) removed.push({ id, kind: a.kind ?? a.operator, unit: a });
    else if (serialize(a) !== serialize(b)) {
      const fields = changedFields(a, b);
      const classes = [...new Set(fields.map((f) => CLASS_BY_FIELD[f] ?? 'other'))].sort();
      revised.push({ id, kind: b.kind ?? b.operator, fields, classes, before: a, after: b });
    }
  }
  return { added, removed, revised };
}

export function semanticDiff(before, after) {
  const units = diffCollection(before.units, after.units);
  const relations = diffCollection(before.relations, after.relations);
  const affected = new Set();
  for (const r of [...units.added, ...units.removed, ...units.revised]) affected.add(r.id);
  for (const r of [...relations.added, ...relations.removed, ...relations.revised]) {
    affected.add(r.id);
    const rel = r.unit ?? r.after;
    if (rel?.from) affected.add(rel.from);
    if (rel?.to) affected.add(rel.to);
  }
  const classes = new Set();
  for (const r of units.revised) r.classes.forEach((c) => classes.add(c));
  for (const r of relations.revised) r.classes.forEach((c) => classes.add(c));
  if (units.added.length || units.removed.length) {
    for (const r of [...units.added, ...units.removed]) classes.add(r.kind === 'evidence' || r.kind === 'source' ? 'evidence' : 'claim content');
  }
  if (relations.added.length || relations.removed.length) classes.add('inference');
  return {
    units,
    relations,
    classes: [...classes].sort(),
    affected: [...affected].sort(),
    empty: !units.added.length && !units.removed.length && !units.revised.length && !relations.added.length && !relations.removed.length && !relations.revised.length
  };
}

export function formatDiff(diff) {
  const lines = [];
  for (const u of diff.units.added) lines.push(`+ ${u.id} (${u.kind})`);
  for (const u of diff.units.removed) lines.push(`- ${u.id} (${u.kind})`);
  for (const u of diff.units.revised) lines.push(`~ ${u.id} (${u.kind}) ${u.fields.join(', ')} [${u.classes.join(', ')}]`);
  for (const r of diff.relations.added) lines.push(`+ ${r.id} ${r.unit.from} ${r.unit.operator} ${r.unit.to}`);
  for (const r of diff.relations.removed) lines.push(`- ${r.id} ${r.unit.from} ${r.unit.operator} ${r.unit.to}`);
  for (const r of diff.relations.revised) lines.push(`~ ${r.id} ${r.fields.join(', ')}`);
  if (!lines.length) lines.push('(no semantic change)');
  return lines.join('\n');
}
