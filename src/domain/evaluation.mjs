/**
 * Evaluation artifacts: a derived result pinned to the exact input commit,
 * snapshot hash and evaluator version (PROV-001), with its own content hash.
 */

import { contentHash } from './canonicalize.mjs';

export function makeEvaluation({ commitId, snapshotHash, evaluator, evaluatorVersion, result, createdAt = null }) {
  const body = {
    schema: 'truth-evaluation',
    version: '0.1',
    inputCommitRef: commitId,
    inputSnapshotHash: snapshotHash,
    evaluator,
    evaluatorVersion,
    result,
    provenance: { sourceType: 'evaluator', method: evaluator, createdAt: createdAt ?? undefined }
  };
  return { ...body, id: `evaluation:${contentHash({ ...body, provenance: { ...body.provenance, createdAt: undefined } }).slice(7, 23)}` };
}
