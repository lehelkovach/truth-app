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

## Spec v1.1 (2026-09-17) reconciliation: the call

The v1.1 master spec supersedes the August handoff where they differ. It was
read against what this repo already had, and against what KnowShowGo `dev`
ships (`docs/KSG-LOGIC-IR-STATUS.md`). The decisions:

| # | Decision | Why |
|---|---|---|
| D12 | **Logic IR is KSG's v0.0.1 AST, mirrored byte-for-byte, not a new language.** `src/logic/ir.mjs` reproduces `knowshowgo/src/logic_ir/core.js`; `test/logic.test.mjs` proves identical canonical form, hash and rendering on vectors generated from KSG's module (`npm run vectors`). | Spec §6 and §23 phase 0: "extend; do not fork a competing IR". Same hash means a claim formalised here persists to KSG unchanged. |
| D13 | **The native evaluator lives here and evaluates over the snapshot; KSG's KG1 evaluates over the graph.** Both consume the same IR. Ours answers quantifiers because a snapshot is a closed, enumerable domain, and says so (`domain: 'snapshot'`); KSG's refuses them until KG4 because its domain would be a top-K sample. | Spec §7 (native deterministic evaluator, MVP) and §22.1 (facts, rules, derivations, provenance, UNKNOWN). Neither evaluator is canonical; both are projections over the same claims. |
| D14 | **Spec §6.1 "comparisons" are not added to the IR.** They would be a new node kind and therefore a fork. Proposed upstream as Logic IR v0.0.2 (`docs/OPEN_QUESTIONS.md`). | D12. |
| D15 | **Modality, context, population, time live on the claim (`proposition.context`, `modality`), never in the IR.** | KSG's rule "keep the dimensions separate" and the Logic IR non-goals (no modal / probabilistic / temporal operators). |
| D16 | **Grounding is exact label/alias only; ambiguity stops.** `resolveTerm` returns candidates and the compiler leaves the term ambiguous. No embedding similarity, no LLM pick. | Spec §5.3 and the KSG handoff §6: "semantic commitment is a separate operation". |
| D17 | **Equivocation is a grounding fact, not a rhetorical accusation.** W001 fires only when the same symbol is bound to two different concept ids inside one argument; W002 only across a declared attack. | Spec §5.4, §8.2. |
| D18 | **Diagnostics are colour plus explanation, and lifecycle / logical / argument / evidence / grounding / parser states are reported separately.** No aggregation into one label. | Spec §8.1, §17. |
| D19 | **Branches and forks are fixture directories** (`fixtures/<case>/branches/<name>/`), forked from `main@n`, and compare is semantic diff plus evaluation diff. Merge is still out of scope. | Spec §13, §19 "initial slice needs commits, history, compare, basic branches". |
| D20 | **The UI is a static page over a precomputed bundle.** `public/` has no build step; `truth bundle` writes everything it shows. Vite can wrap it later without changing the data contract. | Handoff §16 (no TypeScript, no build step for the core) and spec §14 "the UI is a projection". |
| D21 | **Not built yet, deliberately:** AI proposal layer (§9, phase 5), debate ingestion (§14), merge/pull requests (§19), Datalog/Prolog execution backends (§7; projections exist, execution does not), science/theory pages (§16). | Spec §23 order: deterministic path first, tested, then AI. |
