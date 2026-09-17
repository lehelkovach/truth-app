#!/usr/bin/env node
/** Build public/data/*.json for every fixture plus an index. */
import { copyFileSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
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
  const { store, project } = await loadFixture(join(root, 'fixtures', name));
  const bundle = buildBundle({ store, project });
  writeFileSync(join(out, `${name}.json`), JSON.stringify(bundle));
  projects.push({ file: `${name}.json`, id: project.id, title: project.title });
  console.log(`${name}: ${bundle.commits.length} commits, ${bundle.branches.length} branches`);
}
writeFileSync(join(out, 'index.json'), JSON.stringify({ projects }, null, 2));
