/**
 * Compact authoring format -> TruthPatch.
 *
 * Writing sixty units by hand in full TruthIR is tedious, so a case can be
 * authored compactly (propositions, arguments, attacks, fallacies keyed by
 * short ids) and compiled deterministically into an `addUnit`/`addRelation`
 * patch. The compiled patch is what gets committed; the compact file is kept
 * beside it and a test proves they agree.
 *
 * Compact shape:
 *   { id, title, question, description?, thesis?, parties: [{id,name,description?}],
 *     sources: { key: {title, who?, year?, url?, note?} },
 *     propositions: [{id, text, party?, kind, modality, basis, sources?: [key], notes?}],
 *     arguments: [{id, party, title, premises, conclusion, scheme, warrant?, sources?, notes?}],
 *     attacks: [{id, attacker, target, type, target_ref?, note?}],
 *     fallacies: [{argument, name, where?, explanation, severity?, by?}] }
 */

export function compileCase(c, { provenance = null, message = null } = {}) {
  const prov = provenance ?? { sourceType: 'user', sourceRef: `case:${c.id}`, method: 'manual_authoring' };
  const ops = [];
  const add = (unit) => ops.push({ op: 'addUnit', unit: { status: 'accepted', provenance: prov, ...unit } });
  const rel = (relation) => ops.push({ op: 'addRelation', relation: { status: 'accepted', provenance: prov, ...relation } });
  const issueId = `issue:${c.id}`;
  const claimRef = (id) => `claim:${id}`;
  const argRef = (id) => `argument:${id}`;
  const posRef = (id) => (id ? `position:${id}` : undefined);
  const srcRef = (k) => `source:${k}`;

  add({ id: issueId, kind: 'issue', title: c.title, question: c.question, text: c.description ?? undefined, thesisRef: c.thesis ? claimRef(c.thesis) : undefined });
  for (const p of c.parties ?? []) add({ id: `position:${p.id}`, kind: 'position', issueRef: issueId, name: p.name, text: p.description ?? undefined });
  for (const [key, s] of Object.entries(c.sources ?? {})) add({ id: srcRef(key), kind: 'source', title: s.title, who: s.who, year: s.year, url: s.url, note: s.note });
  for (const p of c.propositions ?? []) {
    add({
      id: claimRef(p.id),
      kind: 'claim',
      text: p.text,
      claimKind: p.kind ?? 'empirical',
      modality: p.modality ?? 'plausible',
      basis: p.basis ?? 'assumption',
      positionRef: posRef(p.party),
      sourceRefs: p.sources?.length ? p.sources.map(srcRef) : undefined,
      notes: p.notes,
      tags: p.tags
    });
  }
  for (const a of c.arguments ?? []) {
    add({
      id: argRef(a.id),
      kind: 'argument',
      title: a.title,
      premiseRefs: a.premises.map(claimRef),
      conclusionRef: claimRef(a.conclusion),
      scheme: a.scheme ?? 'deductive',
      strict: a.scheme === 'deductive',
      warrant: a.warrant,
      positionRef: posRef(a.party),
      sourceRefs: a.sources?.length ? a.sources.map(srcRef) : undefined,
      notes: a.notes
    });
  }
  (c.fallacies ?? []).forEach((f, i) => {
    add({
      id: `annotation:fallacy-${String(i + 1).padStart(2, '0')}`,
      kind: 'annotation',
      annotationType: 'fallacy',
      targetRef: argRef(f.argument),
      name: f.name,
      where: f.where ? (f.where.startsWith('premise:') ? `premise:${claimRef(f.where.slice(8))}` : f.where) : 'inference',
      severity: f.severity ?? 'weakens',
      byRef: posRef(f.by),
      text: f.explanation
    });
  });
  for (const x of c.attacks ?? []) {
    rel({
      id: `rel:${x.id}`,
      operator: x.type ?? 'rebut',
      from: argRef(x.attacker),
      to: x.target === '*' ? 'argument:*' : argRef(x.target),
      targetRef: x.target_ref ? claimRef(x.target_ref) : undefined,
      note: x.note
    });
  }
  // Drop undefined so the patch canonicalises cleanly.
  const strip = (o) => JSON.parse(JSON.stringify(o));
  return strip({
    patchVersion: '0.1',
    id: `patch:${c.id}-initial`,
    baseCommitRef: null,
    message: message ?? `Author case ${c.id}`,
    provenance: prov,
    operations: ops
  });
}
