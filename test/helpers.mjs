import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = join(dirname(fileURLToPath(import.meta.url)), '..');
export const fixture = (name) => join(root, 'fixtures', name);

export const prov = { sourceType: 'fixture', sourceRef: 'test' };
export const claim = (id, extra = {}) => ({ id: `claim:${id}`, kind: 'claim', status: 'accepted', provenance: prov, text: `claim ${id}`, claimKind: 'empirical', modality: 'plausible', basis: 'assumption', ...extra });
export const argument = (id, premises, conclusion, extra = {}) => ({ id: `argument:${id}`, kind: 'argument', status: 'accepted', provenance: prov, title: `argument ${id}`, premiseRefs: premises.map((p) => `claim:${p}`), conclusionRef: `claim:${conclusion}`, scheme: 'deductive', warrant: 'because', ...extra });
export const attack = (id, from, to, operator = 'undercut', extra = {}) => ({ id: `rel:${id}`, operator, from: `argument:${from}`, to: `argument:${to}`, status: 'accepted', provenance: prov, ...extra });
export const patchOf = (ops, message = 'test patch') => ({ patchVersion: '0.1', message, operations: ops });
export const addUnit = (unit) => ({ op: 'addUnit', unit });
export const addRelation = (relation) => ({ op: 'addRelation', relation });
