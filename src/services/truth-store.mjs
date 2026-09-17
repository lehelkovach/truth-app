/**
 * TruthStore: the application-facing API over a repository (handoff §44).
 *
 * All state lives in the in-memory repository; a KSG adapter may be attached
 * to mirror accepted commits into KnowShowGo. Nothing here talks HTTP.
 */

import { contentHash } from '../domain/canonicalize.mjs';
import { commit as makeCommit, createBranch as makeBranch, createRepository, headOf, headSnapshot, history, snapshotAt, verifyCommit, DEFAULT_BRANCH } from '../domain/commit.mjs';
import { makeEvaluation } from '../domain/evaluation.mjs';
import { semanticDiff, evaluationDiff } from '../domain/semantic-diff.mjs';
import { conceptUsage } from '../domain/grounding.mjs';
import { liveRelations } from '../domain/truth-patch.mjs';
import { getEvaluator } from './evaluator-registry.mjs';

export function createTruthStore({ ksg = null, repo = null, project = {} } = {}) {
  const repository = repo ?? createRepository(project);
  const evaluations = new Map();
  const evaluationCache = new Map();

  /**
   * Resolve a ref to a commit id: a commit id, a branch name (head), or
   * `branch@n` for the n-th commit on that branch counting from its root
   * (1-based). `main@1` is the first commit.
   */
  function resolveRef(ref = DEFAULT_BRANCH) {
    if (ref === null) return null;
    if (ref in repository.branches) return headOf(repository, ref);
    const m = /^(.+)@(\d+)$/.exec(ref);
    if (m && m[1] in repository.branches) {
      const chain = history(repository, m[1]).reverse();
      const c = chain[Number(m[2]) - 1];
      if (!c) throw new Error(`${ref}: branch ${m[1]} has ${chain.length} commits`);
      return c.id;
    }
    if (repository.commits.has(ref)) return ref;
    throw new Error(`unknown ref ${ref}`);
  }

  function getSnapshot(ref = DEFAULT_BRANCH) {
    return snapshotAt(repository, resolveRef(ref));
  }

  function createBranch(name, fromRef = DEFAULT_BRANCH) {
    return makeBranch(repository, name, resolveRef(fromRef));
  }

  function getUnit(id, ref = DEFAULT_BRANCH) {
    const u = getSnapshot(ref).units[id];
    if (!u) throw new Error(`unknown unit ${id}`);
    return u;
  }

  async function commitPatch(patch, { branch = DEFAULT_BRANCH, authorRef, createdAt, message } = {}) {
    const record = makeCommit(repository, { patch, branch, authorRef, createdAt, message });
    if (ksg) await ksg.mirrorCommit({ commit: record, patch, snapshot: repository.snapshots.get(record.id), project: repository });
    return record;
  }

  function listHistory(ref = DEFAULT_BRANCH) {
    return history(repository, ref in repository.branches ? ref : resolveRef(ref));
  }

  function listBranches() {
    return Object.entries(repository.branches).map(([name, head]) => ({ name, head, commits: head ? history(repository, name).length : 0 }));
  }

  function diff(fromRef, toRef = DEFAULT_BRANCH) {
    return semanticDiff(getSnapshot(fromRef), getSnapshot(toRef));
  }

  function evaluate(ref = DEFAULT_BRANCH, evaluatorId = 'truth.native') {
    const commitId = resolveRef(ref);
    const cacheKey = `${commitId}|${evaluatorId}`;
    if (evaluationCache.has(cacheKey)) return evaluationCache.get(cacheKey);
    const snapshot = getSnapshot(ref);
    const evaluator = getEvaluator(evaluatorId);
    const result = evaluator.run(snapshot, { commitId });
    const artifact = makeEvaluation({
      commitId,
      snapshotHash: contentHash({ units: snapshot.units, relations: snapshot.relations }),
      evaluator: evaluator.id,
      evaluatorVersion: evaluator.version,
      result
    });
    evaluations.set(artifact.id, artifact);
    evaluationCache.set(cacheKey, artifact);
    return artifact;
  }

  function compare(fromRef, toRef) {
    const a = evaluate(fromRef);
    const b = evaluate(toRef);
    return { from: resolveRef(fromRef), to: resolveRef(toRef), diff: semanticDiff(getSnapshot(fromRef), getSnapshot(toRef)), evaluation: evaluationDiff(a.result, b.result) };
  }

  function explainConcept(conceptId, ref = DEFAULT_BRANCH) {
    return conceptUsage(getSnapshot(ref), conceptId);
  }

  function getEvidence(claimId, ref = DEFAULT_BRANCH) {
    const snapshot = getSnapshot(ref);
    const claim = snapshot.units[claimId];
    if (!claim) throw new Error(`unknown unit ${claimId}`);
    const sources = (claim.sourceRefs ?? []).map((s) => snapshot.units[s]).filter(Boolean);
    const supporting = liveRelations(snapshot, ['supports']).filter((r) => r.to === claimId).map((r) => ({ relation: r, unit: snapshot.units[r.from] }));
    return { claim, sources, supporting };
  }

  /** Everything the inspector shows for one unit: revisions, relations, label. */
  function explainUnit(id, ref = DEFAULT_BRANCH) {
    const snapshot = getSnapshot(ref);
    const unit = snapshot.units[id] ?? snapshot.relations[id];
    if (!unit) throw new Error(`unknown unit ${id}`);
    const relations = liveRelations(snapshot).filter((r) => r.from === id || r.to === id || r.targetRef === id);
    const evaluation = evaluate(ref);
    const label = evaluation.result.labels[id] ?? evaluation.result.claims[id] ?? null;
    const lineage = history(repository, resolveRef(ref))
      .filter((c) => {
        const patch = repository.patches.get(c.id);
        return patch.operations.some((op) => op.unit?.id === id || op.relation?.id === id || op.target?.id === id);
      })
      .map((c) => ({ commit: c.id, message: c.message, createdAt: c.createdAt }));
    return { unit, revision: snapshot.revisions[id], relations, label, derivation: evaluation.result.derivation[id] ?? null, logic: evaluation.result.logic?.arguments?.[id] ?? evaluation.result.logic?.claims?.[id] ?? null, grounding: evaluation.result.grounding?.[id] ?? null, dimensions: evaluation.result.dimensions?.[id] ?? null, diagnostics: (evaluation.result.diagnostics ?? []).filter((d) => d.target === id), lineage, evaluationRef: evaluation.id };
  }

  return {
    repository,
    resolveRef,
    getSnapshot,
    createBranch,
    listBranches,
    compare,
    explainConcept,
    getUnit,
    commitPatch,
    listHistory,
    diff,
    evaluate,
    getEvidence,
    explainUnit,
    verify: (commitId) => verifyCommit(repository, commitId),
    evaluations
  };
}
