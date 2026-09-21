# Architecture

```
source material (debate, paper, conversation, manual authoring)
        │
        ▼
compact case (fixtures/<case>/source/case.json)  ──compileCase──▶  TruthPatch
        │                                                             │
        ▼                                                             ▼
   AJV schema validation  +  referential invariants  (src/domain/validate.mjs)
        │
        ▼
   applyPatch  →  immutable snapshot  →  commit (content-hashed, parent-linked)
        │                                        │
        │                                        ├──▶ semantic diff between commits
        │                                        └──▶ KSG adapter (mirror units/relations/commit)
        ▼
   evaluator registry  →  grounded argumentation  →  Evaluation artifact (pins commit + evaluator)
        │
        ▼
   projections: Markdown / HTML report, CLI, (next PR) graph UI
```

## Modules

| Path | Owns |
|---|---|
| `schema/` | TruthIR profile, TruthPatch, TruthCommit JSON Schemas (draft-07). |
| `src/domain/ids.mjs` | `kind:name` references. |
| `src/domain/canonicalize.mjs` | Canonical JSON, `sha256:` content hashes, deep freeze. |
| `src/domain/validate.mjs` | AJV validators plus invariants (refs resolve, premise kinds, undermine targets). |
| `src/domain/truth-patch.mjs` | Pure `applyPatch`; per-unit revision counters and hashes. |
| `src/domain/commit.mjs` | Repository, commits, branches, history, `verifyCommit`. |
| `src/domain/semantic-diff.mjs` | Added / removed / revised with diff classes. |
| `src/domain/argumentation.mjs` | `evaluateGrounded`, `evaluateSnapshot`, structural findings. |
| `src/domain/fallacies.mjs` | Fallacy catalogue (name, category, definition, test). |
| `src/domain/evaluation.mjs` | Evaluation artifact with pinned provenance. |
| `src/domain/authoring.mjs` | Compact case → TruthPatch compiler. |
| `src/services/truth-store.mjs` | `createTruthStore({ ksg })`: commitPatch, getSnapshot, diff, evaluate, explainUnit, getEvidence, listHistory. |
| `src/services/evaluator-registry.mjs` | Pluggable evaluators. |
| `src/adapters/ksg.mjs` | The one KnowShowGo boundary, plus a deterministic fake client. |
| `src/adapters/local-fixture-store.mjs` | Replay `fixtures/<name>/commits/*.json` into a store. |
| `src/report/` | Markdown and HTML projections. |
| `src/cli.mjs` | `truth validate | evaluate | report | history | diff | verify | compile | fallacies | ksg-push | demo`. |

## Evaluation semantics

Grounded labelling (Dung 1995), extended with premise support:

- An argument is **accepted** when every attacker is rejected and every
  premise is established.
- **Rejected** when some attacker is accepted or some premise is defeated.
- **Undecided** otherwise (mutual rebuttal, odd cycles).
- A claim with `basis` evidence / definition / assumption is **established**
  unless an argument using it is undermined; a `derived` claim is
  established when some argument concluding it is accepted, **defeated** when
  every such argument is rejected, **open** while any is undecided.

Attack relations: `rebut` (conclusion), `undercut` (inference), `undermine`
(a named premise; `to: "argument:*"` expands to every argument using it).
`rebut` is symmetric: contrary conclusions attack each other, so the evaluator
mirrors an authored rebut with a derived reverse edge (`derived: true`,
`derivedFrom: <relation id>`) unless both directions are authored. Derived
edges appear in `evaluation.edges` and the reports (marked *implied*), count as
an attack for `UNCONTESTED`, and are never written to the snapshot or mirrored
to KSG. `undercut` and `undermine` stay directed (D22).
`supports`, `qualifies`, `cites`, `tested_by`, `replicates` and the rest of the
vocabulary are recorded and shown but do not move labels.

Structural findings (automated, conservative):

| Code | Meaning |
|---|---|
| `MODAL_OVERREACH` | Conclusion asserted more strongly than the weakest premise (major for deductive or a two-step gap). |
| `CIRCULAR` | The support chain for a conclusion returns to itself. |
| `UNSOURCED_PREMISE` | `basis: evidence` with no sources (major); unsourced assumption in use (info). |
| `DERIVED_UNSUPPORTED` | A derived claim with no argument for it. |
| `UNCONTESTED` | A standing argument nobody has attacked: where the other side should push next. |
| `STANDOFF` | Mutual rebuttal (authored one way or both) with neither side defeated. |
| `NO_WARRANT` | Argument does not say why premises support the conclusion. |
| `UNKNOWN_FALLACY` | Annotation names a fallacy outside the catalogue. |

Modalities record how strongly the *proponent* asserts a claim
(speculative < possible < plausible < probable < certain). They are not the
analyst's belief and not a probability.

## KnowShowGo mapping

| TruthApp | KSG call | Notes |
|---|---|---|
| unit revision | `upsert_object` | `category_name = kind`, `object_lineage_key = unit id`, `previous_object_uuid` = prior revision. |
| argument | also `create_syllogism` | premises / conclusion texts with ids. |
| relation | `create_assertion` | subject = from, predicate = operator, obj = to, `prev_assertion_id` chains revisions. |
| commit | `create_assertion` | `commit:… commits repo:…` with hashes in provenance. |
| unit → prototype | `upsert_object({ category_prototype_uuid })` | concept → Concept, claim → Proposition / Claim / Utterance (by `formalizeClaim`), argument → Argument; domain units keep `category_name`. |
| classify | `evaluatePrototypeMatch` | recorded in `matches` as an evaluation, never a stored type. |
| argument validity | `evaluateLogicInference({ argumentRevisionUuid })` | recorded in `inferences`: valid / invalid / unresolved. |
| contract | `connect({ expected_release })` | mismatch fails closed (KSG-003). |

## Native logic (src/logic)

| File | Owns |
|---|---|
| `ir.mjs` | Mirror of KSG Logic IR v0.0.1: AST, `validate` (E004–E006), `inspectBindings` (E001–E003), `canonicalize`, `hashIr`, `render`. Parity-tested against KSG vectors. |
| `text.mjs` | Authoring syntax (`forall x: mammal(x) -> warm_blooded(x)`) → IR; IR → Prolog / Datalog projections. |
| `kb.mjs` | Claim → expression (`logicIr`, else `proposition` roles → one predicate), grounding state from `terms`, KB of facts and rules with claim provenance. |
| `evaluate.mjs` | Bounded forward chaining (UMP, MP, conjunction), Kleene three-valued evaluation with quantifiers over the snapshot's entities, `entails(argument)` → entailed / contradicted / not_entailed / outside_coverage with a proof trace and a missing-condition hint. |
| `infer.mjs` | Byte-faithful mirror of KSG `infer.js`: `inferArgument` (universal modus ponens, modus ponens, hypothetical syllogism, reiteration) → valid / invalid / unresolved. Parity-tested; the fake KSG client decides through it. |
| `formalize.mjs` | Shapes a claim for KSG's `Proposition` / `Claim` prototypes (the property names KSG's matcher reads) and remaps local `concept:` refs in `logicIr` / `terms` to KSG object uuids. |

Results carry `evaluator: logic.native@0.1.0`, the claims checked, the proof
steps and the domain used, so every green or red can be re-derived.

## Grounding and diagnostics (src/domain)

| File | Owns |
|---|---|
| `grounding.mjs` | `resolveTerm` (exact/alias, stop on ambiguity), `groundingReport`, `equivocations` (W001 within an argument, W002 across an attack), `conceptUsage` (where used, which arguments a regrounding touches, competing senses). |
| `diagnostics.mjs` | `buildDiagnostics`: every argument label, native logic result, grounding state, structural finding and evidence check becomes `{ state: green|yellow|red, code, target, evaluator, scope, message, explanation: { detected, why, checked, options, proof?, missingCondition? } }`. `dimensions`: lifecycle / logical / argument / evidence / grounding / parser per unit. |

## UI (public/)

`truth bundle <fixture>` (or `npm run bundles`) writes `public/data/<name>.json`
with every commit's snapshot, evaluation, logic projections and diffs, plus
branch compares. `public/app.mjs` renders issue, history, graph (Cytoscape from
cdnjs), arguments, diagnostics, logic table, concepts and compare, with an
inspector that shows the exact unit, its dimensions, grounding, logic, sources,
revision and diagnostics. `npm run serve` builds bundles and serves on 8787.

## Composer (src/services/compose.mjs)

`parseComposer(text)` reads the line-based subset in `docs/COMPOSER.md` into
the compact case shape plus a span per statement; `compose(text)` runs
compile → schema → invariants → commit on a throwaway store → evaluate and
returns every diagnostic with the line it belongs to. `scripts/serve.mjs`
exposes it as `POST /api/compose`; `truth compose` runs it from the CLI. The
editor in `public/` is a textarea, a gutter and a review pane with underlines;
it holds no logic of its own.

## What is not here yet

Proposal-review flow and AI translator, debate ingestion, merge / pull
requests, Datalog or Prolog *execution* (projections only), science and theory
pages, KSG-side casting of units to the seeded prototypes (T1–T6 in
`KSG-LOGIC-IR-STATUS.md`). See `docs/ROADMAP.md`.
