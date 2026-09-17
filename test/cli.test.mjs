import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { root, fixture } from './helpers.mjs';

const cli = join(root, 'src', 'cli.mjs');
const run = (...args) => execFileSync('node', [cli, ...args], { encoding: 'utf8' });

test('E2E smoke: validate, evaluate, history, diff, verify, report, ksg-push (fake) on the ai-risk fixture', () => {
  assert.match(run('validate', fixture('ai-risk')), /OK repo:ai-risk-2026: \d+ units, \d+ relations/);
  const ev = run('evaluate', fixture('ai-risk'), '--quiet');
  assert.match(ev, /thesis claim:S12: established/);
  assert.match(ev, /defeated\s+argument:B3/);
  assert.match(run('history', fixture('ai-risk')), /Risk side replies to B3/);
  assert.match(run('diff', fixture('ai-risk')), /\+ rel:X19 argument:A15 undercut argument:B3/);
  assert.match(run('verify', fixture('ai-risk')), /OK commit:/);
  const out = join(mkdtempSync(join(tmpdir(), 'truth-')), 'r.html');
  run('report', fixture('ai-risk'), '--format', 'html', '--out', out);
  assert.match(readFileSync(out, 'utf8'), /<h2>Thesis<\/h2>/);
  assert.match(run('ksg-push', fixture('ai-risk')), /mirrored into fake client: 2 commits/);
  assert.match(run('fallacies'), /pascals_mugging/);
});

test('compile reproduces the committed patch operations', () => {
  const out = run('compile', join(fixture('ai-risk'), 'source', 'case.json'));
  const compiled = JSON.parse(out);
  const committed = JSON.parse(readFileSync(join(fixture('ai-risk'), 'commits', '0001-author-case.json'), 'utf8'));
  assert.equal(compiled.operations.length, committed.operations.length);
});

test('compare, logic, concept and bundle commands', () => {
  const cmp = run('compare', fixture('hermione'), 'main', 'repair');
  assert.match(cmp, /\+ claim:C7/);
  assert.match(cmp, /not_entailed → entailed/);
  assert.match(run('logic', fixture('hermione'), 'claim:C1'), /warm_blooded\(X\) :- mammal\(X\)\./);
  assert.match(run('concept', fixture('ai-risk'), 'concept:intelligence-competence'), /competing senses: concept:intelligence-agency/);
  const out = join(mkdtempSync(join(tmpdir(), 'truth-')), 'b.json');
  run('bundle', fixture('hermione'), '--out', out);
  const b = JSON.parse(readFileSync(out, 'utf8'));
  assert.equal(b.schema, 'truth-bundle');
  assert.equal(b.commits.length, 3);
  assert.equal(b.compares[0].to, 'repair');
  assert.ok(b.commits[0].logicText['claim:C1'].prolog);
});
