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
```

## Layout

See `docs/ARCHITECTURE.md`. Fixtures under `fixtures/<case>/commits/` are
replayed in order; `fixtures/<case>/source/case.json` is the compact authoring
form and a test keeps it in sync with the first commit.
