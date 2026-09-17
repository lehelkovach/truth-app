#!/usr/bin/env node
/** Static server for public/ (no dependencies). `node scripts/serve.mjs [port]` */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compose } from '../src/services/compose.mjs';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..', 'public');
const types = { '.html': 'text/html; charset=utf-8', '.mjs': 'text/javascript', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml' };
const port = Number(process.argv[2] ?? process.env.PORT ?? 8787);
const json = (res, code, body) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); };
const readBody = (req) => new Promise((resolve) => { let b = ''; req.on('data', (c) => { b += c; }); req.on('end', () => resolve(b)); });

createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  // The composer endpoint (spec §25 shape): text in, diagnostics with lines out. Nothing is stored.
  if (url.pathname === '/api/compose' && req.method === 'POST') {
    try {
      const { text } = JSON.parse(await readBody(req) || '{}');
      return json(res, 200, compose(String(text ?? '')));
    } catch (e) { return json(res, 400, { error: e.message }); }
  }
  if (url.pathname === '/api/compose/example') {
    try { res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' }); return res.end(await readFile(join(root, '..', 'fixtures', 'hermione', 'source', 'case.truth'))); } catch { res.writeHead(404); return res.end(''); }
  }
  const path = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, '');
  const file = join(root, path === '/' || path === '\\' ? 'index.html' : path);
  try {
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': types[extname(file)] ?? 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404); res.end('not found');
  }
}).listen(port, '127.0.0.1', () => console.log(`TruthApp UI at http://127.0.0.1:${port}/`));
