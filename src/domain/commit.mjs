/**
 * Immutable revisions, commits, branches and history.
 *
 * A repository is an in-memory object: commits are content-addressed
 * (`commit:<sha256 prefix>` over the canonical commit body minus `id`), each
 * one pins its patch hash and the resulting snapshot hash. Branch heads are
 * the only mutable state. No distributed merge yet (Workstream 2 scope).
 */

import { contentHash, deepFreeze, shortHash } from './canonicalize.mjs';
import { applyPatch, emptySnapshot } from './truth-patch.mjs';
import { assertValidCommit } from './validate.mjs';

export const DEFAULT_BRANCH = 'main';

export function createRepository({ id = 'repo:local', title = '', question = '', description = '' } = {}) {
  return {
    id,
    title,
    question,
    description,
    commits: new Map(),
    patches: new Map(),
    snapshots: new Map(),
    branches: { [DEFAULT_BRANCH]: null }
  };
}

export function headOf(repo, branch = DEFAULT_BRANCH) {
  if (!(branch in repo.branches)) throw new Error(`unknown branch ${branch}`);
  return repo.branches[branch];
}

export function snapshotAt(repo, commitId) {
  if (commitId === null) return emptySnapshot();
  const snap = repo.snapshots.get(commitId);
  if (!snap) throw new Error(`unknown commit ${commitId}`);
  return snap;
}

export function headSnapshot(repo, branch = DEFAULT_BRANCH) {
  return snapshotAt(repo, headOf(repo, branch));
}

/**
 * Apply a patch on top of a branch head and record an immutable commit.
 * `createdAt` is a parameter (not `Date.now()`) so fixtures replay to the
 * same commit ids.
 */
export function commit(repo, { patch, branch = DEFAULT_BRANCH, message = patch.message, authorRef = 'actor:local', createdAt, provenance }) {
  const parent = headOf(repo, branch);
  if (patch.baseCommitRef !== undefined && patch.baseCommitRef !== null && patch.baseCommitRef !== parent) {
    throw new Error(`patch is based on ${patch.baseCommitRef} but ${branch} is at ${parent}`);
  }
  const base = snapshotAt(repo, parent);
  const snapshot = applyPatch(base, patch);
  const patchHash = contentHash(patch);
  const snapshotHash = contentHash({ units: snapshot.units, relations: snapshot.relations });
  const body = {
    schema: 'truth-commit',
    version: '0.1',
    parentRefs: parent ? [parent] : [],
    branch,
    message,
    createdAt: createdAt ?? new Date().toISOString(),
    authorRef,
    patchRef: patch.id ?? `patch:${shortHash(patchHash)}`,
    patchHash,
    snapshotHash,
    provenance: provenance ?? patch.provenance ?? { sourceType: 'user', method: 'reviewed_semantic_commit' },
    immutable: true
  };
  const id = `commit:${shortHash(contentHash(body), 16)}`;
  const record = deepFreeze({ ...body, id });
  assertValidCommit(record);
  repo.commits.set(id, record);
  repo.patches.set(id, deepFreeze(JSON.parse(JSON.stringify(patch))));
  repo.snapshots.set(id, snapshot);
  repo.branches[branch] = id;
  return record;
}

export function createBranch(repo, name, fromCommit = headOf(repo)) {
  if (name in repo.branches) throw new Error(`branch ${name} exists`);
  if (fromCommit !== null && !repo.commits.has(fromCommit)) throw new Error(`unknown commit ${fromCommit}`);
  repo.branches[name] = fromCommit;
  return fromCommit;
}

/** Commits from a head back to the root, newest first. */
export function history(repo, branchOrCommit = DEFAULT_BRANCH) {
  let cursor = branchOrCommit in repo.branches ? repo.branches[branchOrCommit] : branchOrCommit;
  const out = [];
  while (cursor) {
    const c = repo.commits.get(cursor);
    if (!c) throw new Error(`unknown commit ${cursor}`);
    out.push(c);
    cursor = c.parentRefs[0] ?? null;
  }
  return out;
}

export function getCommit(repo, commitId) {
  const c = repo.commits.get(commitId);
  if (!c) throw new Error(`unknown commit ${commitId}`);
  return c;
}

/** Recompute a snapshot from the root and check its hash still matches. */
export function verifyCommit(repo, commitId) {
  const chain = history(repo, commitId).reverse();
  let snapshot = emptySnapshot();
  for (const c of chain) {
    snapshot = applyPatch(snapshot, repo.patches.get(c.id));
    const hash = contentHash({ units: snapshot.units, relations: snapshot.relations });
    if (hash !== c.snapshotHash) return { ok: false, at: c.id, expected: c.snapshotHash, actual: hash };
    if (contentHash(repo.patches.get(c.id)) !== c.patchHash) return { ok: false, at: c.id, reason: 'patch hash mismatch' };
  }
  return { ok: true };
}
