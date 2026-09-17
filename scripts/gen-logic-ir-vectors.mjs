#!/usr/bin/env node
/**
 * Regenerate test/vectors/logic-ir-ksg.json from a KnowShowGo checkout so the
 * local Logic IR mirror is proven byte-compatible with the canonical module.
 *
 *   node scripts/gen-logic-ir-vectors.mjs ../knowshowgo
 */
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const ksgDir = process.argv[2];
if (!ksgDir) { console.error('usage: gen-logic-ir-vectors.mjs <knowshowgo checkout>'); process.exit(1); }
const core = await import(pathToFileURL(resolve(ksgDir, 'src/logic_ir/core.js')).href);
const { conceptRef, entityRef, variable, predicate, implies, forAll, exists, and, or, not, canonicalize, serialize, hashIr, render, LOGIC_IR_VERSION } = core;
const x = variable('x');
const cases = {
  p1: { ir: { logicIrVersion: LOGIC_IR_VERSION, ...forAll(x, implies(predicate(conceptRef('H17', 'H17'), [x]), predicate(conceptRef('M52', 'M52'), [x]))) }, names: { H17: 'Human', M52: 'Mortal' } },
  p2: { ir: { logicIrVersion: LOGIC_IR_VERSION, ...predicate(conceptRef('H17'), [entityRef('S1')]) }, names: { H17: 'Human', S1: 'Socrates' } },
  andOrder: { ir: and([predicate(conceptRef('Q'), [entityRef('a')]), predicate(conceptRef('P'), [entityRef('a')])]), names: {} },
  nested: { ir: exists(x, or([not(predicate(conceptRef('B'), [x])), and([predicate(conceptRef('A'), [x]), predicate(conceptRef('C'), [x, entityRef('e')])])])), names: { A: 'A', B: 'B', C: 'C', e: 'e' } }
};
const out = {};
for (const [name, { ir, names }] of Object.entries(cases)) out[name] = { ir, names, canonical: serialize(canonicalize(ir)), hash: hashIr(ir), rendering: render(ir, names) };
writeFileSync(new URL('../test/vectors/logic-ir-ksg.json', import.meta.url), JSON.stringify(out, null, 2) + '\n');
console.log(`wrote ${Object.keys(out).length} vectors`);
