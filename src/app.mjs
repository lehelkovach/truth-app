/**
 * TruthApp public API (ESM). Import from here; the module layout underneath
 * follows docs/ARCHITECTURE.md.
 */

export { canonicalize, serialize, contentHash, shortHash, deepFreeze } from './domain/canonicalize.mjs';
export { isRef, parseRef, makeRef, refKind, refName } from './domain/ids.mjs';
export { ValidationError, snapshotProblems, snapshotInvariantProblems, patchSchemaProblems, commitSchemaProblems, unitSchemaProblems, relationSchemaProblems, assertValidSnapshot, assertValidPatch, assertValidCommit, profileSchema, patchSchema, commitSchema } from './domain/validate.mjs';
export { applyPatch, emptySnapshot, unitsOfKind, liveRelations } from './domain/truth-patch.mjs';
export { createRepository, commit, createBranch, history, headOf, headSnapshot, snapshotAt, getCommit, verifyCommit, DEFAULT_BRANCH } from './domain/commit.mjs';
export { semanticDiff, formatDiff } from './domain/semantic-diff.mjs';
export { evaluateGrounded, evaluateSnapshot, attackEdges, structuralFindings, modalityRank, MODALITIES, EVALUATOR_ID, EVALUATOR_VERSION } from './domain/argumentation.mjs';
export { FALLACIES, describeFallacy, fallacyByCode } from './domain/fallacies.mjs';
export { makeEvaluation } from './domain/evaluation.mjs';
export { compileCase } from './domain/authoring.mjs';
export { createTruthStore } from './services/truth-store.mjs';
export { registerEvaluator, getEvaluator, listEvaluators } from './services/evaluator-registry.mjs';
export { createKsgAdapter, createFakeKsgClient, createKsgClientFromEnv } from './adapters/ksg.mjs';
export { loadFixture, readFixture } from './adapters/local-fixture-store.mjs';
export { renderMarkdown } from './report/markdown.mjs';
export { renderHtml } from './report/html.mjs';
