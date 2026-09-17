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
  const support = client.assertions.find((a) => a.predicate === 'supports' && a.obj === 'claim:C1');
  assert.equal(support.subject, 'evidence:E1');
  assert.equal(support.provenance.truthRelation, 'rel:E1-supports-C1');
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
