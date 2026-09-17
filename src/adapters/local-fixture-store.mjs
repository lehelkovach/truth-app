/**
 * Load a fixture project from disk: `project.json` plus ordered patch files
 * under `commits/`. Replays every patch into a fresh TruthStore, so a fixture
 * is a full semantic history, not just a snapshot.
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createTruthStore } from '../services/truth-store.mjs';

export function readFixture(dir) {
  const project = JSON.parse(readFileSync(join(dir, 'project.json'), 'utf8'));
  const commitDir = join(dir, 'commits');
  const files = readdirSync(commitDir).filter((f) => f.endsWith('.json')).sort();
  const patches = files.map((f) => ({ file: f, patch: JSON.parse(readFileSync(join(commitDir, f), 'utf8')) }));
  const branches = [];
  const branchDir = join(dir, 'branches');
  if (existsSync(branchDir)) {
    for (const name of readdirSync(branchDir).sort()) {
      const bdir = join(branchDir, name);
      const meta = JSON.parse(readFileSync(join(bdir, 'branch.json'), 'utf8'));
      const bfiles = readdirSync(bdir).filter((f) => f.endsWith('.json') && f !== 'branch.json').sort();
      branches.push({ name: meta.name ?? name, from: meta.from, description: meta.description ?? '', patches: bfiles.map((f) => ({ file: f, patch: JSON.parse(readFileSync(join(bdir, f), 'utf8')) })) });
    }
  }
  return { project, patches, branches };
}

export async function loadFixture(dir, { ksg = null, upTo = null } = {}) {
  const { project, patches, branches } = readFixture(dir);
  const store = createTruthStore({ ksg, project });
  const commits = [];
  for (const { file, patch } of patches) {
    if (upTo !== null && commits.length >= upTo) break;
    commits.push(await store.commitPatch(patch, { authorRef: project.authorRef ?? 'actor:fixture', createdAt: patch.createdAt ?? project.createdAt ?? '2026-09-17T00:00:00Z', message: patch.message ?? file }));
  }
  const branchCommits = {};
  if (upTo === null) {
    for (const b of branches) {
      // `from` is `main@n` (or any ref); a fork keeps the parent's history.
      store.createBranch(b.name, b.from ?? 'main');
      branchCommits[b.name] = [];
      for (const { file, patch } of b.patches) {
        branchCommits[b.name].push(await store.commitPatch(patch, { branch: b.name, authorRef: patch.authorRef ?? project.authorRef ?? 'actor:fixture', createdAt: patch.createdAt ?? project.createdAt ?? '2026-09-17T00:00:00Z', message: patch.message ?? file }));
      }
    }
  }
  return { store, project, commits, branches: branchCommits };
}
