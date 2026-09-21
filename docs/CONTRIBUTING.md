# Contributing

- JavaScript ESM only. No TypeScript, no build step for the core.
- Every semantic behaviour gets a fixture and a test (`node --test test/*.test.mjs`).
- KSG access only through `src/adapters/ksg.mjs`.
- Changing the push path or the client pin? Run `npm run ksg:smoke` (hermetic).
  To check a real deployment, point it at one:
  `KSG_API_URL=... KSG_API_TOKEN=... npm run ksg:smoke` — same assertions, and it writes.
- Fixtures are histories: add a new `commits/NNNN-*.json`, never edit an
  earlier one (its hash is pinned in tests).
- Keep the fallacy catalogue conservative; add an entry only with a test the
  analyst can apply.
- Do not commit secrets. `.env` is ignored; `.env.example` lists names only.
