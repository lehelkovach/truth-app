/**
 * Load a fixture project from disk: `project.json` plus ordered patch files
 * under `commits/`. Replays every patch into a fresh TruthStore, so a fixture
 * is a full semantic history, not just a snapshot.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createTruthStore } from '../services/truth-store.mjs';

export function readFixture(dir) {
  const project = JSON.parse(readFileSync(join(dir, 'project.json'), 'utf8'));
  const commitDir = join(dir, 'commits');
  const files = readdirSync(commitDir).filter((f) => f.endsWith('.json')).sort();
  const patches = files.map((f) => ({ file: f, patch: JSON.parse(readFileSync(join(commitDir, f), 'utf8')) }));
  return { project, patches };
}

export async function loadFixture(dir, { ksg = null, upTo = null } = {}) {
  const { project, patches } = readFixture(dir);
  const store = createTruthStore({ ksg, project });
  const commits = [];
  for (const { file, patch } of patches) {
    if (upTo !== null && commits.length >= upTo) break;
    commits.push(await store.commitPatch(patch, { authorRef: project.authorRef ?? 'actor:fixture', createdAt: patch.createdAt ?? project.createdAt ?? '2026-09-17T00:00:00Z', message: patch.message ?? file }));
  }
  return { store, project, commits };
}
