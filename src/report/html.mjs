/** Self-contained HTML projection: issue, verdicts, argument cards, findings, claims, history, diff. */

import { unitsOfKind } from '../domain/truth-patch.mjs';
import { FALLACIES } from '../domain/fallacies.mjs';
import { LABEL_WORD } from './markdown.mjs';

const CSS = `
:root{--bg:#fbfaf7;--fg:#1c1b19;--muted:#6b6862;--card:#fff;--line:#e3dfd6;--in:#2e7d32;--out:#b3261e;--undec:#b26a00;--accent:#3b5bdb;--warn:#8a5a00;--warnbg:#fff4d6}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--bg:#141414;--fg:#ecebe6;--muted:#a09d95;--card:#1e1e1e;--line:#333;--in:#66bb6a;--out:#ef5350;--undec:#ffb74d;--accent:#8fa4ff;--warn:#ffd88a;--warnbg:#3a2f12}}
:root[data-theme="dark"]{--bg:#141414;--fg:#ecebe6;--muted:#a09d95;--card:#1e1e1e;--line:#333;--in:#66bb6a;--out:#ef5350;--undec:#ffb74d;--accent:#8fa4ff;--warn:#ffd88a;--warnbg:#3a2f12}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.5 Georgia,'Times New Roman',serif}
main{max-width:960px;margin:0 auto;padding:32px 16px}h1{font-size:1.9rem;margin:.2em 0}h2{font-size:1.35rem;margin-top:2em;border-bottom:1px solid var(--line);padding-bottom:.2em}h3{font-size:1.1rem;margin-top:1.6em}
.muted{color:var(--muted)}.card{background:var(--card);border:1px solid var(--line);border-radius:8px;padding:14px 16px;margin:12px 0}
.badge{display:inline-block;font:600 .72rem/1 system-ui,sans-serif;letter-spacing:.04em;text-transform:uppercase;padding:4px 8px;border-radius:999px;color:#fff;vertical-align:middle}
.accepted,.established{background:var(--in)}.rejected,.defeated{background:var(--out)}.undecided,.open{background:var(--undec)}
.prem{margin:.25em 0}.prem b{color:var(--accent)}.concl{margin:.4em 0 .2em;font-weight:600}.mod{font:.75rem system-ui,sans-serif;color:var(--muted)}
.warrant{font-style:italic;margin:.5em 0}.fallacy{background:var(--warnbg);border-left:4px solid var(--warn);padding:6px 10px;margin:6px 0;border-radius:4px;font-size:.93rem}
table{border-collapse:collapse;width:100%;font-size:.92rem}th,td{border-bottom:1px solid var(--line);padding:6px 8px;text-align:left;vertical-align:top}
.small{font:.85rem system-ui,sans-serif;color:var(--muted)}a{color:var(--accent)}code{font-size:.85em}pre{background:var(--card);border:1px solid var(--line);padding:10px;overflow:auto;border-radius:6px;font-size:.85rem}
.major{color:var(--out);font-weight:600}.minor{color:var(--undec);font-weight:600}.info{color:var(--muted);font-weight:600}.tabs{display:flex;gap:8px;flex-wrap:wrap;margin:8px 0}
`;

const e = (s) => String(s ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

export function renderHtml({ snapshot, evaluation, project = {}, history = [], diff = null }) {
  const r = evaluation.result;
  const units = snapshot.units;
  const issue = unitsOfKind(snapshot, 'issue')[0];
  const positions = unitsOfKind(snapshot, 'position');
  const args = unitsOfKind(snapshot, 'argument');
  const claims = unitsOfKind(snapshot, 'claim');
  const annotations = unitsOfKind(snapshot, 'annotation');
  const src = (u) => { const bits = e([u.title, u.who, u.year].filter(Boolean).join(', ')); return u.url ? `<a href="${e(u.url)}">${bits}</a>` : bits; };
  const H = [];
  const add = (s) => H.push(s);
  const title = issue?.title ?? project.title ?? 'Truth report';
  add(`<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${e(title)}</title><style>${CSS}</style></head><body><main>`);
  add(`<h1>${e(title)}</h1>`);
  if (issue?.question) add(`<p class="muted"><b>Question.</b> ${e(issue.question)}</p>`);
  if (issue?.text) add(`<p>${e(issue.text)}</p>`);
  add(`<p class="small">${args.length} arguments · ${r.accepted.length} stand · ${r.rejected.length} defeated · ${r.undecided.length} contested · ${claims.length} claims · ${r.edges.length} attacks · ${annotations.length} fallacy annotations<br>commit <code>${e(evaluation.inputCommitRef)}</code> · snapshot <code>${e(evaluation.inputSnapshotHash.slice(0, 23))}…</code> · evaluator <code>${e(evaluation.evaluator)}@${e(evaluation.evaluatorVersion)}</code></p>`);
  if (r.thesis) {
    const t = units[r.thesis.claim];
    add(`<h2>Thesis</h2><div class="card"><p><b>${e(t.id)}.</b> ${e(t.text)}</p><p><span class="badge ${r.thesis.status}">${e(r.thesis.status)}</span> ${r.thesis.supporting.map((s) => `<span class="small">${e(s.argument)}: ${e(LABEL_WORD[s.label])}</span>`).join(' ')}</p></div>`);
  }
  add('<h2>Verdicts on argued claims</h2><table><tr><th>Claim</th><th>Status</th><th>Arguments for it</th></tr>');
  for (const v of Object.values(r.verdicts)) add(`<tr><td><b>${e(v.claim)}</b> ${e(units[v.claim].text)}</td><td><span class="badge ${v.status}">${e(v.status)}</span></td><td>${v.supporting.map((s) => `<a href="#${e(s.argument)}">${e(s.argument)}</a> (${e(LABEL_WORD[s.label])})`).join(', ')}</td></tr>`);
  add('</table>');
  add('<h2>Arguments</h2>');
  const groups = positions.length ? positions.map((p) => [p, args.filter((a) => a.positionRef === p.id)]) : [[null, args]];
  const orphan = args.filter((a) => !positions.some((p) => p.id === a.positionRef));
  if (positions.length && orphan.length) groups.push([null, orphan]);
  for (const [pos, list] of groups) {
    if (!list.length) continue;
    add(`<h3>${e(pos ? pos.name : 'Unaffiliated')}</h3>`);
    if (pos?.text) add(`<p class="muted">${e(pos.text)}</p>`);
    for (const a of list) {
      const label = r.labels[a.id];
      add(`<div class="card" id="${e(a.id)}"><p><span class="badge ${label}">${e(LABEL_WORD[label])}</span> <b>${e(a.id)}. ${e(a.title)}</b> <span class="mod">${e(a.scheme)}</span></p>`);
      for (const p of a.premiseRefs) { const u = units[p]; add(`<p class="prem"><b>${e(p)}</b> <span class="mod">${e(u.modality ?? 'assumption')} · ${e(u.claimKind ?? u.kind)} · ${e(u.basis ?? '')}</span><br>${e(u.text)}</p>`); }
      const c = units[a.conclusionRef];
      add(`<p class="concl">∴ ${e(c.id)} <span class="mod">${e(c.modality)}</span><br>${e(c.text)}</p>`);
      if (a.warrant) add(`<p class="warrant">${e(a.warrant)}</p>`);
      if (a.notes) add(`<p>${e(a.notes)}</p>`);
      const d = r.derivation[a.id];
      if (d) add(`<p class="small">Derivation: ${e(d.reason)}.</p>`);
      const atk = r.edges.filter((x) => x.to === a.id);
      if (atk.length) add(`<p class="small">Attacked by: ${atk.map((x) => `<a href="#${e(x.from)}">${e(x.from)}</a> (${e(x.operator)}${x.targetRef ? ' ' + e(x.targetRef) : ''}, ${e(LABEL_WORD[r.labels[x.from]])})`).join(', ')}</p>`);
      for (const f of annotations.filter((x) => x.targetRef === a.id)) { const def = FALLACIES[f.name]; add(`<div class="fallacy"><b>${e(f.name)}</b> at ${e(f.where)} · ${e(f.severity)}. ${e(f.text)}${def ? ` <span class="small">${e(def.definition)}</span>` : ''}</div>`); }
      if (a.sourceRefs?.length) add(`<p class="small">Sources: ${a.sourceRefs.map((s) => src(units[s])).join('; ')}</p>`);
      add('</div>');
    }
  }
  add('<h2>Automated findings</h2>');
  if (!r.findings.length) add('<p>None.</p>');
  for (const f of r.findings) add(`<p><span class="${f.severity}">${e(f.severity)}</span> <code>${e(f.code)}</code> ${e(f.argument ?? f.claim ?? '')}: ${e(f.message)}</p>`);
  add('<h2>Claims</h2><table><tr><th>Id</th><th>Text</th><th>Kind</th><th>Modality</th><th>Basis</th><th>Status</th><th>Sources</th></tr>');
  for (const c of claims) { const st = r.claims[c.id] ?? 'established'; add(`<tr><td>${e(c.id)}</td><td>${e(c.text)}</td><td>${e(c.claimKind)}</td><td>${e(c.modality)}</td><td>${e(c.basis)}</td><td><span class="badge ${st}">${e(st)}</span></td><td class="small">${(c.sourceRefs ?? []).map((s) => src(units[s])).join('; ')}</td></tr>`); }
  add('</table>');
  if (history.length) { add('<h2>History</h2><table><tr><th>Commit</th><th>When</th><th>Message</th><th>Snapshot</th></tr>'); for (const c of history) add(`<tr><td><code>${e(c.id)}</code></td><td class="small">${e(c.createdAt)}</td><td>${e(c.message)}</td><td class="small"><code>${e(c.snapshotHash.slice(7, 19))}</code></td></tr>`); add('</table>'); }
  if (diff && !diff.empty) add(`<h2>Semantic diff (previous → this commit)</h2><p class="small">classes: ${diff.classes.map(e).join(', ')}</p><pre>${e(diff.text)}</pre>`);
  const used = [...new Set(annotations.map((a) => a.name).filter((n) => n in FALLACIES))].sort();
  if (used.length) { add('<h2>Fallacy catalogue used</h2><table><tr><th>Name</th><th>Category</th><th>Definition</th><th>Test</th></tr>'); for (const n of used) { const d = FALLACIES[n]; add(`<tr><td><code>${e(d.name)}</code></td><td>${e(d.category)}</td><td>${e(d.definition)}</td><td>${e(d.test)}</td></tr>`); } add('</table>'); }
  add('</main></body></html>');
  return H.join('');
}
