import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadFixture } from '../src/adapters/local-fixture-store.mjs';
import { renderHtml } from '../src/report/html.mjs';
import { renderMarkdown } from '../src/report/markdown.mjs';
import { formatDiff } from '../src/domain/semantic-diff.mjs';
import { fixture } from './helpers.mjs';

test('markdown and html reports render thesis, verdicts, findings and history', async () => {
  const { store, commits, project } = await loadFixture(fixture('ai-risk'));
  const c = commits[1];
  const evaluation = store.evaluate(c.id);
  const snapshot = store.getSnapshot(c.id);
  const d = store.diff(commits[0].id, c.id);
  const args = { snapshot, evaluation, project, history: store.listHistory(c.id), diff: { ...d, text: formatDiff(d) } };
  const md = renderMarkdown(args);
  assert.match(md, /## Thesis/);
  assert.match(md, /claim:S12/);
  assert.match(md, /#### argument:A15\. Automated AI research compounds within fixed compute — stands/);
  assert.match(md, /MODAL_OVERREACH/);
  assert.match(md, /## History/);
  assert.match(md, /\+ argument:A15/);
  const html = renderHtml(args);
  assert.match(html, /<title>Is AI an existential threat\?/);
  assert.match(html, /class="badge established"/);
  assert.match(html, /id="argument:B9"/);
  assert.doesNotMatch(html, /<script/);
  assert.match(html, /&#39;Intelligence&#39;/, 'text is escaped');
});
