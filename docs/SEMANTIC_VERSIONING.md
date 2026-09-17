# Semantic version control

```
human meaning → units + relations → immutable revisions → commits → branches
```

| Concept | Implementation |
|---|---|
| Unit revision | `snapshot.revisions[id] = { revision, contentHash }`, bumped by every op that touches the id. |
| Commit | `commit(repo, { patch, branch, createdAt })` applies the patch to the branch head, hashes patch and snapshot, records parent. Id = `commit:` + sha256 prefix of the canonical body. Deterministic for a given `createdAt`. |
| Branch | `repo.branches[name]` → head commit id. `createBranch(repo, name, from)`. |
| History | `history(repo, branchOrCommit)` newest first. |
| Snapshot | `snapshotAt(repo, commitId)`: the exact resolved graph, frozen. |
| Verify | `verifyCommit(repo, id)` replays every patch from the root and checks each recorded hash. |
| Diff | `semanticDiff(a, b)`: added / removed / revised units and relations, changed fields, diff classes (claim content, evidence, inference, status, grounding, scope/context). |

Rules kept from the handoff:

- Revisions never overwrite: `applyPatch` copies, freezes and returns.
- A patch may declare `baseCommitRef`; committing on a different head fails.
- A `reviseUnit` cannot change `id` or `kind`.
- Merge (distributed) is not implemented in v0.1; branches exist so it can be.

Fixtures are histories, not snapshots: `fixtures/<case>/commits/NNNN-*.json`
are replayed in order, so a fixture always exercises revision and diff.
