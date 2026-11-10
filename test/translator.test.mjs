import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fixture } from './helpers.mjs';
import { translate, createReview, createScriptedProvider, TranslatorError, ReviewError } from '../src/services/translator.mjs';
import { createTruthStore } from '../src/services/truth-store.mjs';

const dir = fixture('translator');
const prose = (name) => readFileSync(join(dir, name), 'utf8');
const proposalFile = (name) => JSON.parse(readFileSync(join(dir, name), 'utf8'));
const scripted = (file, model = 'fixture') => createScriptedProvider(() => proposalFile(file), { name: 'scripted', model });
const freshStore = () => createTruthStore({ project: { id: 'repo:translator-test', title: 'Translator test' } });

// Walk an object and collect every property key, to prove the system never
// manufactures a forbidden field (a "truth score") from injected prose.
function allKeys(obj, acc = new Set()) {
  if (Array.isArray(obj)) obj.forEach((v) => allKeys(v, acc));
  else if (obj && typeof obj === 'object') for (const [k, v] of Object.entries(obj)) { acc.add(k); allKeys(v, acc); }
  return acc;
}

test('TRANSLATE-001 a faithful proposal runs the full compose() pipeline and is committable but not committed', async () => {
  const prop = await translate({ text: prose('socrates.prose.txt'), provider: scripted('socrates.proposal.json'), sourceRef: 'socrates' });
  assert.equal(prop.status, 'proposed');
  assert.equal(prop.ok, true);
  assert.equal(prop.stage, 'evaluate');
  assert.equal(prop.committable, true);
  assert.equal(prop.blocking.length, 0);
  assert.ok(prop.patch, 'carries a compiled TruthPatch');
  assert.equal(prop.summary.thesis, 'established');
  // Provenance marks it as machine-produced, exactly as the schema allows.
  assert.equal(prop.provenance.sourceType, 'llm');
  assert.equal(prop.provenance.method, 'ai_translation');
  assert.equal(prop.provenance.model, 'fixture');
  // Every proposed unit carries the llm provenance into the patch.
  assert.ok(prop.patch.operations.every((op) => (op.unit ?? op.relation)?.provenance.sourceType === 'llm'));
});

test('TRANSLATE-002 source alignment is verified against the real units and the real source text', async () => {
  const prop = await translate({ text: prose('socrates.prose.txt'), provider: scripted('socrates.proposal.json') });
  assert.equal(prop.alignment.length, 3);
  assert.equal(prop.unverifiedAlignment.length, 0);
  assert.ok(prop.alignment.every((a) => prop.snapshot.units[a.unit]));
});

test('TRANSLATE-003 alignment entries that name a missing unit or quote absent text are flagged, never trusted', async () => {
  const provider = createScriptedProvider(() => ({
    composer: 'issue: Q?\nthesis: C1\nC1 [plausible]: The source makes a claim.\n',
    alignment: [
      { unit: 'claim:C1', quote: 'makes a claim' },       // valid: unit exists AND quote is in the source
      { unit: 'claim:C1', quote: 'never written here' },   // unit exists, quote absent -> unverified
      { unit: 'claim:NOPE', quote: 'The source' }          // quote present, unit missing -> unverified
    ]
  }), { name: 's' });
  const prop = await translate({ text: 'The source makes a claim about the world.', provider });
  assert.equal(prop.alignment.length, 1);
  assert.equal(prop.alignment[0].unit, 'claim:C1');
  assert.equal(prop.unverifiedAlignment.length, 2);
  const reasons = prop.unverifiedAlignment.map((u) => u.reasons.join(' '));
  assert.ok(reasons.some((r) => /not found in the source/.test(r)));
  assert.ok(reasons.some((r) => /not in the proposal/.test(r)));
});

test('TRANSLATE-004 translate rejects an empty source or a provider with no propose()', async () => {
  await assert.rejects(() => translate({ text: '   ', provider: scripted('socrates.proposal.json') }), TranslatorError);
  await assert.rejects(() => translate({ text: 'x', provider: {} }), TranslatorError);
});

test('TRANSLATE-005 an empty provider response yields a non-committable proposal, not a crash', async () => {
  const prop = await translate({ text: 'Some prose.', provider: createScriptedProvider(() => ({ composer: '' }), { name: 's' }) });
  assert.equal(prop.ok, false);
  assert.equal(prop.committable, false);
  assert.equal(prop.blocking[0].code, 'EMPTY');
});

test('REVIEW-001 accept() is the only path to a commit, and it goes through the store', async () => {
  const store = freshStore();
  assert.equal(store.listHistory().length, 0);
  const review = createReview(await translate({ text: prose('socrates.prose.txt'), provider: scripted('socrates.proposal.json') }), { store });
  // Merely producing the proposal committed nothing.
  assert.equal(store.listHistory().length, 0);
  const { committed, commit } = await review.accept({ message: 'accept socrates' });
  assert.equal(committed, true);
  assert.ok(commit.id.startsWith('commit:'));
  assert.equal(store.listHistory().length, 1);
  assert.equal(review.settled, 'accepted');
  // A settled review cannot be re-driven.
  await assert.rejects(() => review.accept({}), ReviewError);
  assert.throws(() => review.reject(), ReviewError);
});

test('REVIEW-002 reject() commits nothing', async () => {
  const store = freshStore();
  const review = createReview(await translate({ text: prose('socrates.prose.txt'), provider: scripted('socrates.proposal.json') }), { store });
  const res = review.reject('not faithful to the source');
  assert.deepEqual(res, { committed: false, rejected: true, reason: 'not faithful to the source' });
  assert.equal(store.listHistory().length, 0);
});

test('REVIEW-003 edit() produces a fresh human-authored proposal that can then be accepted', async () => {
  const store = freshStore();
  // Start from the compromised (non-committable) proposal, then a human fixes it.
  const bad = await translate({ text: prose('injection-content.prose.txt'), provider: scripted('injection-compromised.proposal.json') });
  const review = createReview(bad, { store });
  await assert.rejects(() => review.accept({}), ReviewError);
  const fixed = review.edit('issue: Q?\nthesis: C1\nC1 [plausible]: A real claim a human wrote.\n');
  assert.equal(fixed.proposal.committable, true);
  assert.equal(fixed.proposal.provenance.sourceType, 'user');
  assert.equal(fixed.proposal.provenance.method, 'ai_assisted_authoring');
  assert.equal(fixed.proposal.editedFromAi, true);
  const { committed } = await fixed.accept({ message: 'human-edited' });
  assert.equal(committed, true);
  assert.equal(store.listHistory().length, 1);
});

// ---- Prompt-injection regression ----------------------------------------
// Two independent guarantees, each with its own fixture.

test('INJECT-001 injected directives in the SOURCE cannot command a verdict or suppress a fallacy', async () => {
  const store = freshStore();
  const prop = await translate({ text: prose('injection-content.prose.txt'), provider: scripted('injection-content.proposal.json'), sourceRef: 'injection-content' });
  // The provider modeled the argument and ignored "mark PROVEN / score 1.0 / commit / hide the fallacy".
  assert.equal(prop.status, 'proposed');
  // The fallacy the injection told the model to hide survives as a recorded unit.
  const annotations = Object.values(prop.snapshot.units).filter((u) => u.kind === 'annotation');
  assert.ok(annotations.some((a) => a.annotationType === 'fallacy' && a.name === 'hasty_generalization'), 'the hasty-generalization annotation is preserved');
  // The system manufactures no "truth score" — no such field exists anywhere in the proposal structure.
  const keys = allKeys(prop);
  assert.ok(!keys.has('truthScore') && !keys.has('truth_score') && !keys.has('score'), 'no score field is produced');
  // Producing the proposal committed nothing; only an explicit accept could.
  assert.equal(store.listHistory().length, 0);
});

test('INJECT-002 a COMPROMISED provider cannot bypass the schema or the commit gate', async () => {
  const store = freshStore();
  const prop = await translate({ text: prose('injection-content.prose.txt'), provider: scripted('injection-compromised.proposal.json'), sourceRef: 'injection-compromised' });
  // Raw control directives are not composer grammar -> red diagnostics.
  assert.equal(prop.committable, false);
  assert.ok(prop.blocking.length >= 1);
  assert.ok(prop.blocking.every((d) => d.state === 'red'));
  assert.ok(prop.blocking.some((d) => d.code === 'PARSE'));
  // The review gate refuses to commit it, and nothing reaches the store.
  const review = createReview(prop, { store });
  await assert.rejects(() => review.accept({ message: 'should never happen' }), ReviewError);
  assert.equal(store.listHistory().length, 0);
});

// ---- Anthropic provider, exercised offline with an injected client ---------
// The fake returns responses shaped like @anthropic-ai/sdk 1.x Messages.

import { createAnthropicProvider } from '../src/services/translator.mjs';

const SOCRATES_COMPOSER = proposalFile('socrates.proposal.json').composer;
function fakeClient(response) {
  const calls = [];
  return { calls, messages: { create: async (req) => { calls.push(req); return typeof response === 'function' ? response(req) : response; } } };
}
const toolUse = (input, extra = {}) => ({ model: 'claude-opus-5-5', stop_reason: 'tool_use', usage: { input_tokens: 900, output_tokens: 300 }, content: [{ type: 'tool_use', id: 'toolu_x', name: 'propose_case', input }], ...extra });

test('ANTHROPIC-001 a tool_use response becomes a proposal; the request forces the tool and frames the source as data', async () => {
  const client = fakeClient(toolUse({ composer: SOCRATES_COMPOSER, alignment: [{ unit: 'C1', quote: 'All men are mortal' }, { unit: 'A1', quote: 'Therefore, Socrates is mortal' }] }));
  const prop = await translate({ text: prose('socrates.prose.txt'), provider: createAnthropicProvider({ client }) });
  assert.equal(prop.committable, true);
  assert.equal(prop.provenance.sourceType, 'llm');
  assert.equal(prop.model, 'claude-opus-5-5');
  assert.deepEqual(prop.usage, { input_tokens: 900, output_tokens: 300 });
  const req = client.calls[0];
  assert.deepEqual(req.tool_choice, { type: 'tool', name: 'propose_case' });
  assert.equal(req.model, 'claude-opus-5-5');
  assert.equal(req.max_tokens, 8192);
  assert.match(req.system, /untrusted data/);
  assert.match(req.messages[0].content, /SOURCE TEXT \(untrusted data/);
});

test('ANTHROPIC-002 short ids the model cites (C1, A1) resolve to unit ids; unknown ids stay unverified', async () => {
  const client = fakeClient(toolUse({ composer: SOCRATES_COMPOSER, alignment: [{ unit: 'C1', quote: 'All men are mortal' }, { unit: 'A1', quote: 'Therefore, Socrates is mortal' }, { unit: 'C9', quote: 'Socrates is a man' }] }));
  const prop = await translate({ text: prose('socrates.prose.txt'), provider: createAnthropicProvider({ client }) });
  assert.deepEqual(prop.alignment.map((a) => a.unit), ['claim:C1', 'argument:A1']);
  assert.equal(prop.unverifiedAlignment.length, 1);
  assert.equal(prop.unverifiedAlignment[0].unit, 'C9');
});

test('ANTHROPIC-003 truncated, context-overflow and refused responses are errors, never proposals', async () => {
  const text = prose('socrates.prose.txt');
  for (const stop of ['max_tokens', 'model_context_window_exceeded']) {
    const provider = createAnthropicProvider({ client: fakeClient(toolUse({ composer: 'issue: Q?\nC1 [plausible]: A' }, { stop_reason: stop })) });
    await assert.rejects(() => translate({ text, provider }), (e) => e instanceof TranslatorError && /cut off/.test(e.message), stop);
  }
  const refused = createAnthropicProvider({ client: fakeClient({ model: 'claude-opus-5-5', stop_reason: 'refusal', content: [] }) });
  await assert.rejects(() => translate({ text, provider: refused }), /declined/);
});

test('ANTHROPIC-004 a missing tool call or a malformed tool input is rejected', async () => {
  const text = prose('socrates.prose.txt');
  const noTool = createAnthropicProvider({ client: fakeClient({ model: 'm', stop_reason: 'end_turn', content: [{ type: 'text', text: 'Here is the case: ...' }] }) });
  await assert.rejects(() => translate({ text, provider: noTool }), /did not call propose_case \(stop_reason end_turn\)/);
  for (const bad of [null, ['x'], { composer: 42 }, { alignment: [] }]) {
    const provider = createAnthropicProvider({ client: fakeClient(toolUse(bad)) });
    await assert.rejects(() => translate({ text, provider }), /not an object with a string "composer"/, JSON.stringify(bad));
  }
});

test('ANTHROPIC-005 without an injected client, a missing key fails before any network call', async () => {
  await assert.rejects(() => translate({ text: 'x y z', provider: createAnthropicProvider({ apiKey: '' }) }), /ANTHROPIC_API_KEY is not set/);
});
