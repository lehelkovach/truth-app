/* TruthApp static UI: a projection over a truth-bundle. It never computes; everything shown was produced by the evaluator at commit time. */
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const LABEL_WORD = { accepted: 'stands', rejected: 'defeated', undecided: 'contested' };
const state = { bundles: {}, bundle: null, branch: 'main', commit: null, selected: null, filters: { supports: true, rebut: true, undercut: true, undermine: true, qualifies: true, evidence: false, concepts: false } };

async function loadIndex() {
  const res = await fetch('data/index.json');
  const index = await res.json();
  const sel = $('#project');
  for (const p of index.projects) { const o = document.createElement('option'); o.value = p.file; o.textContent = p.title; sel.appendChild(o); }
  sel.onchange = () => loadBundle(sel.value);
  await loadBundle(index.projects[0].file);
}

async function loadBundle(file) {
  if (!state.bundles[file]) state.bundles[file] = await (await fetch(`data/${file}`)).json();
  state.bundle = state.bundles[file];
  state.branch = 'main';
  const bsel = $('#branch'); bsel.innerHTML = '';
  for (const b of state.bundle.branches) { const o = document.createElement('option'); o.value = b.name; o.textContent = `${b.name} (${b.commits})`; bsel.appendChild(o); }
  bsel.onchange = () => { state.branch = bsel.value; fillCommits(); };
  fillCommits();
}

function branchCommits(name) {
  const head = state.bundle.branches.find((b) => b.name === name)?.head;
  const byId = Object.fromEntries(state.bundle.commits.map((c) => [c.id, c]));
  const out = [];
  let cur = head;
  while (cur) { out.unshift(byId[cur]); cur = byId[cur].parentRefs[0] ?? null; }
  return out;
}

function fillCommits() {
  const csel = $('#commit'); csel.innerHTML = '';
  const chain = branchCommits(state.branch);
  chain.forEach((c, i) => { const o = document.createElement('option'); o.value = c.id; o.textContent = `${i + 1}. ${c.message.slice(0, 70)}`; csel.appendChild(o); });
  csel.value = chain.at(-1).id;
  csel.onchange = () => selectCommit(csel.value);
  selectCommit(chain.at(-1).id);
}

function selectCommit(id) {
  state.commit = state.bundle.commits.find((c) => c.id === id);
  state.selected = null;
  renderIssue(); renderHistory(); renderFilters(); renderGraph(); renderArguments(); renderDiagnostics(); renderLogic(); renderConcepts(); renderCompare(); renderInspector();
}

const units = () => state.commit.snapshot.units;
const ev = () => state.commit.evaluation.result;

function renderIssue() {
  const issue = Object.values(units()).find((u) => u.kind === 'issue');
  const r = ev();
  const th = r.thesis ? `<p><span class="badge ${r.thesis.status}">${r.thesis.status}</span> <b>Thesis</b> ${esc(units()[r.thesis.claim].text)}</p>` : '';
  const dc = { red: 0, yellow: 0, green: 0 }; for (const d of r.diagnostics) dc[d.state] += 1;
  $('#issue').innerHTML = `<h2>${esc(issue?.title ?? state.bundle.project.title)}</h2><p class="small">${esc(issue?.question ?? '')}</p>${th}<p class="small">${r.accepted.length} stand · ${r.rejected.length} defeated · ${r.undecided.length} contested<br><span class="badge red">${dc.red}</span><span class="badge yellow">${dc.yellow}</span><span class="badge green">${dc.green}</span> diagnostics<br>commit <code>${esc(state.commit.id.slice(7, 19))}</code> · ${esc(state.commit.evaluation.evaluator)}@${esc(state.commit.evaluation.evaluatorVersion)}</p>`;
}

function renderHistory() {
  const chain = branchCommits(state.branch);
  $('#history-list').innerHTML = chain.map((c) => `<li class="${c.id === state.commit.id ? 'current' : ''}" data-id="${c.id}">${esc(c.message)}<br><code>${esc(c.id.slice(7, 19))}</code> <span class="small">${esc(c.createdAt.slice(0, 10))}</span></li>`).join('');
  for (const li of $('#history-list').querySelectorAll('li')) li.onclick = () => { $('#commit').value = li.dataset.id; selectCommit(li.dataset.id); };
}

function renderFilters() {
  $('#filter-list').innerHTML = Object.entries(state.filters).map(([k, v]) => `<label class="filter"><input type="checkbox" data-f="${k}" ${v ? 'checked' : ''}> ${k}</label>`).join('');
  for (const cb of $('#filter-list').querySelectorAll('input')) cb.onchange = () => { state.filters[cb.dataset.f] = cb.checked; renderGraph(); };
}

/* Cytoscape cannot read CSS variables; resolve them once per render. */
function cssVar(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#888'; }
function stateColor(id) {
  const r = ev();
  const u = units()[id];
  if (u.kind === 'argument') return r.labels[id] === 'accepted' ? cssVar('--green') : r.labels[id] === 'rejected' ? cssVar('--red') : cssVar('--yellow');
  if (u.kind === 'claim') { const s = r.claims[id]; return s === 'defeated' ? cssVar('--red') : s === 'open' ? cssVar('--yellow') : cssVar('--green'); }
  return cssVar('--muted');
}

let cy = null;
function renderGraph() {
  const U = units();
  const r = ev();
  const f = state.filters;
  const nodes = [];
  const edges = [];
  const want = (u) => u.status !== 'retracted' && (u.kind === 'claim' || u.kind === 'argument' || (f.evidence && (u.kind === 'evidence' || u.kind === 'source')) || (f.concepts && u.kind === 'concept'));
  for (const u of Object.values(U)) if (want(u)) nodes.push({ data: { id: u.id, label: `${u.id.split(':')[1]}\n${(u.title ?? u.label ?? u.text ?? '').slice(0, 44)}`, kind: u.kind, color: stateColor(u.id), shape: u.kind === 'argument' ? 'round-rectangle' : u.kind === 'claim' ? 'ellipse' : u.kind === 'concept' ? 'diamond' : 'rectangle' } });
  const have = new Set(nodes.map((n) => n.data.id));
  for (const a of Object.values(U)) if (a.kind === 'argument' && have.has(a.id)) { for (const p of a.premiseRefs) if (have.has(p)) edges.push({ data: { id: `${a.id}<${p}`, source: p, target: a.id, label: 'premise', style: 'solid', color: '#999' } }); if (have.has(a.conclusionRef)) edges.push({ data: { id: `${a.id}>c`, source: a.id, target: a.conclusionRef, label: '∴', style: 'solid', color: '#666' } }); }
  for (const e of r.edges) if (f[e.operator] !== false && have.has(e.from) && have.has(e.to)) edges.push({ data: { id: e.id + e.to, source: e.from, target: e.to, label: e.operator + (e.derived ? ' (implied)' : '') + (e.targetRef ? ` ${e.targetRef.split(':')[1]}` : ''), style: 'dashed', color: cssVar('--red') } });
  for (const rel of Object.values(state.commit.snapshot.relations)) if (rel.status !== 'retracted' && !['rebut', 'undercut', 'undermine', 'attacks'].includes(rel.operator) && f[rel.operator === 'supports' || rel.operator === 'evidence_for' ? 'supports' : rel.operator === 'qualifies' ? 'qualifies' : 'evidence'] !== false && have.has(rel.from) && have.has(rel.to)) edges.push({ data: { id: rel.id, source: rel.from, target: rel.to, label: rel.operator, style: 'dotted', color: cssVar('--green') } });
  if (f.concepts) for (const c of Object.values(U)) if (c.kind === 'claim' && have.has(c.id)) for (const t of c.terms ?? []) if (t.conceptRef && have.has(t.conceptRef)) edges.push({ data: { id: `${c.id}~${t.conceptRef}`, source: c.id, target: t.conceptRef, label: t.symbol, style: 'dotted', color: cssVar('--accent') } });
  if (cy) cy.destroy();
  if (typeof window.cytoscape !== 'function') {
    cy = null;
    $('#cy').innerHTML = `<div style="padding:12px"><p class="small">Graph library not loaded (vendor/cytoscape.min.js missing). Run <code>npm run bundles</code>. Nodes are listed instead:</p>${nodes.map((n) => `<div class="card" data-id="${n.data.id}"><span class="badge" style="background:${n.data.color}">${esc(n.data.kind)}</span>${esc(n.data.label.replace('\n', ' — '))}</div>`).join('')}</div>`;
    for (const el of $('#cy').querySelectorAll('.card')) el.onclick = () => select(el.dataset.id);
    return;
  }
  cy = cytoscape({
    container: $('#cy'), elements: { nodes, edges },
    style: [
      { selector: 'node', style: { 'background-color': 'data(color)', 'background-opacity': 0.18, 'border-width': 2, 'border-color': 'data(color)', label: 'data(label)', 'text-wrap': 'wrap', 'text-max-width': 130, 'font-size': 9, 'text-valign': 'center', 'text-halign': 'center', width: 140, height: 44, shape: 'data(shape)', color: cssVar('--fg') } },
      { selector: 'node[kind="argument"]', style: { 'background-opacity': 0.35, 'font-weight': 'bold' } },
      { selector: 'node:selected', style: { 'border-width': 4, 'border-color': cssVar('--accent') } },
      { selector: 'edge', style: { width: 1.5, 'line-color': 'data(color)', 'target-arrow-color': 'data(color)', 'target-arrow-shape': 'triangle', 'curve-style': 'bezier', 'line-style': 'data(style)', label: 'data(label)', 'font-size': 8, color: '#777', 'text-rotation': 'autorotate', 'text-background-color': cssVar('--bg'), 'text-background-opacity': 0.8 } }
    ],
    minZoom: 0.15, maxZoom: 3, wheelSensitivity: 0.2,
    layout: nodes.length > 60
      ? { name: 'cose', animate: false, nodeRepulsion: () => 120000, idealEdgeLength: () => 120, edgeElasticity: () => 60, gravity: 0.6, numIter: 800, padding: 20, randomize: true }
      : { name: 'breadthfirst', directed: true, spacingFactor: 1.4, padding: 30, roots: nodes.filter((n) => n.data.kind === 'claim' && !edges.some((e) => e.data.target === n.data.id)).map((n) => n.data.id) }
  });
  cy.fit(undefined, 24);
  cy.on('tap', 'node', (e) => select(e.target.id()));
}

function select(id) {
  state.selected = id;
  renderInspector();
  if (cy) { cy.elements().unselect(); const n = cy.getElementById(id); if (n.length) { n.select(); cy.animate({ center: { eles: n } }, { duration: 200 }); } }
  for (const el of document.querySelectorAll('.card')) el.classList.toggle('selected', el.dataset.id === id);
}

function renderArguments() {
  const U = units(); const r = ev();
  const positions = Object.values(U).filter((u) => u.kind === 'position');
  const args = Object.values(U).filter((u) => u.kind === 'argument' && u.status !== 'retracted').sort((a, b) => a.id.localeCompare(b.id));
  const groups = positions.length ? positions.map((p) => [p.name, args.filter((a) => a.positionRef === p.id)]) : [['Arguments', args]];
  $('#panel-arguments').innerHTML = groups.map(([name, list]) => `<h3>${esc(name)}</h3>` + list.map((a) => { const L = r.logic?.arguments?.[a.id]; return `<div class="card" data-id="${a.id}"><span class="badge ${r.labels[a.id]}">${LABEL_WORD[r.labels[a.id]]}</span>${L && L.result !== 'outside_coverage' ? `<span class="badge ${L.result}">${L.result.replace('_', ' ')}</span>` : ''}<b>${esc(a.id.split(':')[1])}.</b> ${esc(a.title)}<div class="small">${a.premiseRefs.map((p) => p.split(':')[1]).join(' + ')} ∴ ${esc(a.conclusionRef.split(':')[1])} · ${esc(a.scheme)} · ${esc(r.derivation[a.id]?.reason ?? '')}</div></div>`; }).join('')).join('');
  for (const el of $('#panel-arguments').querySelectorAll('.card')) el.onclick = () => select(el.dataset.id);
}

function renderDiagnostics() {
  const ds = ev().diagnostics;
  $('#panel-diagnostics').innerHTML = `<p class="small">Colour is diagnostic state under a named evaluator, never a truth label. Every flag says what it checked and what you can do.</p>` + ds.map((d, i) => `<div class="card" data-id="${esc(d.target ?? '')}" data-diag="${i}"><span class="badge ${d.state}">${d.state}</span><code>${esc(d.code)}</code> <b>${esc(d.target ?? 'snapshot')}</b> <span class="small">${esc(d.evaluator)}</span><div>${esc(d.message)}</div></div>`).join('');
  for (const el of $('#panel-diagnostics').querySelectorAll('.card')) el.onclick = () => { state.selected = el.dataset.id || null; renderInspector(ds[Number(el.dataset.diag)]); };
}

function renderLogic() {
  const U = units(); const r = ev(); const lt = state.commit.logicText;
  const rows = Object.values(U).filter((u) => u.kind === 'claim' && u.status !== 'retracted').sort((a, b) => a.id.localeCompare(b.id));
  $('#panel-logic').innerHTML = `<p class="small">Logic IR is the canonical form (KnowShowGo v0.0.1); the Prolog line is a projection. Claims without an expression are outside evaluator coverage, which is not a verdict.</p><table><tr><th>Claim</th><th>Grounding</th><th>Logic IR</th><th>Prolog</th><th>Result</th></tr>${rows.map((c) => { const g = r.grounding[c.id]?.state ?? 'none'; const L = r.logic?.claims?.[c.id]; return `<tr data-id="${c.id}"><td><b>${esc(c.id.split(':')[1])}</b><br><span class="small">${esc(c.text)}</span></td><td><span class="badge ${g === 'resolved' ? 'green' : g === 'none' ? 'grey' : 'yellow'}">${g}</span></td><td>${lt[c.id] ? `<code>${esc(lt[c.id].ir)}</code>` : '<span class="small">—</span>'}</td><td>${lt[c.id] ? `<code>${esc(lt[c.id].prolog)}</code>` : ''}</td><td>${L && L.result !== 'outside_coverage' ? `<span class="badge ${L.result}">${L.result.replace('_', ' ')}</span>` : `<span class="small">${esc(L?.reason ?? '')}</span>`}</td></tr>`; }).join('')}</table>`;
  for (const tr of $('#panel-logic').querySelectorAll('tr[data-id]')) tr.onclick = () => select(tr.dataset.id);
}

function renderConcepts() {
  const U = units();
  const cs = Object.values(U).filter((u) => u.kind === 'concept').sort((a, b) => a.id.localeCompare(b.id));
  $('#panel-concepts').innerHTML = cs.length ? cs.map((c) => `<div class="card" data-id="${c.id}"><b>${esc(c.label)}</b> <span class="small">${esc(c.id)}${c.senseOf ? ' · sense of ' + esc(c.senseOf.split(':')[1]) : ''} · ${c.ksgRef ? 'KSG ' + esc(c.ksgRef) : 'local'}</span><div class="small">${esc(c.definition ?? '')}${c.aliases?.length ? '<br>aliases: ' + esc(c.aliases.join(', ')) : ''}</div></div>`).join('') : '<p class="small">No concepts in this project yet.</p>';
  for (const el of $('#panel-concepts').querySelectorAll('.card')) el.onclick = () => select(el.dataset.id);
}

function renderCompare() {
  const own = state.commit.diff;
  const cmps = state.bundle.compares;
  $('#panel-compare').innerHTML = `<h3>This commit vs its parent</h3>${own ? `<pre>${esc(own.text)}\n${esc(own.evaluationText)}</pre>` : '<p class="small">Root commit.</p>'}` + cmps.map((c) => `<h3>${esc(c.from)} → ${esc(c.to)}</h3><p class="small">${esc(c.fromCommit.slice(7, 19))} → ${esc(c.toCommit.slice(7, 19))} · classes: ${esc(c.diff.classes.join(', '))}</p><pre>${esc(c.diff.text)}\n${esc(c.evaluationText)}</pre>`).join('');
}

function renderInspector(diag = null) {
  const id = state.selected;
  const U = units(); const r = ev(); const el = $('#inspector');
  if (!id && !diag) { el.innerHTML = '<p class="muted">Select a node, an argument, a diagnostic or a concept.</p>'; return; }
  const u = id ? U[id] : null;
  const parts = [];
  if (diag) parts.push(`<div class="card" style="cursor:default"><span class="badge ${diag.state}">${diag.state}</span><code>${esc(diag.code)}</code><div>${esc(diag.message)}</div><h4>Detected</h4><div class="small">${esc(diag.explanation.detected)}</div><h4>Why</h4><div class="small">${esc(diag.explanation.why)}</div><h4>Checked</h4><div class="small">${esc((diag.explanation.checked ?? []).join(', ') || '—')}</div>${diag.explanation.missingCondition ? `<h4>Missing condition</h4><div class="small">${esc(diag.explanation.missingCondition.hints.join(' or '))}</div>` : ''}${diag.explanation.proof?.length ? `<h4>Proof</h4><ol class="small">${diag.explanation.proof.map((s) => `<li><code>${esc(s.expression)}</code> ${esc(s.rule)}${s.from.length ? ' from ' + esc(s.from.join(', ')) : ''}</li>`).join('')}</ol>` : ''}<h4>Options</h4>${(diag.explanation.options ?? []).map((o) => `<span class="opt">${esc(o)}</span>`).join('')}<div class="small" style="margin-top:6px">evaluator ${esc(diag.evaluator)} · scope ${esc((diag.scope.commit ?? '').slice(7, 19))}</div></div>`);
  if (u) {
    parts.push(`<h2>${esc(u.id)}</h2><p>${esc(u.title ?? u.label ?? '')}${u.title && u.text ? '<br>' : ''}${esc(u.text ?? '')}</p>`);
    const dim = r.dimensions?.[id];
    if (dim) parts.push(`<h4>Dimensions</h4><dl class="dim">${Object.entries(dim).map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>`);
    if (u.kind === 'claim') {
      parts.push(`<h4>Proposition</h4><div class="small">${esc(u.claimKind)} · asserted as <b>${esc(u.modality)}</b> · basis ${esc(u.basis)}${u.positionRef ? ' · ' + esc(U[u.positionRef]?.name ?? u.positionRef) : ''}</div>`);
      if (u.proposition) parts.push(`<div class="small">predicate ${esc(u.proposition.predicateRef)} · roles ${esc(JSON.stringify(u.proposition.roles))}${u.proposition.polarity ? ' · ' + esc(u.proposition.polarity) : ''}${u.proposition.context ? ' · context ' + esc(JSON.stringify(u.proposition.context)) : ''}</div>`);
      const g = r.grounding[id];
      if (g && g.state !== 'none') parts.push(`<h4>Grounding</h4>${g.terms.map((t) => `<div class="small"><span class="badge ${t.status === 'resolved' ? 'green' : 'yellow'}">${t.status}</span>${esc(t.symbol)} → ${t.conceptRef ? `<a data-sel="${t.conceptRef}">${esc(U[t.conceptRef]?.label ?? t.conceptRef)}</a>` : t.candidates.length ? 'candidates: ' + t.candidates.map((c) => `<a data-sel="${c}">${esc(U[c]?.label ?? c)}</a>`).join(', ') : '<i>none</i>'}</div>`).join('')}`);
      const lt = state.commit.logicText[id];
      if (lt) parts.push(`<h4>Logic</h4><code>${esc(lt.ir)}</code><br><code>${esc(lt.prolog)}</code>${r.logic?.claims?.[id] && r.logic.claims[id].result !== 'outside_coverage' ? `<div class="small">against the rest of the snapshot: <span class="badge ${r.logic.claims[id].result}">${r.logic.claims[id].result.replace('_', ' ')}</span></div>` : ''}`);
      if (u.sourceRefs?.length) parts.push(`<h4>Sources</h4>${u.sourceRefs.map((s) => { const src = U[s]; return `<div class="small">${src?.url ? `<a href="${esc(src.url)}" target="_blank">${esc(src.title)}</a>` : esc(src?.title ?? s)}${src?.who ? ', ' + esc(src.who) : ''}${src?.year ? ' ' + src.year : ''}</div>`; }).join('')}`);
      const sup = Object.values(U).filter((a) => a.kind === 'argument' && a.conclusionRef === id);
      const use = Object.values(U).filter((a) => a.kind === 'argument' && a.premiseRefs.includes(id));
      if (sup.length || use.length) parts.push(`<h4>Arguments</h4><div class="small">concluded by: ${sup.map((a) => `<a data-sel="${a.id}">${esc(a.id.split(':')[1])}</a>`).join(', ') || '—'}<br>premise of: ${use.map((a) => `<a data-sel="${a.id}">${esc(a.id.split(':')[1])}</a>`).join(', ') || '—'}</div>`);
    }
    if (u.kind === 'argument') {
      parts.push(`<h4>Structure</h4>${u.premiseRefs.map((p) => `<div class="small"><a data-sel="${p}">${esc(p.split(':')[1])}</a> <span class="badge ${U[p]?.modality ? 'grey' : 'grey'}">${esc(U[p]?.modality ?? U[p]?.kind)}</span> ${esc(U[p]?.text)}</div>`).join('')}<div class="small"><b>∴ <a data-sel="${u.conclusionRef}">${esc(u.conclusionRef.split(':')[1])}</a></b> ${esc(U[u.conclusionRef]?.text)}</div>${u.warrant ? `<div class="small"><i>${esc(u.warrant)}</i> (${esc(u.scheme)})</div>` : ''}${u.notes ? `<div class="small">${esc(u.notes)}</div>` : ''}`);
      const d = r.derivation[id];
      parts.push(`<h4>Argument state</h4><div class="small"><span class="badge ${r.labels[id]}">${LABEL_WORD[r.labels[id]]}</span>${esc(d?.reason)}</div>`);
      const atk = r.edges.filter((e) => e.to === id);
      if (atk.length) parts.push(`<div class="small">attacked by: ${atk.map((e) => `<a data-sel="${e.from}">${esc(e.from.split(':')[1])}</a> (${esc(e.operator)}${e.derived ? ' implied' : ''}${e.targetRef ? ' ' + esc(e.targetRef.split(':')[1]) : ''}, ${LABEL_WORD[r.labels[e.from]]})`).join(', ')}</div>`);
      const L = r.logic?.arguments?.[id];
      if (L) parts.push(`<h4>Native logic</h4><div class="small"><span class="badge ${L.result}">${L.result.replace('_', ' ')}</span>${esc(L.evaluator)}@${esc(L.evaluatorVersion)}${L.expression ? ' · <code>' + esc(L.expression) + '</code>' : ''}</div>${L.proof?.length ? `<ol class="small">${L.proof.map((s) => `<li><code>${esc(s.expression)}</code> ${esc(s.rule)}${s.from.length ? ' from ' + esc(s.from.join(', ')) : ''}</li>`).join('')}</ol>` : ''}${L.missingCondition ? `<div class="small">missing condition: ${esc(L.missingCondition.hints.join(' or '))}</div>` : ''}${L.missing ? `<div class="small">outside coverage: ${esc(L.missing.map((m) => `${m.claim} (${m.reason})`).join('; '))}</div>` : ''}`);
      const ann = Object.values(U).filter((x) => x.kind === 'annotation' && x.targetRef === id);
      if (ann.length) parts.push(`<h4>Fallacy annotations</h4>${ann.map((a) => `<div class="small"><b>${esc(a.name)}</b> at ${esc(a.where)} (${esc(a.severity)}): ${esc(a.text)}</div>`).join('')}`);
    }
    if (u.kind === 'concept') {
      const claims = Object.values(U).filter((c) => c.kind === 'claim' && (c.terms ?? []).some((t) => t.conceptRef === id || (t.candidates ?? []).includes(id)));
      const cids = new Set(claims.map((c) => c.id));
      const args = Object.values(U).filter((a) => a.kind === 'argument' && (a.premiseRefs.some((p) => cids.has(p)) || cids.has(a.conclusionRef)));
      const senses = Object.values(U).filter((c) => c.kind === 'concept' && c.id !== id && c.senseOf && c.senseOf === u.senseOf);
      parts.push(`<h4>Concept</h4><div class="small">${esc(u.definition ?? '')}<br>${u.ksgRef ? 'KSG ' + esc(u.ksgRef) : 'local concept, not yet in KnowShowGo'}${u.aliases?.length ? '<br>aliases: ' + esc(u.aliases.join(', ')) : ''}${u.senseOf ? '<br>sense of <a data-sel="' + esc(u.senseOf) + '">' + esc(U[u.senseOf]?.label ?? u.senseOf) + '</a>' : ''}</div>${senses.length ? `<h4>Competing senses</h4>${senses.map((s) => `<div class="small"><a data-sel="${s.id}">${esc(s.label)}</a></div>`).join('')}` : ''}<h4>Used by</h4><div class="small">claims: ${claims.map((c) => `<a data-sel="${c.id}">${esc(c.id.split(':')[1])}</a>`).join(', ') || '—'}<br>arguments affected if regrounded: ${args.map((a) => `<a data-sel="${a.id}">${esc(a.id.split(':')[1])}</a>`).join(', ') || '—'}</div>`);
    }
    const mine = r.diagnostics.filter((d) => d.target === id);
    if (mine.length && !diag) parts.push(`<h4>Diagnostics</h4>${mine.map((d) => `<div class="small"><span class="badge ${d.state}">${d.state}</span><code>${esc(d.code)}</code> ${esc(d.message)}</div>`).join('')}`);
    const rev = state.commit.snapshot.revisions[id];
    parts.push(`<h4>Revision</h4><div class="small">revision ${rev?.revision} · <code>${esc((rev?.contentHash ?? '').slice(7, 19))}</code> · ${esc(u.status)} · ${esc(u.provenance?.sourceType)}${u.provenance?.method ? ' / ' + esc(u.provenance.method) : ''}</div>`);
  }
  el.innerHTML = parts.join('');
  for (const a of el.querySelectorAll('a[data-sel]')) a.onclick = () => select(a.dataset.sel);
}

/* ---------------- Composer: text in, underlines out ---------------- */
const GRAMMAR = `issue: <question>
thesis: <claim id>
party <id>: <display name>
concept|entity|predicate <key> (<label>): <definition>
  aliases: a, b        kind: concept|entity|predicate        sense of: <key>
<Claim id> [modality, basis, kind, party]: <text>
  logic: forall x: p(x) -> q(x)      terms: word, word=conceptKey      source: Title | url
<Arg id> [scheme, party]: P1, P2 => C
  title: …    warrant: …
<Arg> undercuts|rebuts|undermines <Arg> [at <premise>]: note
fallacy <Arg> <name> [inference|conclusion|premise:<id>, fatal|weakens|note, party]: why
modality: speculative possible plausible probable certain · basis: evidence definition assumption derived
kind: empirical predictive normative definitional conceptual · scheme: deductive inductive abductive analogical expected-value authority extrapolation`;

let composeTimer = null;
let composeResult = null;
let tip = null;

async function runCompose() {
  const text = $('#compose-text').value;
  $('#compose-status').textContent = 'evaluating…';
  try {
    const res = await fetch('api/compose', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text }) });
    composeResult = await res.json();
  } catch (e) {
    $('#compose-status').innerHTML = `<span class="badge red">no compose endpoint</span> run <code>npm run serve</code> (the static page alone cannot evaluate)`;
    return;
  }
  renderCompose(text);
}

function renderCompose(text) {
  const r = composeResult;
  const lines = text.split(/\r?\n/);
  const byLine = new Map();
  for (const d of r.diagnostics) { if (!d.line) continue; const L = d.line.line; byLine.set(L, [...(byLine.get(L) ?? []), d]); }
  const worst = (ds) => (ds.some((d) => d.state === 'red') ? 'red' : ds.some((d) => d.state === 'yellow') ? 'yellow' : 'green');
  $('#compose-gutter').innerHTML = lines.map((_, i) => { const ds = byLine.get(i + 1); return `<div class="${ds ? worst(ds) : ''}">${i + 1}</div>`; }).join('');
  $('#compose-review').innerHTML = lines.map((line, i) => { const ds = byLine.get(i + 1); const body = esc(line || ' '); return `<span class="rl"><span class="ln">${i + 1}</span>${ds ? `<span class="mark ${worst(ds)}" data-line="${i + 1}">${body}</span>` : body}</span>`; }).join('');
  const s = r.summary;
  $('#compose-status').innerHTML = s ? `<span class="badge red">${s.red}</span><span class="badge yellow">${s.yellow}</span><span class="badge green">${s.green}</span> ${s.units} units · ${s.accepted} stand / ${s.rejected} defeated${s.thesis ? ' · thesis ' + s.thesis : ''}` : `<span class="badge red">${r.diagnostics.length}</span> problems at stage ${esc(r.stage)}`;
  const unlined = r.diagnostics.filter((d) => !d.line && d.state !== 'green');
  if (unlined.length) $('#compose-review').innerHTML += `<hr>` + unlined.map((d) => `<span class="rl"><span class="mark ${d.state}" data-diag="${r.diagnostics.indexOf(d)}">${esc(d.code)} ${esc(d.message)}</span></span>`).join('');
  for (const m of $('#compose-review').querySelectorAll('.mark')) {
    const ds = m.dataset.line ? byLine.get(Number(m.dataset.line)) : [r.diagnostics[Number(m.dataset.diag)]];
    m.onmouseenter = (e) => showTip(e, ds);
    m.onmousemove = (e) => { if (tip) { tip.style.left = `${Math.min(e.clientX + 12, window.innerWidth - 440)}px`; tip.style.top = `${e.clientY + 14}px`; } };
    m.onmouseleave = hideTip;
    m.onclick = () => { hideTip(); showComposeInspector(ds); };
  }
}

function showTip(e, ds) {
  hideTip();
  tip = document.createElement('div');
  tip.className = 'tip';
  tip.innerHTML = ds.map((d) => `<div><span class="badge ${d.state}">${d.state}</span><code>${esc(d.code)}</code> ${esc(d.message)}<div class="small">${esc(d.explanation?.why ?? '')}</div></div>`).join('<hr>');
  tip.style.left = `${Math.min(e.clientX + 12, window.innerWidth - 440)}px`;
  tip.style.top = `${e.clientY + 14}px`;
  document.body.appendChild(tip);
}
function hideTip() { if (tip) { tip.remove(); tip = null; } }

function showComposeInspector(ds) {
  const r = composeResult;
  const el = $('#inspector');
  el.innerHTML = ds.map((d) => `<div class="card" style="cursor:default"><span class="badge ${d.state}">${d.state}</span><code>${esc(d.code)}</code> ${d.target ? `<b>${esc(d.target)}</b>` : ''}<div>${esc(d.message)}</div><h4>Why</h4><div class="small">${esc(d.explanation?.why ?? '')}</div>${d.explanation?.checked?.length ? `<h4>Checked</h4><div class="small">${esc(d.explanation.checked.join(', '))}</div>` : ''}${d.explanation?.missingCondition ? `<h4>Missing condition</h4><div class="small">${esc(d.explanation.missingCondition.hints.join(' or '))}</div>` : ''}${d.explanation?.proof?.length ? `<h4>Proof</h4><ol class="small">${d.explanation.proof.map((s) => `<li><code>${esc(s.expression)}</code> ${esc(s.rule)}${s.from.length ? ' from ' + esc(s.from.join(', ')) : ''}</li>`).join('')}</ol>` : ''}<h4>Options</h4>${(d.explanation?.options ?? []).map((o) => `<span class="opt">${esc(o)}</span>`).join('')}<div class="small" style="margin-top:6px">evaluator ${esc(d.evaluator)}</div></div>`).join('');
  const t = ds[0]?.target;
  if (t && r.evaluation?.dimensions?.[t]) el.innerHTML += `<h4>Dimensions of ${esc(t)}</h4><dl class="dim">${Object.entries(r.evaluation.dimensions[t]).map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>`;
}

$('#compose-text').addEventListener('input', () => { clearTimeout(composeTimer); composeTimer = setTimeout(runCompose, 450); });
$('#compose-text').addEventListener('scroll', () => { $('#compose-gutter').scrollTop = $('#compose-text').scrollTop; });
$('#compose-example').onclick = async () => { $('#compose-text').value = await (await fetch('api/compose/example')).text(); runCompose(); };
$('#compose-help').onclick = () => { const g = $('#compose-grammar'); g.hidden = !g.hidden; g.textContent = GRAMMAR; };

for (const b of document.querySelectorAll('#tabs button')) b.onclick = () => { for (const x of document.querySelectorAll('#tabs button')) x.classList.toggle('active', x === b); for (const p of document.querySelectorAll('.panel')) p.classList.toggle('active', p.id === `panel-${b.dataset.tab}`); if (b.dataset.tab === 'graph' && cy) { cy.resize(); cy.fit(undefined, 24); if (state.selected && cy.getElementById(state.selected).length) cy.center(cy.getElementById(state.selected)); } };

loadIndex().catch((e) => { $('#issue').innerHTML = `<p class="badge red">failed to load bundle: ${esc(e.message)}</p>`; });
