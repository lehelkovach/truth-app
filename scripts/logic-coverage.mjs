#!/usr/bin/env node
/**
 * Logic IR coverage and dimension report for a fixture.
 *
 *   node scripts/logic-coverage.mjs <fixture-dir> [--commit N] [--branch NAME] [--json]
 *
 * For the snapshot at the chosen commit (default: tip of main), counts how many
 * claims carry a Logic IR expression, how the native evaluator classified every
 * claim and argument, the grounded-argumentation labels, grounding and evidence
 * states, the modality / basis / claim-kind distributions and the structural
 * findings by code. The number the paper's limitations section needs is the
 * share of claims whose logical dimension reads `outside_coverage`.
 */

import { loadFixture } from '../src/adapters/local-fixture-store.mjs';
import { unitsOfKind, liveRelations } from '../src/domain/truth-patch.mjs';

function tally(items, key) {
  const t = {};
  for (const it of items) {
    const v = key(it);
    t[v] = (t[v] ?? 0) + 1;
  }
  return Object.fromEntries(Object.entries(t).sort(([a], [b]) => a.localeCompare(b)));
}

function pct(n, d) {
  return d ? `${((100 * n) / d).toFixed(1)}%` : 'n/a';
}

export async function coverageReport(dir, { commit = null, branch = null } = {}) {
  const { store, commits, branches } = await loadFixture(dir);
  let target;
  if (branch) {
    const list = branches[branch];
    if (!list?.length) throw new Error(`branch ${branch} not found or has no commits`);
    target = list.at(-1);
  } else if (commit !== null) {
    const i = Number(commit) - 1;
    if (!(i >= 0 && i < commits.length)) throw new Error(`commit ${commit} out of range 1..${commits.length}`);
    target = commits[i];
  } else target = commits.at(-1);

  const snapshot = store.getSnapshot(target.id);
  const { result } = store.evaluate(target.id);
  const claims = unitsOfKind(snapshot, 'claim');
  const args = unitsOfKind(snapshot, 'argument');
  const dims = result.dimensions;

  const formalised = claims.filter((c) => c.logicIr).length;
  const claimLogical = tally(claims, (c) => dims[c.id]?.logical ?? 'outside_coverage');
  const argLogical = tally(args, (a) => dims[a.id]?.logical ?? 'outside_coverage');
  const attacks = liveRelations(snapshot, ['attacks', 'rebut', 'undercut', 'undermine']);

  return {
    fixture: dir,
    ref: branch ? `${branch}@${branches[branch].length}` : `main@${commits.indexOf(target) + 1}`,
    commit: target.id,
    units: {
      claims: claims.length,
      arguments: args.length,
      attacks: attacks.length,
      concepts: unitsOfKind(snapshot, 'concept').length,
      sources: unitsOfKind(snapshot, 'source').length,
      annotations: unitsOfKind(snapshot, 'annotation').length
    },
    claims: {
      formalised,
      formalisedShare: pct(formalised, claims.length),
      logical: claimLogical,
      outsideCoverageShare: pct(claimLogical.outside_coverage ?? 0, claims.length),
      argument: tally(claims, (c) => dims[c.id]?.argument ?? 'n/a'),
      grounding: tally(claims, (c) => dims[c.id]?.grounding ?? 'none'),
      evidence: tally(claims, (c) => dims[c.id]?.evidence ?? 'n/a'),
      modality: tally(claims, (c) => c.modality ?? 'unset'),
      basis: tally(claims, (c) => c.basis ?? 'unset'),
      claimKind: tally(claims, (c) => c.claimKind ?? 'unset')
    },
    arguments: {
      logical: argLogical,
      label: tally(args, (a) => result.labels[a.id] ?? 'not_evaluated'),
      scheme: tally(args, (a) => a.scheme ?? 'unset')
    },
    findings: tally(result.findings, (f) => f.code),
    thesis: result.thesis ? { claim: result.thesis.claim, status: result.thesis.status } : null
  };
}

function row(label, obj) {
  return `| ${label} | ${Object.entries(obj).map(([k, v]) => `${k} ${v}`).join(' · ') || '—'} |`;
}

export function renderMarkdown(r) {
  const lines = [];
  lines.push(`### ${r.fixture} @ ${r.ref} (${r.commit})`);
  lines.push('');
  lines.push('| Dimension | Counts |');
  lines.push('|---|---|');
  lines.push(row('units', r.units));
  lines.push(`| claims formalised (Logic IR) | ${r.claims.formalised} of ${r.units.claims} (${r.claims.formalisedShare}) |`);
  lines.push(row('claims · logical', r.claims.logical));
  lines.push(`| claims outside coverage | ${r.claims.logical.outside_coverage ?? 0} of ${r.units.claims} (${r.claims.outsideCoverageShare}) |`);
  lines.push(row('claims · argument state', r.claims.argument));
  lines.push(row('claims · grounding', r.claims.grounding));
  lines.push(row('claims · evidence', r.claims.evidence));
  lines.push(row('claims · modality', r.claims.modality));
  lines.push(row('claims · basis', r.claims.basis));
  lines.push(row('claims · kind', r.claims.claimKind));
  lines.push(row('arguments · logical', r.arguments.logical));
  lines.push(row('arguments · label', r.arguments.label));
  lines.push(row('arguments · scheme', r.arguments.scheme));
  lines.push(row('findings', r.findings));
  lines.push(`| thesis | ${r.thesis ? `${r.thesis.claim}: ${r.thesis.status}` : '—'} |`);
  return lines.join('\n');
}

const isMain = process.argv[1] && import.meta.url === new URL(process.argv[1], 'file://').href;
if (isMain) {
  const argv = process.argv.slice(2);
  const dir = argv.find((a) => !a.startsWith('--'));
  if (!dir) {
    console.error('usage: logic-coverage <fixture-dir> [--commit N] [--branch NAME] [--json]');
    process.exit(2);
  }
  const opt = (name) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : null; };
  const report = await coverageReport(dir, { commit: opt('--commit'), branch: opt('--branch') });
  if (argv.includes('--json')) console.log(JSON.stringify(report, null, 2));
  else console.log(renderMarkdown(report));
}
