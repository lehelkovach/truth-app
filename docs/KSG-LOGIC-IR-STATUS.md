# KnowShowGo Logic IR: status against what TruthApp needs

Assessed 2026-09-17 against `lehelkovach/knowshowgo` `dev` (0.2.21-dev; `main` is
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

## What to build

### In TruthApp (this repo), in order

| # | Do | Closes when |
|---|---|---|
| T1 | On `ksg-push`, call `seed_logic_ir_primitives()` once and cache the prototype uuids by name | the adapter never writes an ad-hoc `category_name`; every unit is cast to a seeded prototype or to `Utterance` |
| T2 | Write claims as `Utterance` by default; as `Claim` when the TruthIR claim carries an `sop: { subject, predicate, object }` of Concept refs; as `Proposition` when it carries `logicIr` + `bindings`, using the same property names as `toObjectProperties` | `evaluatePrototypeMatch` returns `match` for a claim with IR and `no_match` (unresolved) for one without, and the decision is stored back on the TruthApp unit as an evaluation, not as a type |
| T3 | Add optional `logicIr`, `bindings`, `sop` to the TruthIR claim schema; validate `logicIr` against the R1 AST kinds and `bindings[].targetUuid` shape offline | schema test with one formalised claim and one plain claim |
| T4 | Write arguments as `Argument` with `premises` (JSON array of premise object uuids) and `conclusion` (concept_ref uuid), then call `evaluateLogicInference({ argumentRevisionUuid })` for arguments whose premises and conclusion all have IR; record `valid` / `invalid` / `unresolved` as a TruthApp evaluation beside the grounded label | the Socrates syllogism authored as a TruthApp case comes back `valid` from KSG; an AI-risk argument comes back `unresolved`, never `invalid` |
| T5 | Concept binding in the compact authoring format: `concepts: { human: "<uuid>" }` resolved at push time, with `truth ksg-push --bind` reporting unresolved symbols as E001 rather than silently writing an Utterance | the report shows which claims are formalisable and which are not |
| T6 | Store `modality`, `basis` and `claimKind` as plain properties on the KSG object, outside the IR | matches KSG's "keep the dimensions separate" rule; nothing is added to the IR |

T2 and T4 depend on the adapter writing units in dependency order (sources
and claims before arguments); that ordering fix is in this commit.

### In KSG / knowshowgo-client, to ask for on their ladder

| # | Repo | Do | Why TruthApp needs it |
|---|---|---|---|
| C1 | client | `evaluate_logic_ground()` for `/logic-ir/evaluate` and `get_derivations()` / `get_derivation()` for `/logic-ir/derivations` | TruthApp's inspector should show KSG's three-valued verdict and the derivation walk, through the client, not raw HTTP |
| C2 | client | `seed_logic_ir_primitives` already exists; add a `logic_ir_prototypes()` helper that returns the seeded uuids by name without re-seeding | avoids a seed call on every push |
| K1 | knowshowgo | K4 chat binder, or at minimum a `resolve_concept(term)` that returns candidates with AMBIGUOUS/UNRESOLVED status | replaces hand-written `concepts` maps in T5 |
| K2 | knowshowgo | IR4 attack relations | lets KSG hold the attack graph TruthApp evaluates, and lets a KSG derivation be cited as an undercut |
| K3 | knowshowgo | A documented place for modality on a Proposition object (a property, not an IR node) | TruthApp writes it under T6; KSG should say it is the convention |

Nothing above changes the Logic IR core. TruthApp consumes what exists; the
only server asks are the next rungs already on the KSG board.
