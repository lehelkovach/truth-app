# Architecture decisions (non-negotiable for v0.1)

Source: `TRUTHAPP_MASTER_HANDOFF_v1.0.md` (2026-08-07) and the KSG Truth
Foundation Logic IR handoff. Where this file and an older draft disagree, this
file and the master handoff control.

| # | Decision | Consequence |
|---|---|---|
| D1 | **JavaScript ESM, Node >= 18. No TypeScript.** | JSON Schema + AJV + JSDoc + fixtures are the contract. |
| D2 | **KnowShowGo is the durable store; `@lehelkovach/knowshowgo-client` is the only boundary.** | One adapter (`src/adapters/ksg.mjs`). No raw KSG HTTP anywhere else. No second SDK. |
| D3 | **TruthIR is canonical; UI, reports, LLM output and solver results are projections.** | Reports are regenerated from snapshots; nothing is edited in a report. |
| D4 | **Immutable revisions, content-hashed commits.** | `applyPatch` never mutates; `commit()` pins patch hash and snapshot hash. |
| D5 | **No universal truth score.** | Labels are accepted / rejected / undecided per argument, established / defeated / open per claim, plus findings. Never a scalar. |
| D6 | **Evaluators are replaceable and deterministic.** | Registry in `src/services/evaluator-registry.mjs`; each evaluation pins evaluator id + version + input commit. |
| D7 | **AI output is proposed, never accepted silently.** | No AI translator in this PR. When added, it emits a TruthPatch that must pass schema + review before commit. |
| D8 | **Fallacy detection is structural and conservative.** | Automated codes only for structure (modal overreach, circularity, unsourced evidence). Named fallacies are analyst annotations. |
| D9 | **No new database.** | Repository is in memory + fixture files on disk; persistence is KSG. |
| D10 | **Permissive ingestion, strict evaluation.** | A claim may exist with `basis: assumption` and no sources; the evaluator reports it, never silently drops it. |
| D11 | **No auth claims.** | Nothing multi-user is advertised until KSG server-enforced auth is verified (handoff §47). |

## Deviations recorded

- The handoff cites an "existing VSIR/TruthIR v0.1 schema" with frame/slot
  units. That schema was not available in any repository in scope, so
  `schema/truthir-profile-v0.1.schema.json` defines a flat profile with the
  same object types and relationship vocabulary. Mapping to frames is a
  mechanical wrap (`kind: frame`, one slot per field) and is logged in
  `docs/OPEN_QUESTIONS.md`.
- The grounded evaluator adds *premise support* on top of plain Dung
  semantics (derived claims need an accepted argument). Plain
  `evaluateGrounded({arguments, attacks})` still exists for the bare case.
