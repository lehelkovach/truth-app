#!/usr/bin/env node
/**
 * truth — command line for TruthApp fixtures.
 *
 *   truth validate  <fixture-dir | patch.json>
 *   truth evaluate  <fixture-dir> [--commit N] [--json] [--quiet]
 *   truth report    <fixture-dir> [--commit N] [--format md|html] [--out FILE]
 *   truth history   <fixture-dir>
 *   truth diff      <fixture-dir> [--from N] [--to N]
 *   truth verify    <fixture-dir>
 *   truth compile   <case.json> [--out patch.json] [--message TEXT]
 *   truth fallacies [--verbose]
 *   truth ksg-push  <fixture-dir> [--live] [--expect-release vX.Y.Z]
 *   truth compare   <fixture-dir> <ref> <ref>        ref = branch | branch@n | commit id
 *   truth logic     <fixture-dir> [claim id] [--ref R] [--datalog] [--json]
 *   truth concept   <fixture-dir> [concept id] [--ref R]
 *   truth compose   <file.truth> [--json] [--out patch.json] [--all] [--show]
 *   truth bundle    <fixture-dir> --out public/data/<name>.json
 *   truth demo      <fixture-dir>
 */

import { readFileSync, writeFileSync, statSync } from 'node:fs';
import { compileCase } from './domain/authoring.mjs';
import { FALLACIES } from './domain/fallacies.mjs';
import { formatDiff, formatEvaluationDiff } from './domain/semantic-diff.mjs';
import { render as renderIr } from './logic/ir.mjs';
import { toProlog, toDatalog } from './logic/text.mjs';
import { claimExpression } from './logic/kb.mjs';
import { buildBundle } from './services/bundle.mjs';
import { compose } from './services/compose.mjs';
import { assertValidPatch, snapshotProblems } from './domain/validate.mjs';
import { applyPatch, emptySnapshot } from './domain/truth-patch.mjs';
import { createFakeKsgClient, createKsgAdapter, createKsgClientFromEnv } from './adapters/ksg.mjs';
import { loadFixture, readFixture } from './adapters/local-fixture-store.mjs';
import { renderHtml } from './report/html.mjs';
import { renderMarkdown, LABEL_WORD } from './report/markdown.mjs';

function parseArgs(argv) {
  const positional = [];
  const flags = {};
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith('--')) { flags[key] = next; i += 1; } else flags[key] = true;
    } else positional.push(a);
  }
  return { positional, flags };
}

function commitAt(commits, n) {
  if (n === undefined) return commits.at(-1);
  const i = Number(n) - 1;
  if (!(i >= 0 && i < commits.length)) throw new Error(`commit index ${n} out of range 1..${commits.length}`);
  return commits[i];
}

async function withFixture(dir) {
  return loadFixture(dir);
}

const commands = {
  async validate({ positional }) {
    const target = positional[0];
    if (!target) throw new Error('validate needs a fixture dir or patch file');
    if (statSync(target).isDirectory()) {
      const { project, patches } = readFixture(target);
      let snapshot = emptySnapshot();
      for (const { file, patch } of patches) {
        assertValidPatch(patch);
        snapshot = applyPatch(snapshot, patch);
        console.log(`OK ${file}: ${patch.operations.length} operations`);
      }
      console.log(`OK ${project.id}: ${Object.keys(snapshot.units).length} units, ${Object.keys(snapshot.relations).length} relations`);
    } else {
      const patch = JSON.parse(readFileSync(target, 'utf8'));
      assertValidPatch(patch);
      const problems = snapshotProblems(applyPatch(emptySnapshot(), patch, { validate: false }));
      if (problems.length) { console.log('INVALID'); problems.forEach((p) => console.log('  -', p)); return 1; }
      console.log(`OK ${patch.id ?? target}: ${patch.operations.length} operations`);
    }
    return 0;
  },

  async evaluate({ positional, flags }) {
    const { store, commits } = await withFixture(positional[0]);
    const c = commitAt(commits, flags.commit);
    const ev = store.evaluate(c.id);
    if (flags.json) { console.log(JSON.stringify(ev, null, 2)); return 0; }
    const r = ev.result;
    const snap = store.getSnapshot(c.id);
    console.log(`${store.repository.title}`);
    console.log(`  commit ${c.id} · ${c.message}`);
    console.log(`  arguments: ${r.accepted.length} stand, ${r.rejected.length} defeated, ${r.undecided.length} contested`);
    if (r.thesis) console.log(`  thesis ${r.thesis.claim}: ${r.thesis.status}`);
    console.log();
    for (const id of Object.keys(r.labels)) {
      const a = snap.units[id];
      console.log(`  ${LABEL_WORD[r.labels[id]].padEnd(9)} ${id.padEnd(14)} [${(a.positionRef ?? '-').replace('position:', '')}] ${a.title}  — ${r.derivation[id].reason}`);
    }
    console.log('\nfindings:');
    for (const f of r.findings) {
      if (flags.quiet && f.severity === 'info') continue;
      console.log(`  ${f.severity.padEnd(5)} ${f.code.padEnd(20)} ${(f.argument ?? f.claim ?? '').padEnd(14)} ${f.message}`);
    }
    return 0;
  },

  async report({ positional, flags }) {
    const { store, commits, project } = await withFixture(positional[0]);
    const ref = flags.ref ?? (flags.commit ? commitAt(commits, flags.commit).id : 'main');
    const commitId = store.resolveRef(ref);
    const history = store.listHistory(commitId);
    const evaluation = store.evaluate(commitId);
    const snapshot = store.getSnapshot(commitId);
    const prev = history[1] ?? null;
    const cmp = prev ? store.compare(prev.id, commitId) : null;
    const diff = cmp ? { ...cmp.diff, text: formatDiff(cmp.diff), evaluationText: formatEvaluationDiff(cmp.evaluation) } : null;
    const render = flags.format === 'html' ? renderHtml : renderMarkdown;
    const text = render({ snapshot, evaluation, project, history, diff });
    if (flags.out) { writeFileSync(flags.out, text); console.log(`wrote ${flags.out}`); } else process.stdout.write(text);
    return 0;
  },

  async history({ positional, flags }) {
    const { store } = await withFixture(positional[0]);
    for (const b of store.listBranches()) {
      console.log(`branch ${b.name} (${b.commits} commits, head ${b.head})`);
      if (flags.all || b.name === (flags.branch ?? 'main')) for (const c of store.listHistory(b.name).reverse()) console.log(`  ${c.id}  ${c.createdAt}  ${c.message}\n      patch ${c.patchHash.slice(7, 19)}  snapshot ${c.snapshotHash.slice(7, 19)}  parents ${c.parentRefs.join(',') || '-'}`);
    }
    return 0;
  },

  async compare({ positional }) {
    const [dir, fromRef, toRef] = positional;
    if (!fromRef || !toRef) throw new Error('compare <fixture> <ref> <ref>   (ref = branch, branch@n, or commit id)');
    const { store } = await withFixture(dir);
    const cmp = store.compare(fromRef, toRef);
    console.log(`${fromRef} (${cmp.from}) → ${toRef} (${cmp.to})   classes: ${cmp.diff.classes.join(', ') || '-'}`);
    console.log(formatDiff(cmp.diff));
    console.log(formatEvaluationDiff(cmp.evaluation));
    return 0;
  },

  async logic({ positional, flags }) {
    const [dir, unitId] = positional;
    const { store } = await withFixture(dir);
    const snapshot = store.getSnapshot(flags.ref ?? 'main');
    const names = Object.fromEntries(Object.values(snapshot.units).filter((u) => u.kind === 'concept').map((u) => [u.id, u.label]));
    const ids = unitId ? [unitId] : Object.values(snapshot.units).filter((u) => u.kind === 'claim').map((u) => u.id);
    for (const id of ids) {
      const u = snapshot.units[id];
      const ex = u ? claimExpression(u, snapshot) : null;
      if (!ex) { if (unitId) console.log(`${id}: no formal expression`); continue; }
      console.log(`${id}  ${u.text}`);
      console.log(`  IR:      ${renderIr(ex.ir, names)}   (${ex.from}${ex.valid.ok ? '' : ', INVALID: ' + ex.valid.diagnostics.map((d) => d.code).join(',')})`);
      console.log(`  Prolog:  ${toProlog(ex.ir, names)}`);
      if (flags.datalog) console.log(`  Datalog: ${toDatalog(ex.ir, names)}`);
      if (flags.json) console.log(JSON.stringify(ex.ir));
    }
    return 0;
  },

  async concept({ positional, flags }) {
    const [dir, conceptId] = positional;
    const { store } = await withFixture(dir);
    const snapshot = store.getSnapshot(flags.ref ?? 'main');
    const ids = conceptId ? [conceptId] : Object.values(snapshot.units).filter((u) => u.kind === 'concept').map((u) => u.id);
    for (const id of ids) {
      const x = store.explainConcept(id, flags.ref ?? 'main');
      if (!x.concept) { console.log(`${id}: unknown concept`); continue; }
      console.log(`${id}  ${x.concept.label}${x.concept.senseOf ? `  (sense of ${x.concept.senseOf})` : ''}${x.concept.ksgRef ? `  KSG ${x.concept.ksgRef}` : '  (local, not yet in KSG)'}`);
      if (x.concept.definition) console.log(`  ${x.concept.definition}`);
      if (x.concept.aliases?.length) console.log(`  aliases: ${x.concept.aliases.join(', ')}`);
      console.log(`  used by claims: ${x.claims.join(', ') || '-'}`);
      console.log(`  arguments affected by a grounding change: ${x.arguments.join(', ') || '-'}`);
      if (x.competingSenses.length) console.log(`  competing senses: ${x.competingSenses.join(', ')}`);
    }
    return 0;
  },

  async compose({ positional, flags }) {
    const text = readFileSync(positional[0], 'utf8');
    const result = compose(text);
    if (flags.json) { console.log(JSON.stringify(result, null, 2)); return result.ok ? 0 : 1; }
    if (flags.out && result.patch) { writeFileSync(flags.out, JSON.stringify(result.patch, null, 2) + '\n'); console.log(`wrote ${flags.out}`); }
    const lines = text.split(/\r?\n/);
    console.log(`${result.ok ? 'OK' : 'FAILED'} at stage ${result.stage}${result.summary ? ` · ${result.summary.units} units · ${result.summary.accepted} stand / ${result.summary.rejected} defeated · red ${result.summary.red} yellow ${result.summary.yellow} green ${result.summary.green}${result.summary.thesis ? ' · thesis ' + result.summary.thesis : ''}` : ''}`);
    for (const d of result.diagnostics) {
      if (d.state === 'green' && !flags.all) continue;
      const where = d.line ? `${positional[0]}:${d.line.line}` : '(no line)';
      console.log(`  ${d.state.toUpperCase().padEnd(6)} ${where.padEnd(34)} ${d.code.padEnd(20)} ${d.message}`);
      if (d.line && flags.show) console.log(`         > ${lines[d.line.line - 1]}`);
    }
    return result.ok ? 0 : 1;
  },

  async bundle({ positional, flags }) {
    const { store, project } = await withFixture(positional[0]);
    const bundle = buildBundle({ store, project });
    const text = JSON.stringify(bundle);
    if (flags.out) { writeFileSync(flags.out, text); console.log(`wrote ${flags.out} (${(text.length / 1024).toFixed(0)} KB, ${bundle.commits.length} commits, ${bundle.branches.length} branches)`); } else process.stdout.write(text);
    return 0;
  },

  async diff({ positional, flags }) {
    const { store, commits } = await withFixture(positional[0]);
    const to = commitAt(commits, flags.to);
    const from = flags.from ? commitAt(commits, flags.from) : commits[commits.indexOf(to) - 1] ?? null;
    const d = store.diff(from ? from.id : null, to.id);
    console.log(`${from ? from.id : '(empty)'} → ${to.id}   classes: ${d.classes.join(', ') || '-'}`);
    console.log(formatDiff(d));
    return 0;
  },

  async verify({ positional }) {
    const { store, commits } = await withFixture(positional[0]);
    for (const c of commits) { const v = store.verify(c.id); console.log(`${v.ok ? 'OK' : 'BAD'} ${c.id}${v.ok ? '' : ' ' + JSON.stringify(v)}`); if (!v.ok) return 1; }
    return 0;
  },

  async compile({ positional, flags }) {
    const c = JSON.parse(readFileSync(positional[0], 'utf8'));
    const patch = compileCase(c, { message: flags.message ?? undefined });
    assertValidPatch(patch);
    const problems = snapshotProblems(applyPatch(emptySnapshot(), patch, { validate: false }));
    if (problems.length) { console.error('compiled case is not valid:'); problems.forEach((p) => console.error('  -', p)); return 1; }
    const text = JSON.stringify(patch, null, 2) + '\n';
    if (flags.out) { writeFileSync(flags.out, text); console.log(`wrote ${flags.out}: ${patch.operations.length} operations`); } else process.stdout.write(text);
    return 0;
  },

  async fallacies({ flags }) {
    for (const d of Object.values(FALLACIES)) { console.log(`${d.name.padEnd(26)} ${d.category.padEnd(12)} ${d.definition}`); if (flags.verbose) console.log(`${''.padEnd(26)} test: ${d.test}`); }
    return 0;
  },

  async 'ksg-push'({ positional, flags }) {
    const client = flags.live ? await createKsgClientFromEnv() : createFakeKsgClient();
    const ksg = createKsgAdapter({ client, ownerUserId: process.env.KSG_OWNER ?? null });
    const expected = flags['expect-release'] ? { expected_release: flags['expect-release'] } : {};
    await ksg.connect(expected);
    const { commits } = await loadFixture(positional[0], { ksg });
    console.log(`${flags.live ? 'pushed' : 'mirrored into fake client'}: ${commits.length} commits, ${ksg.objectUuids.size} objects, ${ksg.assertionIds.size} relation assertions`);
    if (!flags.live) console.log('(no --live: nothing left the machine; set KSG_API_URL and pass --live to write to KnowShowGo)');
    return 0;
  },

  async demo({ positional }) {
    const dir = positional[0];
    console.log('== validate'); await commands.validate({ positional: [dir], flags: {} });
    console.log('\n== history'); await commands.history({ positional: [dir], flags: {} });
    console.log('\n== verify'); await commands.verify({ positional: [dir], flags: {} });
    console.log('\n== evaluate (head)'); await commands.evaluate({ positional: [dir], flags: { quiet: true } });
    console.log('\n== diff (previous → head)'); await commands.diff({ positional: [dir], flags: {} });
    const { store } = await withFixture(dir);
    for (const b of store.listBranches()) if (b.name !== 'main') { console.log(`\n== compare main → ${b.name}`); await commands.compare({ positional: [dir, 'main', b.name], flags: {} }); }
    return 0;
  }
};

export async function main(argv = process.argv.slice(2)) {
  const { positional, flags } = parseArgs(argv);
  const [command, ...rest] = positional;
  if (!command || flags.help || !(command in commands)) {
    console.log(`truth <command> ...\n\ncommands: ${Object.keys(commands).join(', ')}\n\nsee src/cli.mjs header for options`);
    return command ? 1 : 0;
  }
  return commands[command]({ positional: rest, flags });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().then((code) => process.exit(code ?? 0)).catch((err) => { console.error(err.message ?? err); process.exit(1); });
}
