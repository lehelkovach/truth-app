/** Markdown projection of a snapshot plus its evaluation. */

import { unitsOfKind } from '../domain/truth-patch.mjs';
import { FALLACIES } from '../domain/fallacies.mjs';

export const LABEL_WORD = { accepted: 'stands', rejected: 'defeated', undecided: 'contested' };

function src(u) {
  const bits = [u.title, u.who, u.year].filter(Boolean).join(', ');
  return u.url ? `[${bits}](${u.url})` : bits;
}

export function renderMarkdown({ snapshot, evaluation, project = {}, history = [], diff = null }) {
  const r = evaluation.result;
  const units = snapshot.units;
  const issue = unitsOfKind(snapshot, 'issue')[0];
  const positions = unitsOfKind(snapshot, 'position');
  const args = unitsOfKind(snapshot, 'argument');
  const claims = unitsOfKind(snapshot, 'claim');
  const annotations = unitsOfKind(snapshot, 'annotation');
  const L = [];
  const add = (s = '') => L.push(s);
  add(`# ${issue?.title ?? project.title ?? 'Truth report'}`);
  add();
  if (issue?.question) { add(`**Question.** ${issue.question}`); add(); }
  if (issue?.text) { add(issue.text); add(); }
  add(`Commit ${evaluation.inputCommitRef} · snapshot ${evaluation.inputSnapshotHash.slice(0, 19)}… · evaluator ${evaluation.evaluator}@${evaluation.evaluatorVersion}`);
  add();
  add(`Arguments: ${args.length} (${r.accepted.length} stand, ${r.rejected.length} defeated, ${r.undecided.length} contested). Claims: ${claims.length}. Attacks: ${r.edges.length}. Fallacy annotations: ${annotations.length}.`);
  add();
  if (r.thesis) {
    const t = units[r.thesis.claim];
    add('## Thesis'); add();
    add(`**${t.id}.** ${t.text}`); add();
    add(`Status: **${r.thesis.status}**${r.thesis.supporting.length ? ' (' + r.thesis.supporting.map((s) => `${s.argument} ${LABEL_WORD[s.label]}`).join(', ') + ')' : ''}`); add();
  }
  add('## Verdicts on argued claims'); add();
  add('| Claim | Status | Arguments for it |'); add('|---|---|---|');
  for (const v of Object.values(r.verdicts)) add(`| **${v.claim}** ${units[v.claim].text} | ${v.status} | ${v.supporting.map((s) => `${s.argument} (${LABEL_WORD[s.label]})`).join(', ')} |`);
  add();
  add('## Arguments'); add();
  const groups = positions.length ? positions.map((p) => [p, args.filter((a) => a.positionRef === p.id)]) : [[null, args]];
  const orphan = args.filter((a) => !positions.some((p) => p.id === a.positionRef));
  if (positions.length && orphan.length) groups.push([null, orphan]);
  for (const [pos, list] of groups) {
    if (!list.length) continue;
    add(`### ${pos ? pos.name : 'Unaffiliated'}`); add();
    if (pos?.text) { add(pos.text); add(); }
    for (const a of list) {
      const label = r.labels[a.id];
      add(`#### ${a.id}. ${a.title} — ${LABEL_WORD[label]}`); add();
      for (const p of a.premiseRefs) { const u = units[p]; add(`- **${p}** (${u.modality ?? 'assumption'}, ${u.claimKind ?? u.kind}, ${u.basis ?? ''}) ${u.text}`); }
      const c = units[a.conclusionRef];
      add(`- **∴ ${c.id}** (${c.modality}) ${c.text}`); add();
      if (a.warrant) { add(`*Warrant (${a.scheme}).* ${a.warrant}`); add(); }
      if (a.notes) { add(a.notes); add(); }
      const d = r.derivation[a.id];
      if (d) { add(`Derivation: ${d.reason}.`); add(); }
      const L = r.logic?.arguments?.[a.id];
      if (L) {
        add(`Logic (${L.evaluator}@${L.evaluatorVersion}): **${L.result}**${L.expression ? ' — ' + L.expression : ''}`);
        if (L.proof?.length) { add(); for (const s of L.proof) add(`  - ${s.step}: ${s.expression}  [${s.rule}${s.from.length ? ' from ' + s.from.join(', ') : ''}]`); }
        if (L.missingCondition?.hints?.length) add(`  Missing condition: ${L.missingCondition.hints.join(' or ')}`);
        if (L.missing?.length) add(`  Outside coverage: ${L.missing.map((m) => `${m.claim} (${m.reason})`).join('; ')}`);
        add();
      }
      const atk = r.edges.filter((e) => e.to === a.id);
      if (atk.length) { add('Attacked by: ' + atk.map((e) => `${e.from} (${e.operator}${e.targetRef ? ' ' + e.targetRef : ''}, ${LABEL_WORD[r.labels[e.from]]})`).join(', ')); add(); }
      for (const f of annotations.filter((x) => x.targetRef === a.id)) {
        const def = FALLACIES[f.name];
        add(`- ⚠ **${f.name}** at ${f.where} (${f.severity}). ${f.text}${def ? ` _${def.definition}_` : ''}`);
      }
      if (annotations.some((x) => x.targetRef === a.id)) add();
      if (a.sourceRefs?.length) { add('Sources: ' + a.sourceRefs.map((s) => src(units[s])).join('; ')); add(); }
    }
  }
  add('## Diagnostics'); add();
  const diags = r.diagnostics ?? [];
  const counts = { red: 0, yellow: 0, green: 0 };
  for (const d of diags) counts[d.state] += 1;
  add(`${counts.red} red · ${counts.yellow} yellow · ${counts.green} green. Colour is diagnostic state under a named evaluator, not a truth label.`); add();
  for (const d of diags.filter((x) => x.state !== 'green')) add(`- **${d.state.toUpperCase()}** \`${d.code}\` ${d.target ?? ''} (${d.evaluator}): ${d.message}${d.explanation?.options?.length ? ' — options: ' + d.explanation.options.join(' · ') : ''}`);
  add();
  add('## Automated findings'); add();
  if (!r.findings.length) add('None.');
  for (const f of r.findings) add(`- \`${f.code}\` (${f.severity}) ${f.argument ?? f.claim ?? ''}: ${f.message}`);
  add();
  const concepts = unitsOfKind(snapshot, 'concept');
  if (concepts.length) {
    add('## Concepts (grounding)'); add();
    add('| Concept | Label | Sense of | KSG | Definition |'); add('|---|---|---|---|---|');
    for (const k of concepts) add(`| ${k.id} | ${k.label} | ${k.senseOf ?? ''} | ${k.ksgRef ?? 'local'} | ${k.definition ?? ''} |`);
    add();
  }
  add('## Claims'); add();
  add('| Id | Text | Kind | Modality | Basis | Status | Grounding | Logic | Sources |'); add('|---|---|---|---|---|---|---|---|---|');
  for (const c of claims) add(`| ${c.id} | ${c.text} | ${c.claimKind} | ${c.modality} | ${c.basis} | ${r.claims[c.id] ?? 'established'} | ${r.grounding?.[c.id]?.state ?? 'none'} | ${r.logic?.claims?.[c.id]?.result ?? ''} | ${(c.sourceRefs ?? []).map((s) => src(units[s])).join('; ')} |`);
  add();
  if (history.length) {
    add('## History'); add();
    for (const c of history) add(`- ${c.id} ${c.createdAt} — ${c.message}`);
    add();
  }
  if (diff && !diff.empty) {
    add('## Semantic diff (previous commit → this commit)'); add();
    add('```'); add(diff.text); if (diff.evaluationText) add(diff.evaluationText); add('```'); add();
  }
  return L.join('\n');
}
