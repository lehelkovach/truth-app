#!/usr/bin/env node
/** Build public/data/*.json for every fixture project plus an index. */
import { copyFileSync, existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadFixture } from '../src/adapters/local-fixture-store.mjs';
import { buildBundle } from '../src/services/bundle.mjs';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const out = join(root, 'public', 'data');
mkdirSync(out, { recursive: true });
// Vendor the graph library so the page works offline (no CDN).
mkdirSync(join(root, 'public', 'vendor'), { recursive: true });
copyFileSync(join(root, 'node_modules', 'cytoscape', 'dist', 'cytoscape.min.js'), join(root, 'public', 'vendor', 'cytoscape.min.js'));
const projects = [];
for (const name of readdirSync(join(root, 'fixtures')).sort()) {
  const dir = join(root, 'fixtures', name);
  // Only fixture *projects* (project.json + commits/) become bundles; data-only
  // fixtures such as fixtures/translator (prose + provider responses) are skipped.
  if (!existsSync(join(dir, 'project.json')) || !existsSync(join(dir, 'commits'))) { console.log(`${name}: skipped (not a fixture project)`); continue; }
  const { store, project } = await loadFixture(dir);
  const bundle = buildBundle({ store, project });
  writeFileSync(join(out, `${name}.json`), JSON.stringify(bundle));
  projects.push({ file: `${name}.json`, id: project.id, title: project.title });
  console.log(`${name}: ${bundle.commits.length} commits, ${bundle.branches.length} branches`);
}
writeFileSync(join(out, 'index.json'), JSON.stringify({ projects }, null, 2));
