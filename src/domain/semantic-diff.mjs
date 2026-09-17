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
  terms: 'grounding',
  proposition: 'claim content',
  logicIr: 'claim content',
  logicText: 'claim content',
  ksgRef: 'grounding',
  label: 'claim content',
  aliases: 'grounding',
  definition: 'claim content',
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


/**
 * Differences between two evaluations of two snapshots: argument labels,
 * native logic results, claim statuses and grounding states (spec v1.1 §13.2).
 */
export function evaluationDiff(before, after) {
  const changes = [];
  const ids = (a, b) => [...new Set([...Object.keys(a ?? {}), ...Object.keys(b ?? {})])].sort();
  for (const id of ids(before.labels, after.labels)) if (before.labels?.[id] !== after.labels?.[id]) changes.push({ id, dimension: 'argument', before: before.labels?.[id] ?? null, after: after.labels?.[id] ?? null });
  for (const id of ids(before.logic?.arguments, after.logic?.arguments)) {
    const a = before.logic?.arguments?.[id]?.result ?? null;
    const b = after.logic?.arguments?.[id]?.result ?? null;
    if (a !== b) changes.push({ id, dimension: 'logical', before: a, after: b, evaluator: after.logic?.arguments?.[id]?.evaluator ?? before.logic?.arguments?.[id]?.evaluator });
  }
  for (const id of ids(before.claims, after.claims)) if (before.claims?.[id] !== after.claims?.[id]) changes.push({ id, dimension: 'claim', before: before.claims?.[id] ?? null, after: after.claims?.[id] ?? null });
  for (const id of ids(before.grounding, after.grounding)) {
    const a = before.grounding?.[id];
    const b = after.grounding?.[id];
    const ta = JSON.stringify((a?.terms ?? []).map((t) => [t.symbol, t.conceptRef]));
    const tb = JSON.stringify((b?.terms ?? []).map((t) => [t.symbol, t.conceptRef]));
    if (ta !== tb) changes.push({ id, dimension: 'grounding', before: (a?.terms ?? []).map((t) => `${t.symbol} → ${t.conceptRef ?? '?'}`), after: (b?.terms ?? []).map((t) => `${t.symbol} → ${t.conceptRef ?? '?'}`) });
  }
  const dcount = (ev) => { const c = { red: 0, yellow: 0, green: 0 }; for (const d of ev.diagnostics ?? []) c[d.state] += 1; return c; };
  return { changes, diagnostics: { before: dcount(before), after: dcount(after) }, thesis: { before: before.thesis?.status ?? null, after: after.thesis?.status ?? null } };
}

export function formatEvaluationDiff(ed) {
  const lines = [];
  for (const c of ed.changes) {
    if (c.dimension === 'grounding') { lines.push(`GROUNDING ${c.id}`); for (const b of c.before) lines.push(`- ${b}`); for (const a of c.after) lines.push(`+ ${a}`); }
    else lines.push(`EVALUATION ${c.id} [${c.dimension}${c.evaluator ? ' ' + c.evaluator : ''}]: ${c.before ?? '—'} → ${c.after ?? '—'}`);
  }
  if (ed.thesis.before !== ed.thesis.after) lines.push(`THESIS: ${ed.thesis.before ?? '—'} → ${ed.thesis.after ?? '—'}`);
  const b = ed.diagnostics.before; const a = ed.diagnostics.after;
  lines.push(`DIAGNOSTICS red ${b.red}→${a.red} · yellow ${b.yellow}→${a.yellow} · green ${b.green}→${a.green}`);
  return lines.join('\n');
}
