/**
 * Shape a TruthApp claim/argument for KnowShowGo's seeded Logic IR prototypes.
 *
 * KSG classifies an object by prototype match over its property snapshot
 * (`knowshowgo/src/prototype/prototype_match_service.js`). The `Proposition`
 * contract reads: `has_semantic_expression` (semanticExpression or logicIr),
 * `has_truth_conditions` (truthConditions), `required_material_symbols_resolved`
 * (every binding RESOLVED), `structurally_well_formed`. This module writes
 * exactly those property names, the same ones KSG's own `toObjectProperties`
 * emits, so a claim TruthApp formalises matches `Proposition` on the server.
 *
 * Local `concept:<key>` ids in a claim's `logicIr` and `terms` are rewritten
 * to the KSG object uuids the concepts were written under (or a concept's
 * explicit `ksgRef`). `resolve(conceptId)` returns that uuid or null; a null
 * leaves the symbol unresolved, which is E001 and keeps the object off the
 * `Proposition` prototype rather than guessing.
 */

import { KINDS, canonicalize, hashIr, serialize, validate, wrapRoot } from './ir.mjs';
import { claimExpression, groundingState, termStatuses } from './kb.mjs';

/** Deep-copy an IR, rewriting every ConceptRef/EntityRef uuid through `resolve`. */
export function remapRefs(ir, resolve) {
  const unresolved = [];
  const walk = (node) => {
    if (!node || typeof node !== 'object') return node;
    if (node.kind === KINDS.ConceptRef || node.kind === KINDS.EntityRef) {
      const mapped = String(node.uuid).startsWith('concept:') ? resolve(node.uuid) : node.uuid;
      if (!mapped) { unresolved.push(node.uuid); return { ...node }; }
      return { ...node, uuid: mapped, ...(node.revisionUuid ? { revisionUuid: mapped } : {}) };
    }
    const out = Array.isArray(node) ? [] : {};
    for (const [k, v] of Object.entries(node)) out[k] = v && typeof v === 'object' ? walk(v) : v;
    return out;
  };
  return { ir: walk(wrapRoot(ir)), unresolved: [...new Set(unresolved)] };
}

/** Bindings array (KSG `semanticBindings` shape) from a claim's terms. */
export function bindingsFor(claim, resolve) {
  return termStatuses(claim).map((t) => {
    const uuid = t.conceptRef ? resolve(t.conceptRef) : null;
    return {
      symbol: t.symbol,
      ...(uuid ? { targetUuid: uuid, targetRevisionUuid: uuid } : {}),
      ...(t.status === 'ambiguous' ? { candidates: (t.candidates || []).map(resolve).filter(Boolean) } : {}),
      status: uuid ? 'resolved' : t.status === 'ambiguous' ? 'ambiguous' : 'unresolved'
    };
  });
}

const prop = (name, value, type = 'text') => ({ name, type, value: value == null ? '' : typeof value === 'string' ? value : JSON.stringify(value) });

/**
 * Decide the KSG prototype and the property set for a claim.
 * Returns { prototype: 'Proposition'|'Claim'|'Utterance', properties, logicIr, formalisable, unresolved }.
 */
export function formalizeClaim(claim, snapshot, resolve) {
  const dims = [
    prop('text', claim.text),
    prop('modality', claim.modality),
    prop('basis', claim.basis),
    prop('claimKind', claim.claimKind),
    ...(claim.positionRef ? [prop('positionRef', claim.positionRef)] : [])
  ];
  const ex = claimExpression(claim, snapshot);
  const grounding = groundingState(claim);
  const hasIr = ex && ex.valid.ok && ex.from === 'logicIr';
  const hasProp = ex && ex.valid.ok && ex.from === 'proposition';

  if (hasIr) {
    const { ir, unresolved } = remapRefs(claim.logicIr, resolve);
    const bindings = bindingsFor(claim, resolve);
    const allResolved = unresolved.length === 0 && bindings.every((b) => b.status === 'resolved') && grounding !== 'ambiguous';
    const canonical = canonicalize(ir);
    const properties = [
      ...dims,
      prop('logicIrVersion', canonical.logicIrVersion),
      prop('logicIr', serialize(canonical)),
      prop('logicIrHash', hashIr(canonical)),
      prop('semanticExpression', serialize(canonical)),
      prop('semanticBindings', bindings),
      prop('materialSymbols', bindings.map((b) => ({ label: b.symbol, uuid: b.targetUuid ?? null, status: b.status, resolved: b.status === 'resolved' }))),
      prop('truthConditions', ['expression admits a truth value']),
      prop('structurallyWellFormed', String(validate(canonical).ok)),
      prop('unresolvedMaterialSymbols', bindings.filter((b) => b.status !== 'resolved').map((b) => b.symbol))
    ];
    // Only claim the Proposition prototype when every symbol resolves; otherwise
    // it is an Utterance with a formal expression pending (E001), never guessed.
    return { prototype: allResolved ? 'Proposition' : 'Utterance', properties, logicIr: canonical, formalisable: allResolved, unresolved };
  }

  if (hasProp) {
    const p = claim.proposition;
    const subj = Object.values(p.roles || {})[0];
    const subjectUuid = subj ? resolve(subj) : null;
    const predicateUuid = resolve(p.predicateRef);
    if (subjectUuid && predicateUuid) {
      return {
        prototype: 'Claim',
        properties: [...dims, prop('subject', subjectUuid, 'concept_ref'), prop('predicate', predicateUuid, 'concept_ref'), prop('object', subjectUuid, 'concept_ref')],
        formalisable: true,
        unresolved: []
      };
    }
  }

  return { prototype: 'Utterance', properties: dims, formalisable: false, unresolved: [] };
}
