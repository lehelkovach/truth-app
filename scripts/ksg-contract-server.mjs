#!/usr/bin/env node
/**
 * A KnowShowGo server that speaks the v0.2.20 HTTP contract TruthApp's push
 * path depends on — enough of it, exactly as the real server shapes it, to run
 * `truth ksg-push --live` end to end without a production token.
 *
 * This is not a second fake. `createFakeKsgClient` in src/adapters/ksg.mjs
 * replaces the *client*, so the whole network path — client construction from
 * the environment, URL building, auth headers, JSON serialisation, HTTP status
 * handling, response parsing — is never exercised. This replaces the *server*,
 * so all of that runs for real and only the storage behind it is in memory.
 * Both decide prototype matches and inference with the same imported functions,
 * so they cannot drift apart.
 *
 * Surfaces served (paths as `@lehelkovach/knowshowgo-client` v0.2.20 calls them):
 *
 *   GET  /health
 *   GET  /api/release                          connect() release handshake
 *   POST /api2.0/seed/logic-ir-primitives      the ten seeded prototypes
 *   POST /api/objects/upsert                   object revisions with lineage
 *   POST /api2.0/prototype-matches/evaluate    prototype match decision
 *   POST /api2.0/logic-ir/infer                argument validity
 *   POST /api/assertions                       relations and commits
 *   POST /api/logic/syllogisms                 the compatibility syllogism graph
 *
 * Run standalone to push a fixture at it by hand:
 *
 *   node scripts/ksg-contract-server.mjs --port 8799 --token dev-token
 *   KSG_API_URL=http://127.0.0.1:8799 KSG_API_TOKEN=dev-token \
 *     node src/cli.mjs ksg-push fixtures/hermione --live
 */

import { createServer } from 'node:http';
import { LOGIC_IR_PRIMITIVES, matchDecision, propMap } from '../src/adapters/ksg.mjs';
import { inferArgument } from '../src/logic/infer.mjs';

const RELEASE = 'v0.2.20';

/** Surfaces this server serves, in the client's `clientContract` shape. */
const CLIENT_CONTRACT = [
  { method: 'GET', path: '/health' },
  { method: 'GET', path: '/api/release' },
  { method: 'POST', path: '/api2.0/seed/logic-ir-primitives' },
  { method: 'POST', path: '/api/objects/upsert' },
  { method: 'POST', path: '/api2.0/prototype-matches/evaluate' },
  { method: 'POST', path: '/api2.0/logic-ir/infer' },
  { method: 'POST', path: '/api/assertions' },
  { method: 'POST', path: '/api/logic/syllogisms' }
];

/** Deterministic uuid-shaped ids, so a failing run is reproducible. */
function uuidSeries(prefix) {
  let n = 0;
  return () => `${prefix}-0000-4000-8000-${String(++n).padStart(12, '0')}`;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (c) => { raw += c; });
    req.on('error', reject);
    req.on('end', () => {
      if (!raw) return resolve({});
      try { resolve(JSON.parse(raw)); } catch (e) { reject(e); }
    });
  });
}

/**
 * @param {object} [options]
 * @param {string} [options.release]  release the manifest advertises
 * @param {string} [options.channel]  channel the manifest advertises
 * @param {string|null} [options.requireToken] when set, every request outside
 *   /health and /api/release must carry `Authorization: Bearer <token>` or gets 401
 */
export function createKsgContractServer({ release = RELEASE, channel = 'release', requireToken = null } = {}) {
  const objects = new Map(); // uuid -> { uuid, ...body }
  const assertions = [];
  const syllogisms = [];
  const requests = []; // { method, path, authorization, owner, body }
  const protoUuidByName = new Map();
  const nameByProtoUuid = new Map();
  const nextObjectUuid = uuidSeries('0b1ec700');
  const nextProtoUuid = uuidSeries('9207074e');
  const nextAssertionId = uuidSeries('a55e4710');
  const nextSyllogismUuid = uuidSeries('5911091a');

  const server = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const path = url.pathname;
    const send = (status, payload) => {
      const body = JSON.stringify(payload);
      res.writeHead(status, { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) });
      res.end(body);
    };

    let body = {};
    try {
      body = req.method === 'POST' ? await readBody(req) : {};
    } catch {
      return send(400, { error: 'malformed JSON body' });
    }
    requests.push({ method: req.method, path, authorization: req.headers.authorization ?? null, owner: req.headers['x-ksg-owner'] ?? null, body });

    const open = path === '/health' || path === '/api/release';
    if (requireToken && !open && req.headers.authorization !== `Bearer ${requireToken}`) {
      return send(401, { error: 'missing or invalid bearer token' });
    }

    if (req.method === 'GET' && path === '/health') return send(200, { ok: true, release });

    if (req.method === 'GET' && path === '/api/release') {
      return send(200, {
        release,
        channel,
        api: { prefixes: { prototype: '/api2.0', topic: '/api2.0' }, publicBaseUrl: null },
        surfaces: { clientContract: CLIENT_CONTRACT }
      });
    }

    if (req.method === 'POST' && path === '/api2.0/seed/logic-ir-primitives') {
      const categories = LOGIC_IR_PRIMITIVES.map((name) => {
        if (!protoUuidByName.has(name)) {
          const uuid = nextProtoUuid();
          protoUuidByName.set(name, uuid);
          nameByProtoUuid.set(uuid, name);
        }
        return { name, categoryPrototypeUuid: protoUuidByName.get(name) };
      });
      return send(200, { ok: true, report: { categories } });
    }

    if (req.method === 'POST' && path === '/api/objects/upsert') {
      if (!body.title) return send(400, { error: 'title is required' });
      const uuid = nextObjectUuid();
      objects.set(uuid, { uuid, ...body });
      return send(200, { uuid, objectUuid: uuid, previousObjectUuid: body.previousObjectUuid ?? null });
    }

    if (req.method === 'POST' && path === '/api2.0/prototype-matches/evaluate') {
      const obj = objects.get(body.objectRevisionUuid);
      const prototype = nameByProtoUuid.get(body.prototypeRevisionUuid) ?? null;
      if (!obj) return send(404, { error: `no such object revision: ${body.objectRevisionUuid}` });
      if (!prototype) return send(404, { error: `no such prototype revision: ${body.prototypeRevisionUuid}` });
      return send(200, { decision: matchDecision(obj, prototype), prototype });
    }

    if (req.method === 'POST' && path === '/api2.0/logic-ir/infer') {
      const parse = (uuid) => {
        const p = propMap(objects.get(uuid) ?? {});
        let ir = null;
        let bindings = [];
        try { ir = p.logicIr ? JSON.parse(p.logicIr) : null; } catch { ir = null; }
        try { bindings = p.semanticBindings ? JSON.parse(p.semanticBindings) : []; } catch { bindings = []; }
        return { uuid, ir, bindings };
      };
      let premiseUuids = body.premiseRevisionUuids ?? [];
      let conclusionUuid = body.conclusionRevisionUuid ?? null;
      if (body.argumentRevisionUuid) {
        const p = propMap(objects.get(body.argumentRevisionUuid) ?? {});
        try { premiseUuids = p.premises ? JSON.parse(p.premises) : []; } catch { premiseUuids = []; }
        conclusionUuid = p.conclusion ?? null;
      }
      if (!conclusionUuid || !premiseUuids.length) return send(200, { decision: 'unresolved', rule: null });
      return send(200, inferArgument({ premises: premiseUuids.map(parse), conclusion: parse(conclusionUuid) }));
    }

    if (req.method === 'POST' && path === '/api/assertions') {
      const id = nextAssertionId();
      assertions.push({ id, ...body });
      return send(200, { id });
    }

    if (req.method === 'POST' && path === '/api/logic/syllogisms') {
      const uuid = nextSyllogismUuid();
      syllogisms.push({ uuid, ...body });
      return send(200, { uuid });
    }

    return send(404, { error: `no route: ${req.method} ${path}` });
  });

  return {
    server,
    objects,
    assertions,
    syllogisms,
    requests,
    protoUuidByName,
    /** Listen on an ephemeral port (or `port`) and resolve the base URL. */
    listen(port = 0, host = '127.0.0.1') {
      return new Promise((resolve) => {
        server.listen(port, host, () => resolve(`http://${host}:${server.address().port}`));
      });
    },
    /**
     * Close, dropping idle keep-alive sockets. The client pools connections,
     * so a plain `server.close()` waits on sockets nobody will use again and a
     * failing test hangs instead of reporting.
     */
    close() {
      return new Promise((resolve) => {
        server.close(resolve);
        server.closeIdleConnections?.();
        server.closeAllConnections?.();
      });
    },
    /** Objects written under a TruthApp unit id, oldest revision first. */
    byLineage(id) {
      return [...objects.values()].filter((o) => o.objectLineageKey === id);
    }
  };
}

// Standalone: node scripts/ksg-contract-server.mjs [--port N] [--token T]
if (import.meta.url === `file://${process.argv[1]}`) {
  const argv = process.argv.slice(2);
  const flag = (name, fallback) => {
    const i = argv.indexOf(`--${name}`);
    return i === -1 ? fallback : argv[i + 1];
  };
  const ksg = createKsgContractServer({ requireToken: flag('token', null) });
  const base = await ksg.listen(Number(flag('port', 8799)));
  console.log(`KSG contract server (${RELEASE}) on ${base}`);
  console.log(`  KSG_API_URL=${base}${flag('token', null) ? ` KSG_API_TOKEN=${flag('token', null)}` : ''} node src/cli.mjs ksg-push fixtures/hermione --live`);
}
