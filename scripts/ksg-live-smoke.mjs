#!/usr/bin/env node
/**
 * Release-contract smoke for the live push path.
 *
 * One command, two targets:
 *
 *   npm run ksg:smoke
 *       boots scripts/ksg-contract-server.mjs and pushes at it. Hermetic, so
 *       CI runs it on every push. Verifies the whole client/HTTP path.
 *
 *   KSG_API_URL=https://api.knowshowgo.com KSG_API_TOKEN=... npm run ksg:smoke
 *       runs the identical checks against a real KnowShowGo deployment. This
 *       is the production verification; it WRITES the hermione fixture.
 *
 * Same assertions either way, so "it passed against the contract server" and
 * "it passed against prod" mean the same thing.
 */

import assert from 'node:assert/strict';
import { createKsgContractServer } from './ksg-contract-server.mjs';
import { createKsgAdapter, createKsgClientFromEnv } from '../src/adapters/ksg.mjs';
import { loadFixture } from '../src/adapters/local-fixture-store.mjs';

const FIXTURE = new URL('../fixtures/hermione', import.meta.url).pathname;
const EXPECT = { commits: 2, objects: 14, propositions: 4, claims: 0, utterances: 1, validInferences: 2 };

async function main() {
  const external = Boolean(process.env.KSG_API_URL);
  const stub = external ? null : createKsgContractServer({ requireToken: 'smoke-token' });
  const baseUrl = external ? process.env.KSG_API_URL : await stub.listen();
  const token = external ? process.env.KSG_API_TOKEN : 'smoke-token';

  if (external && !token) throw new Error('KSG_API_URL is set but KSG_API_TOKEN is not');
  console.log(external ? `target: ${baseUrl} (real deployment — this writes)` : `target: ${baseUrl} (contract server, in-process)`);

  try {
    const client = await createKsgClientFromEnv({ KSG_API_URL: baseUrl, KSG_API_TOKEN: token });
    const ksg = createKsgAdapter({ client });

    const { manifest } = await ksg.connect(process.env.KSG_EXPECT_RELEASE ? { expected_release: process.env.KSG_EXPECT_RELEASE } : {});
    console.log(`ok  release handshake      ${manifest?.release ?? 'n/a'} (${manifest?.channel ?? 'n/a'})`);

    const protos = await ksg.ensurePrototypes();
    assert.ok(protos.get('Proposition'), 'server seeded a Proposition prototype');
    console.log(`ok  logic-ir primitives    ${protos.size} prototypes seeded`);

    const { store, commits } = await loadFixture(FIXTURE, { ksg });
    assert.equal(commits.length, EXPECT.commits);
    assert.equal(ksg.objectUuids.size, EXPECT.objects);
    console.log(`ok  push                   ${commits.length} commits, ${ksg.objectUuids.size} objects`);

    const rep = ksg.formalizationReport(store.getSnapshot(commits.at(-1).id));
    assert.equal(rep.propositions, EXPECT.propositions, 'propositions');
    assert.equal(rep.claims, EXPECT.claims, 'claims');
    assert.equal(rep.utterances, EXPECT.utterances, 'utterances');
    console.log(`ok  prototype casts        ${rep.propositions} Proposition, ${rep.claims} Claim, ${rep.utterances} Utterance`);

    const valid = [...ksg.inferences.values()].filter((i) => i.decision === 'valid');
    assert.equal(valid.length, EXPECT.validInferences, 'valid inferences');
    assert.equal(ksg.inferences.get('argument:A1')?.rule, 'universal_modus_ponens');
    console.log(`ok  inference              ${valid.length} valid (A1 by universal_modus_ponens)`);

    assert.ok(rep.unresolvedSymbols.some((u) => /Crookshanks/i.test(u.symbol)), 'the unresolved term is reported, not hidden');
    console.log(`ok  unresolved reported    ${rep.unresolvedSymbols.length} symbol(s) held back from Proposition`);

    console.log(`\nKSG LIVE CONTRACT PASS (${external ? 'live deployment' : 'contract server'})`);
  } finally {
    if (stub) await stub.close();
  }
}

main().catch((err) => {
  console.error(`\nKSG LIVE CONTRACT FAIL\n${err?.message ?? err}`);
  process.exit(1);
});
