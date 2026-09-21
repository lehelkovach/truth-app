# KnowShowGo Logic IR: status against what TruthApp needs

Assessed 2026-09-17, re-audited 2026-09-21, against `lehelkovach/knowshowgo` `dev` (0.2.21-dev; `main` is
0.2.20 and carries the same Logic IR code) and `knowshowgo-client` v0.2.20.
Source of truth for the ladder: `knowshowgo/docs/DEVELOPMENT-PLAN.md` v7.2.1.

## Verdict

**Yes: KSG has a propositional object, and the Logic IR v0.0.1 handoff is
complete.** `Proposition` is a seeded prototype with a match contract, backed
by a pure Logic IR module with validation, canonical hashing, rendering,
diagnostics, persistence and provenance, and an inference core on top. Every
acceptance criterion in the Logic IR v0.0.1 handoff has a green test.

**What is not sufficient yet is the bridge from TruthApp's claims to that
object.** A KSG `Proposition` requires a resolved first-order expression whose
material symbols are bound to Concept uuids. TruthApp's claims are surface
text with a modality and a basis, and most of the AI-risk claims are modal,
probabilistic, normative or temporal, which Logic IR v0.0.1 deliberately does
not express. So today a TruthApp claim can land in KSG as an `Utterance`
(always), as a `Claim` (when it has a subject/predicate/object triple bound
to Concepts), and as a `Proposition` only when someone has written its Logic
IR and bindings. The work is listed under "What to build".

## What exists in KSG (verified in code and tests)

| Rung | Surface | State |
|---|---|---|
| R0 | `POST /api2.0/prototype-matches/evaluate`, `/list`, `/cast`; revision-pinned prototype match with hard/soft constraints | ✅ shipped, client wrappers exist |
| R1 | `src/logic_ir/core.js`: AST `ConceptRef EntityRef Variable Predicate Not And Or Implies ForAll Exists`, `validate`, `canonicalize`, `serialize`, `hashIr`, `render`, `inspectBindings` (RESOLVED / UNRESOLVED / AMBIGUOUS / CONFLICTING), `strictEvaluate` (well-formed, not true), diagnostics E001–E006, `toObjectProperties` / `fromObjectSnapshot` persistence | ✅ `tests/dev-ladder/r1-logic-ir.test.js` incl. round trip, God-unresolved, binding change makes a new revision |
| R1 | `POST /api2.0/seed/logic-ir-primitives`: prototypes `Concept`, `Utterance`, `Proposition`, `Claim`, `Premise`, `Conclusion`, `Inference`, `Argument`, `Rule`, `Derivation` | ✅ `r1-primitive-prototypes.test.js` |
| R2 | `src/logic_ir/infer.js`: universal modus ponens, modus ponens, hypothetical syllogism, reiteration; `POST /api2.0/logic-ir/infer` by premise/conclusion uuids or by `argumentRevisionUuid` (reads `premises` / `conclusion` properties or `has_premise` / `has_conclusion` edges) | ✅ `r2-inference.test.js`; `npm run dogfood:inference` prints `R2 INFERENCE PASS` |
| KG1 | `POST /api2.0/logic-ir/evaluate`: three-valued ground evaluation of `∧ ∨ ¬ →` over stored claims, names the claim uuids consulted; quantifiers refused until KG4 | ✅ 27 cases |
| KG2 | `record: true` on infer/evaluate persists a `Derivation` with `derived_from` / `used_rule` / `derives` edges; `GET /api2.0/logic-ir/derivations[?conclusion=]` | ✅ 10 cases incl. restart |

The `Proposition` contract, as the matcher evaluates it
(`src/prototype/prototype_match_service.js`):

| Constraint | Passes when |
|---|---|
| `has_semantic_expression` (hard) | `semanticExpression` or `logicIr` property present |
| `has_truth_conditions` (hard) | `truthConditions` present |
| `required_material_symbols_resolved` (hard) | every binding in `semanticBindings` / `materialSymbols` is RESOLVED |
| `structurally_well_formed` (hard) | `structurallyWellFormed === 'true'` or the IR has a `kind` |
| `declarative_proposition_like` (soft) | text is not a question |
| `semantic_coherence` (soft) | expression present, or an explicit score |

`toObjectProperties({ sourceText, ir, bindings, provenance })` writes exactly
those properties, so a caller never fills them by hand.

## What is still open in KSG (from the plan, with what it means for TruthApp)

| Rung | What | Effect on TruthApp |
|---|---|---|
| KG4 | Exhaustive quantifier domain enumeration | `evaluate` refuses `∀`/`∃` today; inference (`infer`) is unaffected |
| KG3 | Rules as graph objects with lineage and enabled flag | none now |
| K4 | Chat binder: term → uuid → prototype match → assertion proposal | this is the missing binding step; until it exists TruthApp must supply bindings itself |
| IR3 | Equivocation W001 | TruthApp keeps its manual `equivocation` annotations |
| IR4 | SUPPORTS / REBUTS / UNDERCUTS as KSG relations naming derivations | TruthApp labels locally (grounded semantics) and writes attacks as plain assertions; unblocked now that KG2 shipped |
| IR5 | Semantic commit / diff / branch in the graph | TruthApp has it locally; commits are mirrored as assertions |
| IR6 | Evidence / source graph | TruthApp `source` / `evidence` units are plain objects |
| IR8 | AI source → Logic IR compiler (LLM proposes, humans validate) | TruthApp's translator (its PR 3) is the client side of this |

Explicit Logic IR non-goals that TruthApp claims run into: probability,
modal, temporal, deontic and causal operators. Per the handoff these belong to
later rungs and backends, and TruthApp should not push them into the IR.

Client gaps (knowshowgo-client v0.2.20): no wrappers yet for
`POST /logic-ir/evaluate` and `GET /logic-ir/derivations`. The KSG plan says
KG1/KG2 need a client pair before anyone depends on them.

## Stack audit (2026-09-21)

- **KSG server `dev` unchanged** since the 2026-09-17 assessment (tip
  `0df726f`); `dev` is 72 commits ahead of `main`. No new Logic IR server
  features to reconcile.
- **The surfaces TruthApp's adapter uses are in the released `v0.2.20`**
  (prod / `api.knowshowgo.com`): `/seed/logic-ir-primitives`,
  `/prototype-matches/evaluate`, `/logic-ir/infer`, and the matching client
  methods in `v0.2.20-client`. So `ksg-push --live` against prod is a real,
  finishable verification — it needs only a reachable server and a token, not
  an unreleased feature.
- **KG1 ground evaluation and KG2 derivations are `dev`-only.** The server
  endpoints (`/logic-ir/evaluate`, `/logic-ir/derivations`) and the client
  wrappers (`evaluateLogicIr`, `explainDerivation`, `listDerivations`) exist
  on both `dev` branches (client `0.2.21-dev`) but are **absent from
  `v0.2.20` and prod**. C1 below is therefore satisfied on `dev`, pending a
  release.
- **Nothing was merged into TruthApp by anyone else**; the only truth-app
  branch is `claude/truth-app-ai-safety-lb3lhe`. iac-bus is parked at M0 and
  osl-oc-agent's recent work is unrelated to TruthApp.

## What to build

### In TruthApp (this repo), in order

| # | Do | Closes when |
|---|---|---|
| T1 | ✅ `ensurePrototypes()` seeds once and caches the prototype uuids by name; concepts, claims and arguments cast to seeded prototypes, domain units (issue/position/source/evidence/hypothesis/theory/annotation/actor) keep a TruthApp `category_name` under `TruthUnit` | done in this branch |
| T2 | ✅ `formalizeClaim` casts a claim to `Proposition` when its `logicIr` validates and every term resolves, to `Claim` when it has an sop (`proposition.roles`), else `Utterance`; property names match KSG's `toObjectProperties`. After each cast the adapter calls `evaluatePrototypeMatch` and records the decision in `matches` (an evaluation, not a stored type) | done; `matches` shows `Proposition:match` for an IR claim and `Utterance:...` for one with an unresolved term |
| T3 | ✅ Optional `logicIr`, `terms` (bindings) and `proposition` on the TruthIR claim schema; `logicIr` validated offline with a byte-compatible mirror of KSG's validator (`src/logic/ir.mjs`, parity vectors in `test/vectors/`) | done in this branch; `sop` is expressed as `proposition.roles` |
| T4 | ✅ Arguments cast to `Argument` with `premises` (JSON array of premise object uuids) and `conclusion` (concept_ref); the adapter calls `evaluateLogicInference({ argumentRevisionUuid })` and records the decision in `inferences`. The inference core is mirrored byte-faithfully (`src/logic/infer.mjs`, vectors in `test/vectors/infer-ksg.json`) so the fake client decides what the server would | done; hermione's syllogism → `valid`, every AI-risk argument → `unresolved` (never `invalid`), a not-entailed grounded argument → `invalid` |
| T5 | ✅ Concepts are written first and their KSG uuids grounds every `concept:` ref in a claim's `logicIr` and `terms` (`remapRefs`); `ksgRef` overrides. `truth ksg-push` prints the cast breakdown, KSG inference counts, and unresolved terms (E001); `--verbose` lists them | done |
| T6 | ✅ `modality`, `basis`, `claimKind`, `positionRef` are plain properties on the KSG object, outside the IR | done |

All of T1–T6 landed on branch `claude/truth-app-ai-safety-lb3lhe`. What is
**not** done is a live round-trip: `truth ksg-push --live` builds a real
client from `KSG_API_URL` / `KSG_API_TOKEN` and runs the same path, but it
has not been exercised against a running KSG server from here. The offline
fake models the prototype-match and inference contracts faithfully, so the
wiring is proven; only the network hop is unverified.

### In KSG / knowshowgo-client, to ask for on their ladder

| # | Repo | Do | Why TruthApp needs it |
|---|---|---|---|
| C1 | client | ✅ **landed on `dev` (0.2.21-dev), not yet released.** `evaluateLogicIr` / `evaluate_logic_ir` (three-valued KG1 ground evaluation, `record` for KG2), `explainDerivation` / `explain_derivation`, `listDerivations` / `list_derivations`. Backed by KSG server `/api2.0/logic-ir/evaluate` and `/logic-ir/derivations`, also `dev`-only | TruthApp's inspector should show KSG's three-valued verdict and the derivation walk. Adopt when the client cuts a release past `v0.2.20-client`, or by pinning the `dev` channel |
| C2 | client | `seed_logic_ir_primitives` already exists; add a `logic_ir_prototypes()` helper that returns the seeded uuids by name without re-seeding | avoids a seed call on every push |
| K1 | knowshowgo | K4 chat binder, or at minimum a `resolve_concept(term)` that returns candidates with AMBIGUOUS/UNRESOLVED status | replaces hand-written `concepts` maps in T5 |
| K2 | knowshowgo | IR4 attack relations | lets KSG hold the attack graph TruthApp evaluates, and lets a KSG derivation be cited as an undercut |
| K3 | knowshowgo | A documented place for modality on a Proposition object (a property, not an IR node) | TruthApp writes it under T6; KSG should say it is the convention |

Nothing above changes the Logic IR core. TruthApp consumes what exists; the
only server asks are the next rungs already on the KSG board.
