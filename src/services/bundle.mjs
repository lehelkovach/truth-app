/**
 * Everything the static UI needs for one project, precomputed: commits per
 * branch with snapshot, evaluation, and the diff/evaluation-diff from the
 * previous commit; branch compares against main. The UI is a projection; it
 * never recomputes.
 */

import { formatDiff, formatEvaluationDiff } from '../domain/semantic-diff.mjs';
import { toProlog } from '../logic/text.mjs';
import { render } from '../logic/ir.mjs';
import { claimExpression } from '../logic/kb.mjs';

export function buildBundle({ store, project }) {
  const branches = store.listBranches();
  const commits = [];
  const seen = new Set();
  for (const b of branches) {
    const chain = store.listHistory(b.name).reverse();
    chain.forEach((c, i) => {
      if (seen.has(c.id)) return;
      seen.add(c.id);
      const snapshot = store.getSnapshot(c.id);
      const evaluation = store.evaluate(c.id);
      const names = Object.fromEntries(Object.values(snapshot.units).filter((u) => u.kind === 'concept').map((u) => [u.id, u.label]));
      const logicText = {};
      for (const u of Object.values(snapshot.units)) {
        if (u.kind !== 'claim') continue;
        const ex = claimExpression(u, snapshot);
        if (ex) logicText[u.id] = { ir: render(ex.ir, names), prolog: toProlog(ex.ir, names), from: ex.from, valid: ex.valid.ok };
      }
      const prev = chain[i - 1] ?? null;
      const cmp = prev ? store.compare(prev.id, c.id) : null;
      commits.push({ ...c, branch: b.name, index: i + 1, snapshot: { units: snapshot.units, relations: snapshot.relations, revisions: snapshot.revisions }, evaluation, logicText, diff: cmp ? { ...cmp.diff, text: formatDiff(cmp.diff), evaluation: cmp.evaluation, evaluationText: formatEvaluationDiff(cmp.evaluation) } : null });
    });
  }
  const compares = branches.filter((b) => b.name !== 'main').map((b) => { const cmp = store.compare('main', b.name); return { from: 'main', to: b.name, fromCommit: cmp.from, toCommit: cmp.to, diff: { ...cmp.diff, text: formatDiff(cmp.diff) }, evaluation: cmp.evaluation, evaluationText: formatEvaluationDiff(cmp.evaluation) }; });
  return { schema: 'truth-bundle', version: '0.1', project: { id: project.id, title: project.title, question: project.question, description: project.description }, generatedAt: new Date().toISOString(), branches, commits, compares };
}
