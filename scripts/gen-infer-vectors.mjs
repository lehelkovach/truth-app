#!/usr/bin/env node
/** Regenerate test/vectors/infer-ksg.json from a KnowShowGo checkout. */
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const ksgDir = process.argv[2];
if (!ksgDir) { console.error('usage: gen-infer-vectors.mjs <knowshowgo checkout>'); process.exit(1); }
const core = await import(pathToFileURL(resolve(ksgDir, 'src/logic_ir/core.js')).href);
const infer = await import(pathToFileURL(resolve(ksgDir, 'src/logic_ir/infer.js')).href);
const { conceptRef, entityRef, variable, predicate, implies, forAll, LOGIC_IR_VERSION } = core;
const wrap = (n) => ({ logicIrVersion: LOGIC_IR_VERSION, ...n });
const x = variable('x');
const H = 'H17', M = 'M52', S = 'S1', A = 'A1', B = 'B1', C = 'C1';
const p = (u, arg) => wrap(predicate(conceptRef(u), [arg]));
const all = (a, b) => wrap(forAll(x, implies(predicate(conceptRef(a), [x]), predicate(conceptRef(b), [x]))));
const cases = {
  socrates_valid: { premises: [{ uuid: 'p1', ir: all(H, M) }, { uuid: 'p2', ir: p(H, entityRef(S)) }], conclusion: { uuid: 'p3', ir: p(M, entityRef(S)) } },
  hypothetical_valid: { premises: [{ uuid: 'p1', ir: all(A, B) }, { uuid: 'p2', ir: all(B, C) }], conclusion: { uuid: 'p3', ir: all(A, C) } },
  wrong_conclusion_invalid: { premises: [{ uuid: 'p1', ir: all(H, M) }, { uuid: 'p2', ir: p(H, entityRef(S)) }], conclusion: { uuid: 'p3', ir: p(H, entityRef(S)) === null ? null : wrap(predicate(conceptRef(A), [entityRef(S)])) } },
  unresolved_premise: { premises: [{ uuid: 'p1', ir: all(H, M) }, { uuid: 'p2', ir: null, bindings: [{ symbol: 'God', resolved: false }] }], conclusion: { uuid: 'p3', ir: p(M, entityRef(S)) } }
};
const out = {};
for (const [name, arg] of Object.entries(cases)) {
  const res = infer.inferArgument(arg);
  out[name] = { input: arg, decision: res.decision, rule: res.rule ?? null };
}
writeFileSync(new URL('../test/vectors/infer-ksg.json', import.meta.url), JSON.stringify(out, null, 2) + '\n');
console.log('wrote', Object.keys(out).length, 'infer vectors:', Object.entries(out).map(([k, v]) => `${k}=${v.decision}`).join(', '));
