import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFakeKsgClient, createKsgAdapter } from '../src/adapters/ksg.mjs';
import { loadFixture } from '../src/adapters/local-fixture-store.mjs';
import { fixture } from './helpers.mjs';

test('KSG-001 units round-trip through the adapter keeping stable identity', async () => {
  const client = createFakeKsgClient();
  const ksg = createKsgAdapter({ client });
  const { commits } = await loadFixture(fixture('exercise-depression'), { ksg });
  assert.equal(commits.length, 2);
  const h1 = [...client.objects.values()].find((o) => o.object_lineage_key === 'hypothesis:H1');
  assert.ok(h1);
  assert.equal(h1.category_name, 'hypothesis');
  assert.equal(h1.provenance.truthUnit, 'hypothesis:H1');
  assert.equal(h1.provenance.truthCommit, commits[0].id);
  const syll = client.syllogisms.find((s) => s.title === 'argument:A1');
  assert.deepEqual(syll.premises.map((p) => p.id), ['claim:C1', 'claim:C2']);
  const commitAssertions = client.assertions.filter((a) => a.predicate === 'commits');
  assert.equal(commitAssertions.length, 2);
  assert.equal(commitAssertions[1].prev_assertion_id, commits[0].id);
});

test('KSG-002 a revised unit links to its previous KSG object; relation revisions chain', async () => {
  const client = createFakeKsgClient();
  const ksg = createKsgAdapter({ client });
  await loadFixture(fixture('exercise-depression'), { ksg });
  const h1s = [...client.objects.values()].filter((o) => o.object_lineage_key === 'hypothesis:H1');
  assert.equal(h1s.length, 2);
  assert.equal(h1s[0].previous_object_uuid, null);
  assert.equal(h1s[1].previous_object_uuid, h1s[0].uuid);
  assert.equal(h1s[1].provenance.truthRevision, 2);
  assert.equal(ksg.objectUuids.get('hypothesis:H1'), h1s[1].uuid);
  // Relations now point at the KSG object uuids, not the local ids.
  const support = client.assertions.find((a) => a.provenance?.truthRelation === 'rel:E1-supports-C1');
  assert.equal(support.subject, ksg.objectUuids.get('evidence:E1'));
  assert.equal(support.obj, ksg.objectUuids.get('claim:C1'));
  assert.equal(support.predicate, 'supports');
});

test('KSG-003 release contract mismatch fails closed', async () => {
  const client = createFakeKsgClient({ release: 'v0.2.20' });
  const ksg = createKsgAdapter({ client });
  await assert.rejects(ksg.connect({ expected_release: 'v9.9.9' }), /release contract mismatch/);
  const ok = await ksg.connect({ expected_release: 'v0.2.20' });
  assert.equal(ok.ok, true);
});

test('adapter only mirrors the units a commit touched', async () => {
  const client = createFakeKsgClient();
  const ksg = createKsgAdapter({ client });
  const { commits } = await loadFixture(fixture('ai-risk'), { ksg });
  const second = [...client.objects.values()].filter((o) => o.provenance.truthCommit === commits[1].id).map((o) => o.object_lineage_key).sort();
  assert.deepEqual(second, ['argument:A15', 'argument:B3', 'claim:R5', 'claim:R5c']);
});

test('units are mirrored in dependency order: sources and claims before arguments, relations last', async () => {
  const client = createFakeKsgClient();
  const ksg = createKsgAdapter({ client });
  await loadFixture(fixture('exercise-depression'), { ksg });
  const order = client.calls.map(([name, args]) => name === 'upsert_object' ? args.object_lineage_key : name === 'create_assertion' ? `rel:${args.predicate}` : null).filter(Boolean);
  const idx = (id) => order.indexOf(id);
  assert.ok(idx('source:S1') < idx('claim:C1'), 'source before claim');
  assert.ok(idx('claim:C1') < idx('argument:A1'), 'claim before argument');
  assert.ok(idx('argument:A1') < idx('rel:supports'), 'units before relations');
  assert.ok(idx('claim:C4') < idx('argument:L1'), 'second commit keeps the order');
});

test('T1 the adapter seeds the Logic IR prototypes once and casts to them, never an ad-hoc category for logic units', async () => {
  const client = createFakeKsgClient();
  const ksg = createKsgAdapter({ client });
  await loadFixture(fixture('hermione'), { ksg });
  assert.equal(client.calls.filter((c) => c[0] === 'seed_logic_ir_primitives').length, 1, 'seeded exactly once');
  const byLineage = (id) => [...client.objects.values()].find((o) => o.object_lineage_key === id);
  // Concepts, claims and arguments carry a prototype uuid, not category_name.
  for (const id of ['concept:mammal', 'claim:C1', 'argument:A1']) {
    assert.ok(byLineage(id).category_prototype_uuid, `${id} cast to a prototype`);
    assert.equal(byLineage(id).category_name, undefined, `${id} has no ad-hoc category`);
  }
});

test('T2 a claim with resolved Logic IR casts to Proposition and matches; a claim with an unresolved term is an Utterance and does not match', async () => {
  const client = createFakeKsgClient();
  const ksg = createKsgAdapter({ client });
  const { store, commits } = await loadFixture(fixture('hermione'), { ksg });
  assert.equal(ksg.matches.get('claim:C1').prototype, 'Proposition');
  assert.equal(ksg.matches.get('claim:C1').decision, 'match');
  assert.equal(ksg.matches.get('claim:C6').prototype, 'Utterance', 'Crookshanks is unresolved');
  const rep = ksg.formalizationReport(store.getSnapshot(commits.at(-1).id));
  assert.equal(rep.propositions >= 4, true);
  assert.ok(rep.unresolvedSymbols.some((u) => u.claim === 'claim:C6' && /Crookshanks/i.test(u.symbol)));
});

test('T2/T5 local concept refs in logicIr are remapped to KSG object uuids', async () => {
  const client = createFakeKsgClient();
  const ksg = createKsgAdapter({ client });
  await loadFixture(fixture('hermione'), { ksg });
  const c1 = [...client.objects.values()].find((o) => o.object_lineage_key === 'claim:C1');
  const p = Object.fromEntries(c1.properties.map((x) => [x.name, x.value]));
  const ir = JSON.parse(p.logicIr);
  const mammalUuid = ksg.conceptUuids.get('concept:mammal');
  assert.ok(mammalUuid);
  assert.match(p.logicIr, new RegExp(mammalUuid));
  assert.ok(!p.logicIr.includes('concept:mammal'), 'no local concept id leaks into the pushed IR');
  assert.equal(ir.body.if.predicate.uuid, mammalUuid);
});

test('T4 arguments over resolved propositions come back valid from KSG inference; arguments without IR come back unresolved, never invalid', async () => {
  const client = createFakeKsgClient();
  const ksg = createKsgAdapter({ client });
  await loadFixture(fixture('hermione'), { ksg });
  // On the repair branch head, A2 (C2 + C7 => C5) is a genuine syllogism.
  assert.equal(ksg.inferences.get('argument:A1').decision, 'valid');
  assert.equal(ksg.inferences.get('argument:A1').rule, 'universal_modus_ponens');

  const client2 = createFakeKsgClient();
  const ksg2 = createKsgAdapter({ client: client2 });
  await loadFixture(fixture('ai-risk'), { ksg: ksg2 });
  for (const [, inf] of ksg2.inferences) assert.equal(inf.decision, 'unresolved', 'no IR → unresolved, never invalid');
  assert.ok(ksg2.inferences.size >= 28);
});

test('T4 a not-entailed argument over resolved propositions is invalid, not valid', async () => {
  // main@2 of hermione: A2 is C1 + C2 => C5 (has fur does not follow).
  const client = createFakeKsgClient();
  const ksg = createKsgAdapter({ client });
  const { store } = await loadFixture(fixture('hermione'), { ksg, upTo: 2 });
  // Re-mirror just main so objectUuids reflect the un-repaired A2.
  const inf = await client.evaluateLogicInference({ argumentRevisionUuid: ksg.objectUuids.get('argument:A2') });
  assert.equal(inf.decision, 'invalid');
  assert.equal(store.getSnapshot('main').units['argument:A2'].premiseRefs.join(','), 'claim:C1,claim:C2');
});
