/**
 * TruthStore: the application-facing API over a repository (handoff §44).
 *
 * All state lives in the in-memory repository; a KSG adapter may be attached
 * to mirror accepted commits into KnowShowGo. Nothing here talks HTTP.
 */

import { contentHash } from '../domain/canonicalize.mjs';
import { commit as makeCommit, createRepository, headOf, headSnapshot, history, snapshotAt, verifyCommit, DEFAULT_BRANCH } from '../domain/commit.mjs';
import { makeEvaluation } from '../domain/evaluation.mjs';
import { semanticDiff } from '../domain/semantic-diff.mjs';
import { liveRelations } from '../domain/truth-patch.mjs';
import { getEvaluator } from './evaluator-registry.mjs';

export function createTruthStore({ ksg = null, repo = null, project = {} } = {}) {
  const repository = repo ?? createRepository(project);
  const evaluations = new Map();

  function getSnapshot(ref = DEFAULT_BRANCH) {
    return ref in repository.branches ? headSnapshot(repository, ref) : snapshotAt(repository, ref);
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

  function listHistory(branch = DEFAULT_BRANCH) {
    return history(repository, branch);
  }

  function diff(fromRef, toRef = DEFAULT_BRANCH) {
    return semanticDiff(getSnapshot(fromRef), getSnapshot(toRef));
  }

  function evaluate(ref = DEFAULT_BRANCH, evaluatorId = 'argumentation.grounded') {
    const commitId = ref in repository.branches ? headOf(repository, ref) : ref;
    const snapshot = getSnapshot(ref);
    const evaluator = getEvaluator(evaluatorId);
    const result = evaluator.run(snapshot);
    const artifact = makeEvaluation({
      commitId,
      snapshotHash: contentHash({ units: snapshot.units, relations: snapshot.relations }),
      evaluator: evaluator.id,
      evaluatorVersion: evaluator.version,
      result
    });
    evaluations.set(artifact.id, artifact);
    return artifact;
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
    const lineage = listHistory(ref)
      .filter((c) => {
        const patch = repository.patches.get(c.id);
        return patch.operations.some((op) => op.unit?.id === id || op.relation?.id === id || op.target?.id === id);
      })
      .map((c) => ({ commit: c.id, message: c.message, createdAt: c.createdAt }));
    return { unit, revision: snapshot.revisions[id], relations, label, derivation: evaluation.result.derivation[id] ?? null, lineage, evaluationRef: evaluation.id };
  }

  return {
    repository,
    getSnapshot,
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
