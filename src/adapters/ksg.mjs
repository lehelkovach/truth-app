/**
 * The single KnowShowGo boundary. Everything TruthApp writes to KSG goes
 * through `createKsgAdapter({ client })`, where `client` is a
 * `KnowShowGoClient` from `@lehelkovach/knowshowgo-client` (or the fake
 * below). No raw HTTP here and none anywhere else in the app.
 *
 * Units are cast to KSG's seeded Logic IR prototypes (not ad-hoc categories):
 *   concept   -> Concept          (object; its uuid grounds claim logicIr refs)
 *   claim     -> Proposition      when it has logicIr and every term resolves
 *              -> Claim           when it has an sop (proposition.roles) of concepts
 *              -> Utterance       otherwise (formal expression pending, E001)
 *   argument  -> Argument         (premises = premise object uuids, conclusion ref)
 *   other     -> category_name    (issue/position/source/evidence/... are
 *                                  TruthApp domain units, not logic primitives)
 *
 * After each cast the adapter asks KSG `evaluatePrototypeMatch` and records the
 * decision as an evaluation (never as a stored type), and for arguments it asks
 * `evaluateLogicInference` and records valid/invalid/unresolved beside the
 * grounded label. Relations become assertions; the commit becomes an assertion.
 */

import { formalizeClaim } from '../logic/formalize.mjs';
import { termStatuses } from '../logic/kb.mjs';

/** Write order: things referenced before things that reference them. */
const KIND_ORDER = { actor: 0, source: 1, concept: 2, issue: 3, position: 4, evidence: 5, claim: 6, assumption: 6, hypothesis: 7, theory: 8, argument: 9, annotation: 10 };

/** Seeded Logic IR prototypes a unit kind casts to (else category_name). */

export function createKsgAdapter({ client, source = 'truth-app', ownerUserId = null }) {
  if (!client) throw new TypeError('createKsgAdapter needs a client');
  const objectUuids = new Map(); // unit id -> last KSG object uuid
  const conceptUuids = new Map(); // concept unit id -> KSG uuid (or ksgRef)
  const assertionIds = new Map(); // relation id -> last KSG assertion id
  const matches = new Map(); // unit id -> { prototype, decision }
  const inferences = new Map(); // argument unit id -> { decision, rule }
  let protoByName = null;

  const resolveConcept = (conceptId) => conceptUuids.get(conceptId) ?? null;

  async function ensurePrototypes() {
    if (protoByName) return protoByName;
    protoByName = new Map();
    if (typeof client.seed_logic_ir_primitives !== 'function') return protoByName;
    const seeded = await client.seed_logic_ir_primitives();
    for (const c of seeded?.report?.categories ?? []) {
      if (c?.name && c?.categoryPrototypeUuid) protoByName.set(c.name, c.categoryPrototypeUuid);
    }
    return protoByName;
  }

  /** Decide the KSG cast for a unit: { prototype, properties, extra }. */
  function castUnit(unit, snapshot) {
    if (unit.kind === 'claim') {
      const f = formalizeClaim(unit, snapshot, resolveConcept);
      return { prototype: f.prototype, properties: f.properties, formalisable: f.formalisable, unresolved: f.unresolved };
    }
    if (unit.kind === 'concept') {
      return {
        prototype: 'Concept',
        properties: [
          { name: 'lexicalCategory', type: 'text', value: unit.conceptKind ?? 'concept' },
          { name: 'label', type: 'text', value: unit.label ?? unit.id },
          ...(unit.definition ? [{ name: 'gloss', type: 'text', value: unit.definition }] : []),
          ...(unit.senseOf ? [{ name: 'senseOf', type: 'text', value: unit.senseOf }] : [])
        ]
      };
    }
    if (unit.kind === 'argument') {
      const premiseUuids = unit.premiseRefs.map((p) => objectUuids.get(p)).filter(Boolean);
      const conclusionUuid = objectUuids.get(unit.conclusionRef) ?? null;
      return {
        prototype: 'Argument',
        properties: [
          { name: 'text', type: 'text', value: unit.warrant ?? unit.title ?? unit.id },
          { name: 'title', type: 'text', value: unit.title ?? unit.id },
          { name: 'scheme', type: 'text', value: unit.scheme ?? 'deductive' },
          { name: 'premises', type: 'text', value: JSON.stringify(premiseUuids) },
          ...(conclusionUuid ? [{ name: 'conclusion', type: 'concept_ref', value: conclusionUuid }] : [])
        ]
      };
    }
    // Domain units: keep a TruthApp category, serialise object-valued fields.
    return {
      prototype: null,
      categoryName: unit.kind,
      properties: Object.entries(unit)
        .filter(([k]) => !['id', 'kind', 'provenance', 'tags'].includes(k))
        .map(([name, value]) => ({ name, type: 'text', value: typeof value === 'string' ? value : JSON.stringify(value) }))
    };
  }

  async function putUnitRevision(unit, { commitId, snapshot }) {
    await ensurePrototypes();
    const previous = objectUuids.get(unit.id) ?? null;
    const cast = castUnit(unit, snapshot);
    const prototypeUuid = cast.prototype ? protoByName.get(cast.prototype) : null;
    const res = await client.upsert_object({
      title: unit.title ?? unit.label ?? unit.text ?? unit.id,
      ...(prototypeUuid ? { category_prototype_uuid: prototypeUuid } : { category_name: cast.categoryName ?? unit.kind, parent_category_name: 'TruthUnit' }),
      summary: unit.text ?? unit.label ?? '',
      tags: ['truth-app', unit.kind, ...(cast.prototype ? [cast.prototype] : []), ...(unit.tags ?? [])],
      properties: cast.properties,
      previous_object_uuid: previous,
      object_lineage_key: unit.id,
      provenance: { ...unit.provenance, truthCommit: commitId, truthUnit: unit.id, truthRevision: snapshot.revisions[unit.id]?.revision ?? null, castAs: cast.prototype ?? cast.categoryName ?? unit.kind },
      knowledge_kind: 'shared',
      owner_user_id: ownerUserId
    });
    const uuid = res?.uuid ?? res?.objectUuid ?? res?.object?.uuid ?? null;
    if (uuid) {
      objectUuids.set(unit.id, uuid);
      if (unit.kind === 'concept') conceptUuids.set(unit.id, unit.ksgRef || uuid);
    }

    // Ask KSG to classify what we wrote (evaluation, not a stored type).
    if (uuid && prototypeUuid && typeof client.evaluatePrototypeMatch === 'function') {
      const m = await client.evaluatePrototypeMatch({ objectRevisionUuid: uuid, prototypeRevisionUuid: prototypeUuid });
      matches.set(unit.id, { prototype: cast.prototype, decision: m?.decision ?? null });
    }

    if (unit.kind === 'argument') {
      // Keep the syllogism graph for compatibility with existing readers.
      await client.create_syllogism({
        title: unit.id,
        description: unit.title,
        premises: unit.premiseRefs.map((p) => ({ id: p, text: snapshot.units[p]?.text ?? p })),
        conclusion: { id: unit.conclusionRef, text: snapshot.units[unit.conclusionRef]?.text ?? unit.conclusionRef },
        provenance: { ...unit.provenance, truthCommit: commitId, truthUnit: unit.id }
      });
      // Query-time validity from KSG's own inference core.
      if (uuid && typeof client.evaluateLogicInference === 'function') {
        const inf = await client.evaluateLogicInference({ argumentRevisionUuid: uuid });
        inferences.set(unit.id, { decision: inf?.decision ?? 'unresolved', rule: inf?.rule ?? null });
      }
    }
    return uuid;
  }

  async function putRelationRevision(relation, { commitId }) {
    const previous = assertionIds.get(relation.id) ?? null;
    const res = await client.create_assertion({
      subject: objectUuids.get(relation.from) ?? relation.from,
      predicate: relation.operator,
      obj: relation.to === 'argument:*' ? relation.to : objectUuids.get(relation.to) ?? relation.to,
      source,
      status: relation.status,
      prev_assertion_id: previous,
      provenance: { ...relation.provenance, truthCommit: commitId, truthRelation: relation.id, targetRef: relation.targetRef ?? null, note: relation.note ?? null }
    });
    const id = res?.id ?? res?.assertion?.id ?? null;
    if (id) assertionIds.set(relation.id, id);
    return id;
  }

  /**
   * Mirror one commit: only the units and relations the patch touched, in
   * dependency order (concepts and claims before the arguments that reference
   * them, relations last) so a cast can point at uuids that already exist.
   */
  async function mirrorCommit({ commit, patch, snapshot, project }) {
    await ensurePrototypes();
    const touched = new Set();
    for (const op of patch.operations) touched.add(op.unit?.id ?? op.relation?.id ?? op.target?.id);
    const written = { units: 0, relations: 0 };
    const ordered = [...touched].sort((a, b) => {
      const ra = KIND_ORDER[snapshot.units[a]?.kind] ?? (snapshot.relations[a] ? 99 : 50);
      const rb = KIND_ORDER[snapshot.units[b]?.kind] ?? (snapshot.relations[b] ? 99 : 50);
      return ra - rb || a.localeCompare(b);
    });
    for (const id of ordered) {
      if (snapshot.units[id]) {
        await putUnitRevision(snapshot.units[id], { commitId: commit.id, snapshot });
        written.units += 1;
      } else if (snapshot.relations[id]) {
        await putRelationRevision(snapshot.relations[id], { commitId: commit.id });
        written.relations += 1;
      }
    }
    await client.create_assertion({
      subject: commit.id,
      predicate: 'commits',
      obj: project?.id ?? 'repo:local',
      source,
      prev_assertion_id: commit.parentRefs[0] ?? null,
      provenance: { ...commit.provenance, message: commit.message, snapshotHash: commit.snapshotHash, patchHash: commit.patchHash, branch: commit.branch }
    });
    return written;
  }

  /** Per-claim formalisation status and per-argument KSG inference, for the report. */
  function formalizationReport(snapshot) {
    const claims = Object.values(snapshot.units).filter((u) => u.kind === 'claim');
    const out = { propositions: 0, claims: 0, utterances: 0, unresolvedSymbols: [], arguments: {} };
    for (const c of claims) {
      const m = matches.get(c.id);
      if (m?.prototype === 'Proposition') out.propositions += 1;
      else if (m?.prototype === 'Claim') out.claims += 1;
      else out.utterances += 1;
      for (const t of termStatuses(c)) {
        if (t.status !== 'resolved') out.unresolvedSymbols.push({ claim: c.id, symbol: t.symbol, status: t.status });
      }
    }
    for (const [id, inf] of inferences) out.arguments[id] = inf;
    return out;
  }

  async function connect(expected = {}) {
    if (typeof client.connect !== 'function') return { ok: true, skipped: true };
    const manifest = await client.connect(expected);
    return { ok: true, manifest };
  }

  return { putUnitRevision, putRelationRevision, mirrorCommit, connect, ensurePrototypes, formalizationReport, objectUuids, conceptUuids, assertionIds, matches, inferences };
}

/**
 * The ten prototypes `POST /api2.0/seed/logic-ir-primitives` seeds, in the
 * order the server reports them.
 */
export const LOGIC_IR_PRIMITIVES = ['Concept', 'Utterance', 'Proposition', 'Claim', 'Premise', 'Conclusion', 'Inference', 'Argument', 'Rule', 'Derivation'];

/** An upserted object's properties as a plain name -> value map. */
export const propMap = (o) => Object.fromEntries((o?.properties ?? []).map((p) => [p.name, p.value]));

/**
 * KSG's prototype-match contract, as `prototype_match_service.js` evaluates it.
 * Exported so the in-process fake and the HTTP contract server
 * (`scripts/ksg-contract-server.mjs`) decide identically — one contract, not
 * two copies that drift.
 */
export function matchDecision(obj, protoName) {
  const p = propMap(obj);
  if (protoName === 'Proposition' || protoName === 'Premise' || protoName === 'Conclusion') {
    const hasExpr = Boolean(p.semanticExpression || p.logicIr);
    const hasTruth = Boolean(p.truthConditions && p.truthConditions !== '[]');
    const resolved = !p.unresolvedMaterialSymbols || p.unresolvedMaterialSymbols === '[]';
    const wellFormed = p.structurallyWellFormed === 'true' || (p.logicIr && p.logicIr.includes('"kind"'));
    return hasExpr && hasTruth && resolved && wellFormed ? 'match' : 'no_match';
  }
  if (protoName === 'Claim') return p.subject && p.predicate && p.object ? 'match' : 'no_match';
  if (protoName === 'Argument') return p.premises && p.conclusion ? 'match' : 'no_match';
  if (protoName === 'Concept') return p.lexicalCategory ? 'match' : 'no_match';
  if (protoName === 'Utterance') return p.text ? 'match' : 'no_match';
  return 'no_match';
}

/**
 * Deterministic fake transport for tests and offline demos. Models the Logic
 * IR surfaces faithfully: prototype matches check the same contracts KSG's
 * matcher does, and evaluateLogicInference runs the mirrored inference core
 * over the objects' stored logicIr, so an offline round-trip decides what the
 * real server would.
 */
export function createFakeKsgClient({ release = 'v0.2.20' } = {}) {
  const calls = [];
  let n = 0;
  const next = (prefix) => `${prefix}-${String(++n).padStart(4, '0')}`;
  const PRIMS = LOGIC_IR_PRIMITIVES;
  const protoUuidByName = new Map();
  const nameByProtoUuid = new Map();
  const objects = new Map();

  return {
    calls, objects, assertions: [], syllogisms: [], protoUuidByName, seeded: false,
    async connect(expected = {}) {
      calls.push(['connect', expected]);
      if (expected.expected_release && expected.expected_release !== release) {
        throw new Error(`release contract mismatch: expected ${expected.expected_release}, server ${release}`);
      }
      return { release, channel: 'release', surfaces: { clientContract: 'stub' } };
    },
    async seed_logic_ir_primitives() {
      calls.push(['seed_logic_ir_primitives', {}]);
      this.seeded = true;
      const categories = PRIMS.map((name) => {
        if (!protoUuidByName.has(name)) {
          const uuid = `proto-${name.toLowerCase()}`;
          protoUuidByName.set(name, uuid);
          nameByProtoUuid.set(uuid, name);
        }
        return { name, categoryPrototypeUuid: protoUuidByName.get(name) };
      });
      return { ok: true, report: { categories } };
    },
    async upsert_object(args) {
      calls.push(['upsert_object', args]);
      const uuid = next('obj');
      objects.set(uuid, { uuid, ...args });
      return { uuid, objectUuid: uuid, previousObjectUuid: args.previous_object_uuid ?? null };
    },
    async evaluatePrototypeMatch({ objectRevisionUuid, prototypeRevisionUuid }) {
      calls.push(['evaluatePrototypeMatch', { objectRevisionUuid, prototypeRevisionUuid }]);
      const obj = objects.get(objectRevisionUuid);
      const protoName = nameByProtoUuid.get(prototypeRevisionUuid) ?? null;
      return { decision: obj && protoName ? matchDecision(obj, protoName) : 'no_match', prototype: protoName };
    },
    async evaluateLogicInference({ argumentRevisionUuid, premiseRevisionUuids = [], conclusionRevisionUuid = null }) {
      calls.push(['evaluateLogicInference', { argumentRevisionUuid, premiseRevisionUuids, conclusionRevisionUuid }]);
      const { inferArgument } = await import('../logic/infer.mjs');
      const parse = (uuid) => {
        const obj = objects.get(uuid);
        const p = propMap(obj ?? {});
        let ir = null;
        try { ir = p.logicIr ? JSON.parse(p.logicIr) : null; } catch { ir = null; }
        let bindings = [];
        try { bindings = p.semanticBindings ? JSON.parse(p.semanticBindings) : []; } catch { bindings = []; }
        return { uuid, ir, bindings };
      };
      let premiseUuids = premiseRevisionUuids;
      let conclusionUuid = conclusionRevisionUuid;
      if (argumentRevisionUuid) {
        const arg = objects.get(argumentRevisionUuid);
        const p = propMap(arg ?? {});
        try { premiseUuids = p.premises ? JSON.parse(p.premises) : []; } catch { premiseUuids = []; }
        conclusionUuid = p.conclusion ?? null;
      }
      if (!conclusionUuid || !premiseUuids.length) return { decision: 'unresolved', rule: null };
      return inferArgument({ premises: premiseUuids.map(parse), conclusion: parse(conclusionUuid) });
    },
    async create_assertion(args) {
      calls.push(['create_assertion', args]);
      const id = next('asr');
      this.assertions.push({ id, ...args });
      return { id };
    },
    async create_syllogism(args) {
      calls.push(['create_syllogism', args]);
      const uuid = next('syl');
      this.syllogisms.push({ uuid, ...args });
      return { uuid };
    }
  };
}

/**
 * Build a real client from the environment. Imported lazily so the app runs
 * with no KSG dependency installed (fixtures and evaluation are offline).
 */
export async function createKsgClientFromEnv(env = process.env) {
  const mod = await import('@lehelkovach/knowshowgo-client');
  const { KnowShowGoClient } = mod;
  return new KnowShowGoClient({
    baseUrl: env.KSG_API_URL || undefined,
    defaultOwnerUserId: env.KSG_OWNER || 'truth-app',
    authToken: env.KSG_API_TOKEN || undefined
  });
}
