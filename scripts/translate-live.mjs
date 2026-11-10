#!/usr/bin/env node
/**
 * Run the AI translator LIVE (Anthropic provider) over real prose and report
 * what it proposed and how the Reasoning Explorer judges it.
 *
 *   ANTHROPIC_API_KEY=… npm run translate:live                 # every passage in fixtures/translator/live
 *   ANTHROPIC_API_KEY=… npm run translate:live -- good-1965    # just one
 *   TRUTH_TRANSLATE_MODEL=claude-sonnet-5-5 …                  # another model
 *
 * Proposals are written to out/translate-live/ (gitignored) for review. Nothing
 * is committed: these are proposals, and accepting one is a human's call.
 * There is deliberately no offline fallback — a live run that cannot reach the
 * API fails loudly instead of printing simulated results.
 */
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { translate, createAnthropicProvider } from '../src/services/translator.mjs';
import { reasoningReport } from '../src/services/reasoning.mjs';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const src = join(root, 'fixtures', 'translator', 'live');
const out = join(root, 'out', 'translate-live');

if (!process.env.ANTHROPIC_API_KEY) {
  console.error('translate:live needs ANTHROPIC_API_KEY. In a cloud session, add it as an environment variable on the session\'s environment and start a new session; locally, export it. No simulated run is offered.');
  process.exit(2);
}
const only = process.argv.slice(2);
const names = readdirSync(src).filter((f) => f.endsWith('.prose.txt')).map((f) => f.replace(/\.prose\.txt$/, '')).filter((n) => !only.length || only.includes(n)).sort();
if (!names.length) { console.error(`no passages matched ${only.join(', ')}`); process.exit(2); }
mkdirSync(out, { recursive: true });

const model = process.env.TRUTH_TRANSLATE_MODEL || undefined;
const provider = createAnthropicProvider({ model });
const rows = [];
let failed = 0;
for (const name of names) {
  const text = readFileSync(join(src, `${name}.prose.txt`), 'utf8');
  process.stdout.write(`\n== ${name} (${provider.model}) … `);
  let p;
  try {
    p = await translate({ text, provider, sourceRef: `fixtures/translator/live/${name}` });
  } catch (e) {
    failed += 1;
    console.log(`FAILED: ${e.message}`);
    rows.push({ name, error: e.message });
    continue;
  }
  const rep = p.snapshot && p.evaluation ? reasoningReport(p.snapshot, p.evaluation) : null;
  writeFileSync(join(out, `${name}.truth`), p.composer.endsWith('\n') ? p.composer : p.composer + '\n');
  writeFileSync(join(out, `${name}.proposal.json`), JSON.stringify({ ...p, reasoning: rep }, null, 2) + '\n');
  const s = rep?.summary;
  const reds = p.diagnostics.filter((d) => d.state === 'red');
  console.log(`${p.committable ? 'committable' : 'NOT committable'} · ${p.summary?.units ?? 0} units · red ${reds.length}`);
  if (reds.length) for (const d of reds.slice(0, 6)) console.log(`   red ${d.code}${d.line ? ' line ' + d.line.line : ''}: ${d.message}`);
  if (s) console.log(`   reasoning: ${s.arguments} arguments → ${s.valid} valid · ${s.invalid} invalid · ${s.not_deducible} not deducible · schemes ${JSON.stringify(s.schemes)} · ${s.formalClaims}/${s.claims} claims formal`);
  if (rep) for (const a of rep.arguments) console.log(`   ${a.short.padEnd(4)} ${a.verdict.padEnd(14)} [${a.scheme}] ${a.title ?? ''}`);
  console.log(`   alignment: ${p.alignment.length} verified, ${p.unverifiedAlignment.length} unverified · assumptions ${p.assumptions.length} · ambiguities ${p.ambiguities.length} · unresolved terms ${p.unresolvedTerms.length}`);
  for (const a of p.assumptions) console.log(`   assumption: ${a}`);
  for (const u of p.unverifiedAlignment) console.log(`   UNVERIFIED ${u.unit}: "${u.quote}" — ${u.reasons.join('; ')}`);
  if (p.usage) console.log(`   tokens: ${p.usage.input_tokens ?? '?'} in / ${p.usage.output_tokens ?? '?'} out`);
  rows.push({ name, model: p.model, committable: p.committable, units: p.summary?.units ?? 0, red: reds.length, arguments: s?.arguments ?? 0, valid: s?.valid ?? 0, invalid: s?.invalid ?? 0, notDeducible: s?.not_deducible ?? 0, schemes: s?.schemes ?? {}, verified: p.alignment.length, unverified: p.unverifiedAlignment.length, assumptions: p.assumptions.length, usage: p.usage });
}
const md = ['# Live translator run', '', `Model: ${provider.model} · ${new Date().toISOString()}`, '', '| Passage | Committable | Units | Red | Args | Valid | Invalid | Not deducible | Schemes | Alignment ✓/✗ | Assumptions |', '|---|---|---|---|---|---|---|---|---|---|---|',
  ...rows.map((r) => (r.error ? `| ${r.name} | error: ${r.error} |||||||||| ` : `| ${r.name} | ${r.committable ? 'yes' : 'no'} | ${r.units} | ${r.red} | ${r.arguments} | ${r.valid} | ${r.invalid} | ${r.notDeducible} | ${Object.entries(r.schemes).map(([k, v]) => `${k} ${v}`).join(', ')} | ${r.verified}/${r.unverified} | ${r.assumptions} |`))];
writeFileSync(join(out, 'summary.md'), md.join('\n') + '\n');
writeFileSync(join(out, 'summary.json'), JSON.stringify(rows, null, 2) + '\n');
console.log(`\nwrote ${out}/ (proposals, composer drafts, summary.md) — proposals only, nothing committed`);
process.exit(failed ? 1 : 0);
