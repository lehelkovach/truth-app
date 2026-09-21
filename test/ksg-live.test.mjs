/**
 * The live push path, over real HTTP.
 *
 * Every other KSG test swaps the *client* for `createFakeKsgClient`, which
 * means the code `truth ksg-push --live` actually runs — building a
 * `KnowShowGoClient` from the environment, resolving the base URL, attaching
 * the bearer token, serialising bodies, reading status codes and parsing
 * responses — has never executed under test. These tests swap the *server*
 * instead (`scripts/ksg-contract-server.mjs`), so that whole path runs for
 * real against the v0.2.20 contract.
 *
 * What is still unverified after these pass: that a production KSG deployment
 * answers these routes the way the contract server does. That needs a
 * reachable host and a token. See docs/KSG-LOGIC-IR-STATUS.md.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { createKsgContractServer } from '../scripts/ksg-contract-server.mjs';
import { createFakeKsgClient, createKsgAdapter, createKsgClientFromEnv, propMap } from '../src/adapters/ksg.mjs';
import { loadFixture } from '../src/adapters/local-fixture-store.mjs';
import { root, fixture } from './helpers.mjs';

const cli = join(root, 'src', 'cli.mjs');
const TOKEN = 'live-contract-token';

/**
 * Always spawn the CLI asynchronously. `execFileSync` blocks this process's
 * event loop, so the contract server running in it could never answer the
 * child — the push would hang until the client's 30s timeout.
 */
const runCli = promisify(execFile);

/**
 * Push a fixture through a real client pointed at a contract server. The
 * caller closes the server on success; a failure closes it here, because a
 * listening server left open keeps the event loop alive and would hang the
 * runner instead of reporting the failure.
 */
async function pushLive(name, { requireToken = TOKEN, env = {}, expected = {} } = {}) {
  const server = createKsgContractServer({ requireToken });
  const baseUrl = await server.listen();
  try {
    const client = await createKsgClientFromEnv({ KSG_API_URL: baseUrl, KSG_API_TOKEN: requireToken ?? undefined, ...env });
    const ksg = createKsgAdapter({ client });
    await ksg.connect(expected);
    const { store, commits } = await loadFixture(fixture(name), { ksg });
    const report = ksg.formalizationReport(store.getSnapshot(commits.at(-1).id));
    return { server, baseUrl, ksg, commits, report };
  } catch (err) {
    await server.close();
    throw err;
  }
}

/** The same fixture through the in-process fake, for parity comparison. */
async function pushOffline(name) {
  const ksg = createKsgAdapter({ client: createFakeKsgClient() });
  await ksg.connect({});
  const { store, commits } = await loadFixture(fixture(name), { ksg });
  return { ksg, commits, report: ksg.formalizationReport(store.getSnapshot(commits.at(-1).id)) };
}

test('LIVE-001 a real client over HTTP decides exactly what the offline fake decides', async () => {
  const live = await pushLive('hermione');
  try {
    const offline = await pushOffline('hermione');

    assert.equal(live.commits.length, offline.commits.length);
    assert.equal(live.ksg.objectUuids.size, offline.ksg.objectUuids.size);
    assert.deepEqual(
      { p: live.report.propositions, c: live.report.claims, u: live.report.utterances },
      { p: offline.report.propositions, c: offline.report.claims, u: offline.report.utterances }
    );
    assert.equal(live.report.propositions, 4, 'hermione formalises four propositions');

    // Prototype decisions and inference verdicts, unit by unit — not just counts.
    const decisions = (a) => [...a.matches].map(([id, m]) => `${id}=${m.prototype}:${m.decision}`).sort();
    assert.deepEqual(decisions(live.ksg), decisions(offline.ksg));
    const verdicts = (a) => [...a.inferences].map(([id, i]) => `${id}=${i.decision}/${i.rule}`).sort();
    assert.deepEqual(verdicts(live.ksg), verdicts(offline.ksg));
    assert.ok(verdicts(live.ksg).includes('argument:A1=valid/universal_modus_ponens'));

    assert.deepEqual(live.report.unresolvedSymbols, offline.report.unresolvedSymbols);
  } finally {
    await live.server.close();
  }
});

test('LIVE-002 every request carries the bearer token and hits a contracted route', async () => {
  const live = await pushLive('hermione');
  try {
    const { requests } = live.server;
    assert.ok(requests.length > 20, 'the push made real requests');

    const unauthed = requests.filter((r) => r.path !== '/api/release' && r.authorization !== `Bearer ${TOKEN}`);
    assert.deepEqual(unauthed, [], 'KSG_API_TOKEN reaches the server on every call');

    // A client upgrade that moves an endpoint fails here rather than in production.
    const served = new Set(['/health', '/api/release', '/api2.0/seed/logic-ir-primitives', '/api/objects/upsert', '/api2.0/prototype-matches/evaluate', '/api2.0/logic-ir/infer', '/api/assertions', '/api/logic/syllogisms']);
    const offContract = [...new Set(requests.map((r) => r.path))].filter((p) => !served.has(p));
    assert.deepEqual(offContract, [], 'no request went to an endpoint outside the v0.2.20 contract');

    // Seeding is once per push, not once per object.
    assert.equal(requests.filter((r) => r.path === '/api2.0/seed/logic-ir-primitives').length, 1);
  } finally {
    await live.server.close();
  }
});

test('LIVE-003 what crosses the wire is grounded: KSG uuids in the IR, lineage and provenance intact', async () => {
  const live = await pushLive('hermione');
  try {
    const revisions = live.server.byLineage('claim:C1');
    assert.ok(revisions.length >= 1, 'claim:C1 was written under its lineage key');
    const props = propMap(revisions.at(-1));
    const mammalUuid = live.ksg.conceptUuids.get('concept:mammal');

    assert.ok(mammalUuid, 'the concept got a server-assigned uuid');
    assert.match(props.logicIr, new RegExp(mammalUuid), 'the pushed IR is grounded in that uuid');
    assert.ok(!props.logicIr.includes('concept:mammal'), 'no local concept id leaked over the wire');

    // Server-assigned uuids, not ids the adapter invented.
    assert.match(mammalUuid, /^[0-9a-f]{8}-0000-4000-8000-\d{12}$/);

    const body = revisions.at(-1);
    assert.equal(body.provenance.truthUnit, 'claim:C1');
    assert.equal(body.knowledgeKind, 'shared');
    assert.ok(body.tags.includes('truth-app'));

    // A revised unit chains to its previous revision across the wire.
    const chained = [...live.server.objects.values()].filter((o) => o.previousObjectUuid);
    assert.ok(chained.length >= 1, 'at least one revision links to its predecessor');
    for (const o of chained) assert.ok(live.server.objects.has(o.previousObjectUuid), 'the predecessor uuid is one the server issued');
  } finally {
    await live.server.close();
  }
});

test('LIVE-004 the release handshake fails closed over HTTP, before anything is written', async () => {
  const server = createKsgContractServer({ requireToken: TOKEN, release: 'v0.2.20' });
  const baseUrl = await server.listen();
  try {
    const client = await createKsgClientFromEnv({ KSG_API_URL: baseUrl, KSG_API_TOKEN: TOKEN });
    const ksg = createKsgAdapter({ client });
    await assert.rejects(ksg.connect({ expected_release: 'v9.9.9' }), /expected release v9\.9\.9, got v0\.2\.20/);
    assert.equal(server.objects.size, 0, 'a refused handshake writes nothing');
    assert.deepEqual(await ksg.connect({ expected_release: 'v0.2.20' }).then((r) => r.ok), true);
  } finally {
    await server.close();
  }
});

test('LIVE-005 a rejected token surfaces as an error rather than a silent no-op', async () => {
  const server = createKsgContractServer({ requireToken: TOKEN });
  const baseUrl = await server.listen();
  try {
    const client = await createKsgClientFromEnv({ KSG_API_URL: baseUrl, KSG_API_TOKEN: 'wrong-token' });
    const ksg = createKsgAdapter({ client });
    await ksg.connect({}); // /api/release is open, so the handshake succeeds
    await assert.rejects(loadFixture(fixture('hermione'), { ksg }), /missing or invalid bearer token/);
    assert.equal(server.objects.size, 0, 'nothing was stored under a bad token');
  } finally {
    await server.close();
  }
});

test('LIVE-006 truth ksg-push --live reports the same push the offline run reports', async () => {
  const server = createKsgContractServer({ requireToken: TOKEN });
  const baseUrl = await server.listen();
  try {
    const env = { ...process.env, KSG_API_URL: baseUrl, KSG_API_TOKEN: TOKEN };
    const { stdout: live } = await runCli('node', [cli, 'ksg-push', fixture('hermione'), '--live', '--expect-release', 'v0.2.20'], { env });
    const { stdout: offline } = await runCli('node', [cli, 'ksg-push', fixture('hermione')]);

    assert.match(live, /^pushed: 2 commits, 14 objects, 0 relation assertions$/m);
    assert.ok(!/no --live/.test(live), 'the offline notice is gone');
    assert.match(live, /cast: 4 Proposition, 0 Claim, 1 Utterance/);
    assert.match(live, /KSG inference: 2 valid/);

    // Same numbers, whichever side is faked.
    const numbers = (s) => s.split('\n').filter((l) => /cast:|KSG inference:|unresolved terms:/.test(l)).join('\n');
    assert.equal(numbers(live), numbers(offline));
    assert.ok(server.objects.size >= 14, 'the objects really landed on the server');
  } finally {
    await server.close();
  }
});

test('LIVE-007 truth ksg-push --live exits non-zero when the server refuses the release', async () => {
  const server = createKsgContractServer({ requireToken: TOKEN, release: 'v0.2.19' });
  const baseUrl = await server.listen();
  try {
    const env = { ...process.env, KSG_API_URL: baseUrl, KSG_API_TOKEN: TOKEN };
    await assert.rejects(
      runCli('node', [cli, 'ksg-push', fixture('hermione'), '--live', '--expect-release', 'v0.2.20'], { env }),
      (err) => err.code === 1 && /expected release v0\.2\.20, got v0\.2\.19/.test(err.stderr)
    );
    assert.equal(server.objects.size, 0);
  } finally {
    await server.close();
  }
});

test('LIVE-008 the prototype-match contract holds over HTTP: each hard constraint is load-bearing', async () => {
  // Parity with the offline fake cannot catch a weakened contract, because
  // both sides share `matchDecision`. So assert the decisions absolutely,
  // against objects built to violate one constraint at a time.
  const server = createKsgContractServer({ requireToken: null });
  const baseUrl = await server.listen();
  try {
    const client = await createKsgClientFromEnv({ KSG_API_URL: baseUrl });
    await client.connect({});
    const { report } = await client.seed_logic_ir_primitives();
    const proto = Object.fromEntries(report.categories.map((c) => [c.name, c.categoryPrototypeUuid]));

    const ir = JSON.stringify({ kind: 'Predicate', predicate: { kind: 'ConceptRef', uuid: 'u-1' }, args: [] });
    const complete = [
      { name: 'logicIr', type: 'text', value: ir },
      { name: 'truthConditions', type: 'text', value: '["t"]' },
      { name: 'unresolvedMaterialSymbols', type: 'text', value: '[]' },
      { name: 'structurallyWellFormed', type: 'text', value: 'true' }
    ];
    const without = (name) => complete.filter((p) => p.name !== name);
    const decide = async (properties, prototype = 'Proposition') => {
      const { objectUuid } = await client.upsert_object({ title: 't', category_prototype_uuid: proto[prototype], properties });
      const res = await client.evaluatePrototypeMatch({ objectRevisionUuid: objectUuid, prototypeRevisionUuid: proto[prototype] });
      return res.decision;
    };

    assert.equal(await decide(complete), 'match', 'all four hard constraints satisfied');
    assert.equal(await decide(without('logicIr')), 'no_match', 'has_semantic_expression is load-bearing');
    assert.equal(await decide(without('truthConditions')), 'no_match', 'has_truth_conditions is load-bearing');
    assert.equal(await decide(without('structurallyWellFormed').map((p) => (p.name === 'logicIr' ? { ...p, value: 'not json' } : p))), 'no_match', 'structurally_well_formed is load-bearing');
    assert.equal(
      await decide(complete.map((p) => (p.name === 'unresolvedMaterialSymbols' ? { ...p, value: '["God"]' } : p))),
      'no_match',
      'an unresolved material symbol must block Proposition (E001)'
    );

    // Unknown ids are refused, not silently matched.
    await assert.rejects(client.evaluatePrototypeMatch({ objectRevisionUuid: 'nope', prototypeRevisionUuid: proto.Proposition }), /no such object revision/);
  } finally {
    await server.close();
  }
});

test('RELEASE-001 the pinned client still exposes every surface the adapter calls', async () => {
  // The package's `exports` map hides ./package.json, so read it off disk.
  const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));
  const pkg = readJson(join(root, 'node_modules', '@lehelkovach', 'knowshowgo-client', 'package.json'));
  const { KnowShowGoClient } = await import('@lehelkovach/knowshowgo-client');

  // The pin in package.json is the contract the adapter was written against.
  const pinned = readJson(join(root, 'package.json')).dependencies['@lehelkovach/knowshowgo-client'];
  assert.match(pinned, /#v0\.2\.20-client$/, 'the client pin moved — re-run this suite against the new release');
  assert.equal(pkg.version, '0.2.20', 'installed client is the pinned release');

  for (const method of ['connect', 'seed_logic_ir_primitives', 'upsert_object', 'evaluatePrototypeMatch', 'evaluateLogicInference', 'create_assertion', 'create_syllogism']) {
    assert.equal(typeof KnowShowGoClient.prototype[method], 'function', `client is missing ${method}`);
  }
});
