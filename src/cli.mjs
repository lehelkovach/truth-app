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
 *   truth demo      <fixture-dir>
 */

import { readFileSync, writeFileSync, statSync } from 'node:fs';
import { compileCase } from './domain/authoring.mjs';
import { FALLACIES } from './domain/fallacies.mjs';
import { formatDiff } from './domain/semantic-diff.mjs';
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
    const c = commitAt(commits, flags.commit);
    const idx = commits.indexOf(c);
    const evaluation = store.evaluate(c.id);
    const snapshot = store.getSnapshot(c.id);
    const history = store.listHistory(c.id);
    const prev = idx > 0 ? commits[idx - 1] : null;
    const d = prev ? store.diff(prev.id, c.id) : null;
    const diff = d ? { ...d, text: formatDiff(d) } : null;
    const render = flags.format === 'html' ? renderHtml : renderMarkdown;
    const text = render({ snapshot, evaluation, project, history, diff });
    if (flags.out) { writeFileSync(flags.out, text); console.log(`wrote ${flags.out}`); } else process.stdout.write(text);
    return 0;
  },

  async history({ positional }) {
    const { store } = await withFixture(positional[0]);
    for (const c of store.listHistory().reverse()) console.log(`${c.id}  ${c.createdAt}  ${c.message}\n    patch ${c.patchHash.slice(7, 19)}  snapshot ${c.snapshotHash.slice(7, 19)}  parents ${c.parentRefs.join(',') || '-'}`);
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
