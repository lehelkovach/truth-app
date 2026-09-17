/**
 * The single KnowShowGo boundary. Everything TruthApp writes to KSG goes
 * through `createKsgAdapter({ client })`, where `client` is a
 * `KnowShowGoClient` from `@lehelkovach/knowshowgo-client` (or the fake
 * below). No raw HTTP here and none anywhere else in the app.
 *
 * Mapping (generic surfaces only, no domain endpoints):
 *   unit      -> upsert_object   (category_name = unit.kind, lineage key = unit id,
 *                                 previous_object_uuid = last mirrored revision)
 *   relation  -> create_assertion(subject=from, predicate=operator, obj=to,
 *                                 prev_assertion_id = last mirrored revision)
 *   argument  -> create_syllogism(premises, conclusion) in addition to its object
 *   commit    -> create_assertion(subject=commit id, predicate='commits', obj=project)
 */

/** Write order: things referenced before things that reference them. */
const KIND_ORDER = { actor: 0, source: 1, issue: 2, position: 3, evidence: 4, claim: 5, assumption: 5, hypothesis: 6, theory: 7, argument: 8, annotation: 9 };

export function createKsgAdapter({ client, source = 'truth-app', ownerUserId = null }) {
  if (!client) throw new TypeError('createKsgAdapter needs a client');
  const objectUuids = new Map(); // unit id -> last KSG object uuid
  const assertionIds = new Map(); // relation id -> last KSG assertion id

  async function putUnitRevision(unit, { commitId, snapshot }) {
    const previous = objectUuids.get(unit.id) ?? null;
    const res = await client.upsert_object({
      title: unit.title ?? unit.text ?? unit.id,
      category_name: unit.kind,
      parent_category_name: 'TruthUnit',
      summary: unit.text ?? '',
      tags: ['truth-app', unit.kind, ...(unit.tags ?? [])],
      properties: Object.entries(unit)
        .filter(([k]) => !['id', 'kind', 'provenance', 'tags'].includes(k))
        .map(([name, value]) => ({ name, value: typeof value === 'string' ? value : JSON.stringify(value) })),
      previous_object_uuid: previous,
      object_lineage_key: unit.id,
      provenance: { ...unit.provenance, truthCommit: commitId, truthUnit: unit.id, truthRevision: snapshot.revisions[unit.id]?.revision ?? null },
      knowledge_kind: 'shared',
      owner_user_id: ownerUserId
    });
    const uuid = res?.uuid ?? res?.object?.uuid ?? null;
    if (uuid) objectUuids.set(unit.id, uuid);
    if (unit.kind === 'argument') {
      await client.create_syllogism({
        title: unit.id,
        description: unit.title,
        premises: unit.premiseRefs.map((p) => ({ id: p, text: snapshot.units[p]?.text ?? p })),
        conclusion: { id: unit.conclusionRef, text: snapshot.units[unit.conclusionRef]?.text ?? unit.conclusionRef },
        provenance: { ...unit.provenance, truthCommit: commitId, truthUnit: unit.id }
      });
    }
    return uuid;
  }

  async function putRelationRevision(relation, { commitId }) {
    const previous = assertionIds.get(relation.id) ?? null;
    const res = await client.create_assertion({
      subject: relation.from,
      predicate: relation.operator,
      obj: relation.to,
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
   * dependency order (sources and claims before the arguments that reference
   * them, relations last) so a later cast to KSG prototypes can point at
   * uuids that already exist.
   */
  async function mirrorCommit({ commit, patch, snapshot, project }) {
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

  async function connect(expected = {}) {
    if (typeof client.connect !== 'function') return { ok: true, skipped: true };
    const manifest = await client.connect(expected);
    return { ok: true, manifest };
  }

  return { putUnitRevision, putRelationRevision, mirrorCommit, connect, objectUuids, assertionIds };
}

/**
 * Deterministic fake transport for tests and offline demos. Records every
 * call and hands back stable ids, so round-trip tests need no server.
 */
export function createFakeKsgClient({ release = 'v0.2.20' } = {}) {
  const calls = [];
  let n = 0;
  const next = (prefix) => `${prefix}-${String(++n).padStart(4, '0')}`;
  return {
    calls,
    objects: new Map(),
    assertions: [],
    syllogisms: [],
    async connect(expected = {}) {
      calls.push(['connect', expected]);
      if (expected.expected_release && expected.expected_release !== release) {
        throw new Error(`release contract mismatch: expected ${expected.expected_release}, server ${release}`);
      }
      return { release, channel: 'release', surfaces: { clientContract: 'stub' } };
    },
    async upsert_object(args) {
      calls.push(['upsert_object', args]);
      const uuid = next('obj');
      this.objects.set(uuid, { uuid, ...args });
      return { uuid, previousObjectUuid: args.previous_object_uuid ?? null };
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
