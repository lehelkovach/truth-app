/**
 * The composer: a readable, line-based subset for writing a case, and the
 * pipeline behind the editor's underlines. Text -> compact case (with the
 * line of every unit) -> TruthPatch -> validation -> commit on a fresh store
 * -> evaluation -> diagnostics mapped back to lines.
 *
 * Grammar (one statement per line; indented `key: value` lines belong to the
 * statement above; `#` starts a comment):
 *
 *   issue: Does the conclusion follow?
 *   thesis: C3
 *   party author: Author                      # id then display name
 *   concept mammal: An animal of class Mammalia.
 *     aliases: mammals
 *     kind: predicate                          # concept | entity | predicate
 *     sense of: intelligence
 *   entity hermione: A particular cat.         # shorthand for kind: entity
 *   C1 [certain, definition, author]: Every mammal is warm-blooded.
 *     logic: forall x: mammal(x) -> warm_blooded(x)
 *     terms: mammal, warm-blooded, intelligence=intelligence-agency
 *     source: Bostrom 2012 | https://…
 *     kind: empirical                          # empirical | predictive | normative | definitional | conceptual
 *   A1 [deductive, author]: C1, C2 => C3
 *     title: Hermione is warm-blooded
 *     warrant: Universal instantiation, then modus ponens.
 *   B1 undercuts A1: P1 and P2 do not license a prediction.
 *   B3 undermines A2 at P7: Denies compounding returns.
 *   B2 rebuts A4
 *   fallacy A1 equivocation [inference, weakens, skeptic]: 'Intelligence' shifts sense.
 *
 * Claim brackets: modality (speculative|possible|plausible|probable|certain),
 * basis (evidence|definition|assumption|derived), party id; any order, all
 * optional. Argument brackets: scheme, party id.
 */

import { compileCase } from '../domain/authoring.mjs';
import { applyPatch, emptySnapshot } from '../domain/truth-patch.mjs';
import { assertValidPatch, snapshotProblems, ValidationError } from '../domain/validate.mjs';
import { createTruthStore } from './truth-store.mjs';
import { MODALITIES } from '../domain/argumentation.mjs';

const BASES = ['evidence', 'definition', 'assumption', 'derived'];
const SCHEMES = ['deductive', 'inductive', 'abductive', 'analogical', 'expected-value', 'authority', 'extrapolation'];
const KINDS = ['empirical', 'predictive', 'normative', 'definitional', 'conceptual'];
const ATTACKS = { undercuts: 'undercut', undermines: 'undermine', rebuts: 'rebut', attacks: 'attacks', supports: 'supports', qualifies: 'qualifies' };

function splitList(s) {
  return String(s ?? '').split(',').map((x) => x.trim()).filter(Boolean);
}

/**
 * @returns {{ case: object, spans: Record<string, {line:number,start:number,end:number}>, errors: Array<{line:number,message:string}> }}
 */
export function parseComposer(text) {
  const lines = String(text ?? '').split(/\r?\n/);
  const c = { id: 'composed', title: 'Composed case', question: '', parties: [], sources: {}, concepts: {}, propositions: [], arguments: [], attacks: [], fallacies: [] };
  const spans = {};
  const errors = [];
  const partyIds = new Set();
  let current = null; // { kind, obj, line }
  let attackN = 0;
  let sourceN = 0;
  const err = (line, message) => errors.push({ line, message });
  const span = (id, line, start, end) => { spans[id] = { line, start, end }; };
  const partyOf = (tokens, line) => {
    const p = tokens.find((t) => partyIds.has(t));
    return p;
  };

  lines.forEach((raw, i) => {
    const line = i + 1;
    const noComment = raw.replace(/(^|\s)#.*$/, '');
    if (!noComment.trim()) return;
    const indented = /^\s/.test(noComment);
    const s = noComment.trim();
    let m;
    if (indented) {
      if (!current) return err(line, 'property line without a statement above it');
      const kv = /^([a-z][a-z ]*?)\s*:\s*(.*)$/i.exec(s);
      if (!kv) return err(line, `expected "key: value", got "${s}"`);
      const key = kv[1].trim().toLowerCase();
      const value = kv[2].trim();
      const o = current.obj;
      switch (current.kind) {
        case 'claim':
          if (key === 'logic') { o.logic = value; span(`${current.id}#logic`, line, noComment.indexOf(value), noComment.length); }
          else if (key === 'terms') o.terms = splitList(value).map((t) => { const [sym, key2] = t.split('=').map((x) => x.trim()); return key2 ? { symbol: sym, concept: key2 } : sym; });
          else if (key === 'source') { const [title, url] = value.split('|').map((x) => x.trim()); const k = `src${++sourceN}`; c.sources[k] = { title, url: url || undefined }; (o.sources ??= []).push(k); }
          else if (key === 'kind') { if (!KINDS.includes(value)) err(line, `unknown claim kind "${value}"`); else o.kind = value; }
          else if (key === 'modality') { if (!MODALITIES.includes(value)) err(line, `unknown modality "${value}"`); else o.modality = value; }
          else if (key === 'basis') { if (!BASES.includes(value)) err(line, `unknown basis "${value}"`); else o.basis = value; }
          else if (key === 'notes') o.notes = value;
          else if (key === 'predicate') { const [pred, ...roles] = value.split(/\s+/); o.proposition = { predicate: pred, roles: Object.fromEntries(roles.map((r) => r.split('=').map((x) => x.trim()))) }; }
          else err(line, `unknown claim property "${key}"`);
          break;
        case 'argument':
          if (key === 'title') o.title = value;
          else if (key === 'warrant') o.warrant = value;
          else if (key === 'notes') o.notes = value;
          else if (key === 'scheme') { if (!SCHEMES.includes(value)) err(line, `unknown scheme "${value}"`); else o.scheme = value; }
          else if (key === 'source') { const [title, url] = value.split('|').map((x) => x.trim()); const k = `src${++sourceN}`; c.sources[k] = { title, url: url || undefined }; (o.sources ??= []).push(k); }
          else err(line, `unknown argument property "${key}"`);
          break;
        case 'concept':
          if (key === 'aliases') o.aliases = splitList(value);
          else if (key === 'kind') { if (!['concept', 'entity', 'predicate'].includes(value)) err(line, `unknown concept kind "${value}"`); else o.kind = value; }
          else if (key === 'sense of') o.senseOf = value;
          else if (key === 'ksg') o.ksgRef = value;
          else err(line, `unknown concept property "${key}"`);
          break;
        case 'attack':
          if (key === 'note') o.note = value; else err(line, `unknown attack property "${key}"`);
          break;
        default:
          err(line, `"${key}" cannot be set on ${current.kind}`);
      }
      return;
    }
    current = null;
    if ((m = /^issue\s*:\s*(.+)$/i.exec(s))) { c.question = m[1].trim(); c.title = c.title === 'Composed case' ? m[1].trim() : c.title; span('issue:composed', line, 0, noComment.length); return; }
    if ((m = /^title\s*:\s*(.+)$/i.exec(s))) { c.title = m[1].trim(); return; }
    if ((m = /^thesis\s*:\s*(\S+)$/i.exec(s))) { c.thesis = m[1]; span('thesis', line, noComment.indexOf(m[1]), noComment.length); return; }
    if ((m = /^party\s+([A-Za-z0-9_-]+)\s*:\s*(.+)$/i.exec(s))) { c.parties.push({ id: m[1], name: m[2].trim() }); partyIds.add(m[1]); span(`position:${m[1]}`, line, 0, noComment.length); return; }
    if ((m = /^(concept|entity|predicate)\s+([A-Za-z0-9_-]+)(?:\s*\(([^)]*)\))?\s*(?::\s*(.*))?$/i.exec(s))) {
      const kind = m[1].toLowerCase();
      const key = m[2];
      const obj = { label: m[3]?.trim() || key, definition: m[4]?.trim() || undefined, kind: kind === 'concept' ? 'concept' : kind };
      c.concepts[key] = obj;
      current = { kind: 'concept', obj, id: `concept:${key}` };
      span(`concept:${key}`, line, 0, noComment.length);
      return;
    }
    if ((m = /^fallacy\s+([A-Za-z0-9_-]+)\s+([a-z_]+)(?:\s*\[([^\]]*)\])?\s*:\s*(.*)$/i.exec(s))) {
      const opts = splitList(m[3]);
      const f = { argument: m[1], name: m[2], explanation: m[4].trim(), where: opts.find((o) => o === 'inference' || o === 'conclusion' || o.startsWith('premise:')) ?? 'inference', severity: opts.find((o) => ['fatal', 'weakens', 'note'].includes(o)) ?? 'weakens', by: partyOf(opts, line) };
      c.fallacies.push(f);
      span(`annotation:fallacy-${String(c.fallacies.length).padStart(2, '0')}`, line, 0, noComment.length);
      return;
    }
    if ((m = /^([A-Za-z0-9_-]+)\s+(undercuts|undermines|rebuts|attacks|supports|qualifies)\s+([A-Za-z0-9_*-]+)(?:\s+at\s+([A-Za-z0-9_-]+))?\s*(?::\s*(.*))?$/i.exec(s))) {
      const id = `X${++attackN}`;
      const obj = { id, attacker: m[1], target: m[3], type: ATTACKS[m[2].toLowerCase()], target_ref: m[4] || undefined, note: m[5]?.trim() || undefined };
      if (obj.type === 'undermine' && !obj.target_ref) err(line, 'undermines needs "at <premise>"');
      c.attacks.push(obj);
      current = { kind: 'attack', obj, id: `rel:${id}` };
      span(`rel:${id}`, line, 0, noComment.length);
      return;
    }
    if ((m = /^([A-Za-z0-9_-]+)(?:\s*\[([^\]]*)\])?\s*:\s*(.+?)\s*=>\s*([A-Za-z0-9_-]+)\s*$/.exec(s))) {
      const opts = splitList(m[2]);
      const obj = { id: m[1], premises: splitList(m[3]), conclusion: m[4], scheme: opts.find((o) => SCHEMES.includes(o)) ?? 'deductive', party: partyOf(opts, line), title: m[1] };
      for (const o of opts) if (!SCHEMES.includes(o) && !partyIds.has(o)) err(line, `unknown argument option "${o}" (scheme or party id expected)`);
      c.arguments.push(obj);
      current = { kind: 'argument', obj, id: `argument:${m[1]}` };
      span(`argument:${m[1]}`, line, 0, noComment.length);
      return;
    }
    if ((m = /^([A-Za-z0-9_-]+)(?:\s*\[([^\]]*)\])?\s*:\s*(.+)$/.exec(s))) {
      const opts = splitList(m[2]);
      const obj = { id: m[1], text: m[3].trim(), modality: opts.find((o) => MODALITIES.includes(o)) ?? 'plausible', basis: opts.find((o) => BASES.includes(o)) ?? 'assumption', kind: opts.find((o) => KINDS.includes(o)) ?? 'empirical', party: partyOf(opts, line) };
      for (const o of opts) if (!MODALITIES.includes(o) && !BASES.includes(o) && !KINDS.includes(o) && !partyIds.has(o)) err(line, `unknown claim option "${o}" (modality, basis, kind or party id expected)`);
      c.propositions.push(obj);
      current = { kind: 'claim', obj, id: `claim:${m[1]}` };
      span(`claim:${m[1]}`, line, 0, noComment.length);
      return;
    }
    err(line, `cannot parse "${s}"`);
  });
  if (!c.parties.length) { c.parties.push({ id: 'author', name: 'Author' }); for (const p of c.propositions) p.party ??= 'author'; for (const a of c.arguments) a.party ??= 'author'; }
  else { for (const p of c.propositions) p.party ??= c.parties[0].id; for (const a of c.arguments) a.party ??= c.parties[0].id; }
  return { case: c, spans, errors };
}

/** Attach a line to a diagnostic-like object from its target id (or a message mentioning ids). */
function lineFor(spans, target, message = '') {
  if (target && spans[target]) return spans[target];
  const logic = /\b(claim:[A-Za-z0-9_.-]+)#logic\b/.exec(message);
  if (logic && spans[`${logic[1]}#logic`]) return spans[`${logic[1]}#logic`];
  const hit = /\b((?:claim|argument|concept|rel|annotation|position):[A-Za-z0-9_.-]+)\b/.exec(message);
  return hit && spans[hit[1]] ? spans[hit[1]] : null;
}

/**
 * Full pipeline for the editor. Never throws for user mistakes: every problem
 * becomes a red diagnostic with a line.
 */
export function compose(text, { evaluate = true } = {}) {
  const { case: c, spans, errors } = parseComposer(text);
  const out = { ok: false, stage: 'parse', diagnostics: [], spans, summary: null, evaluation: null, patch: null };
  const push = (state, code, message, target = null, extra = {}) => out.diagnostics.push({ state, code, message, target, evaluator: extra.evaluator ?? 'composer.parse@0.1.0', explanation: extra.explanation ?? { detected: message, why: extra.why ?? '', checked: [], options: extra.options ?? [] }, ...(extra.line ? { line: extra.line } : {}), scope: extra.scope ?? {} });
  for (const e of errors) push('red', 'PARSE', e.message, null, { line: { line: e.line, start: 0, end: 0 }, why: 'The composer could not read this line. See docs/COMPOSER.md for the grammar.', options: ['Fix the line'] });
  let patch;
  try {
    patch = compileCase(c, { provenance: { sourceType: 'user', sourceRef: 'composer', method: 'manual_authoring' }, message: 'Composed' });
    assertValidPatch(patch);
  } catch (e) {
    const problems = e instanceof ValidationError ? e.problems : [e.message];
    for (const p of problems.length ? problems : [e.message]) push('red', 'INVALID', p, null, { line: lineFor(spans, null, p) ?? undefined, why: 'The compiled TruthPatch does not satisfy the TruthIR schema.', options: ['Fix the statement'] });
    return out;
  }
  out.patch = patch;
  out.stage = 'validate';
  let snapshot;
  try {
    snapshot = applyPatch(emptySnapshot(), patch, { validate: false });
  } catch (e) {
    push('red', 'INVALID', e.message, null, { line: lineFor(spans, null, e.message) ?? undefined });
    return out;
  }
  const problems = snapshotProblems(snapshot);
  for (const p of problems) {
    const target = /^([a-z]+:[A-Za-z0-9_.-]+):/.exec(p)?.[1] ?? null;
    push('red', 'INVALID', p, target, { line: lineFor(spans, target, p) ?? undefined, why: 'A reference does not resolve or a field has the wrong shape.', options: ['Define the missing unit', 'Fix the reference'] });
  }
  if (problems.length || errors.length) return out;
  out.stage = 'evaluate';
  if (!evaluate) { out.ok = true; return out; }
  const store = createTruthStore({ project: { id: 'repo:composed', title: c.title } });
  let commit;
  try {
    commit = store.commitPatchSync ? store.commitPatchSync(patch) : null;
  } catch { commit = null; }
  // commitPatch is async (KSG mirror); compose is synchronous by design, so apply directly.
  const { commit: makeCommit } = storeCommit;
  const record = makeCommit(store.repository, { patch, createdAt: '1970-01-01T00:00:00Z', authorRef: 'actor:composer' });
  const evaluation = store.evaluate(record.id);
  const r = evaluation.result;
  for (const d of r.diagnostics) out.diagnostics.push({ ...d, line: lineFor(spans, d.target, d.message) ?? undefined });
  out.evaluation = { labels: r.labels, claims: r.claims, thesis: r.thesis, logic: r.logic, grounding: r.grounding, dimensions: r.dimensions, derivation: r.derivation, edges: r.edges, findings: r.findings, evaluator: evaluation.evaluator, evaluatorVersion: evaluation.evaluatorVersion };
  out.snapshot = { units: snapshot.units, relations: snapshot.relations };
  out.summary = { units: Object.keys(snapshot.units).length, relations: Object.keys(snapshot.relations).length, accepted: r.accepted.length, rejected: r.rejected.length, undecided: r.undecided.length, red: r.diagnostics.filter((d) => d.state === 'red').length, yellow: r.diagnostics.filter((d) => d.state === 'yellow').length, green: r.diagnostics.filter((d) => d.state === 'green').length, thesis: r.thesis?.status ?? null };
  out.ok = true;
  const order = { red: 0, yellow: 1, green: 2 };
  out.diagnostics.sort((a, b) => (a.line?.line ?? 1e9) - (b.line?.line ?? 1e9) || order[a.state] - order[b.state]);
  return out;
}

import * as storeCommit from '../domain/commit.mjs';
