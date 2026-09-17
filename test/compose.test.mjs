import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseComposer, compose } from '../src/services/compose.mjs';
import { fixture } from './helpers.mjs';

const example = () => readFileSync(join(fixture('hermione'), 'source', 'case.truth'), 'utf8');

test('COMPOSE-001 the example parses into a case with spans per statement', () => {
  const { case: c, spans, errors } = parseComposer(example());
  assert.deepEqual(errors, []);
  assert.equal(c.thesis, 'C3');
  assert.equal(Object.keys(c.concepts).length, 4);
  assert.equal(c.concepts.hermione.kind, 'entity');
  assert.equal(c.propositions.find((p) => p.id === 'C1').logic, 'forall x: mammal(x) -> warm_blooded(x)');
  assert.deepEqual(c.propositions.find((p) => p.id === 'C1').terms, ['mammal', 'warm-blooded']);
  assert.equal(c.arguments.length, 2);
  assert.ok(spans['claim:C1'].line > spans['concept:mammal'].line);
  assert.ok(spans['argument:A2'].line > spans['claim:C6'].line);
});

test('COMPOSE-002 the example evaluates: A1 entailed (green), A2 not entailed (red on its line), Crookshanks unresolved (yellow on its line)', () => {
  const r = compose(example());
  assert.equal(r.ok, true);
  assert.equal(r.stage, 'evaluate');
  const lines = example().split('\n');
  const at = (code) => r.diagnostics.filter((d) => d.code === code);
  assert.equal(at('LOGIC_ENTAILED')[0].target, 'argument:A1');
  const red = at('LOGIC_NOT_ENTAILED')[0];
  assert.equal(red.target, 'argument:A2');
  assert.match(lines[red.line.line - 1], /^A2 /);
  assert.ok(red.explanation.missingCondition.hints.some((h) => /mammal\(x\) → has fur\(x\)/.test(h)));
  const y = at('GROUNDING_UNRESOLVED')[0];
  assert.equal(y.target, 'claim:C6');
  assert.match(lines[y.line.line - 1], /^C6 /);
  assert.equal(r.summary.thesis, 'established');
  assert.equal(r.summary.red, 1);
});

test('COMPOSE-003 mistakes become red diagnostics with lines, never exceptions', () => {
  const text = `issue: q
C1 [certain]: All men are mortal.
  logic: forall x: man(x) -> mortal(x)
C2: Socrates is a man.
A1: C1, C9 => C2
B1 undermines A1
this line is nonsense
C3 [very-sure]: x`;
  const r = compose(text);
  assert.equal(r.ok, false);
  const codes = r.diagnostics.map((d) => [d.code, d.line?.line, d.message]);
  assert.ok(codes.some(([c, l]) => c === 'PARSE' && l === 6), 'undermines needs at');
  assert.ok(codes.some(([c, l]) => c === 'PARSE' && l === 7), 'nonsense line');
  assert.ok(codes.some(([c, l]) => c === 'PARSE' && l === 8), 'unknown option');
  const logicErr = codes.find(([c, , m]) => c === 'INVALID' && /unknown predicate man/.test(m));
  assert.ok(logicErr, JSON.stringify(codes));
  assert.equal(logicErr[1], 3, 'reported on the logic: line');
});

test('COMPOSE-004 unresolved term in logic is reported on the logic line', () => {
  const text = `issue: q
predicate man
C1 [certain]: All men are mortal.
  logic: forall x: man(x) -> mortal(x)`;
  const r = compose(text);
  assert.equal(r.ok, false);
  const d = r.diagnostics.find((x) => /unknown predicate mortal|unknown symbol mortal/.test(x.message));
  assert.ok(d, JSON.stringify(r.diagnostics));
  assert.equal(d.line.line, 4);
});
