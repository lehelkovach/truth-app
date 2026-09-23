# AGENTS.md (truth-app)

Primary handoff: `TRUTHAPP_MASTER_HANDOFF_v1.0` (owner's design docs, 2026-08).
Decisions distilled in `docs/DECISIONS.md`; read that first, then
`docs/ARCHITECTURE.md`. Open items in `docs/OPEN_QUESTIONS.md`.

## Rules

- JavaScript ESM, Node >= 18, no TypeScript, no new database.
- KnowShowGo through `@lehelkovach/knowshowgo-client` only, via `src/adapters/ksg.mjs`.
  Pinned to a git tag (the package is not on npm); check `package.json`.
- No truth score. Labels + findings + provenance.
- AI output is a proposed patch, never an accepted commit.
- Every feature: fixture + test. `npm test` must be green before claiming done.
- Do not fake live KSG integration; the fake client is for tests, `--live` is explicit.

## Commands

```bash
npm ci
npm test                                   # node --test test/
node src/cli.mjs demo fixtures/ai-risk     # validate, history, verify, evaluate, diff
node src/cli.mjs report fixtures/ai-risk --format html --out out/ai-risk.html
node src/cli.mjs ksg-push fixtures/ai-risk # fake client; add --live with KSG_API_URL set
node src/cli.mjs compare fixtures/hermione main repair
node src/cli.mjs logic fixtures/hermione   # Logic IR + Prolog projection per claim
npm run serve                              # bundles + static UI + POST /api/compose on http://127.0.0.1:8787
node src/cli.mjs compose fixtures/hermione/source/case.truth --show   # the composer from the terminal
npm run vectors                            # regenerate Logic IR parity vectors from ../knowshowgo
```

`src/logic/ir.mjs` must stay byte-compatible with `knowshowgo/src/logic_ir/core.js`;
`test/logic.test.mjs` LOGIC-000 enforces it. Never add a node kind here.

## Layout

See `docs/ARCHITECTURE.md`. Fixtures under `fixtures/<case>/commits/` are
replayed in order; `fixtures/<case>/source/case.json` is the compact authoring
form and a test keeps it in sync with the first commit.

## Continuity

- Stable startup and verification steps live in `.AGENT/RUNBOOK.md`.
- If work must cross sessions before a PR exists, copy
  `.AGENT/handoffs/HANDOFF-TEMPLATE.md` to `.AGENT/handoffs/<issue>-<task>.md` on the task
  branch, and delete it once the issue or PR carries the state.
