# TruthApp

**An open-source, version-controlled reasoning workbench.** TruthApp
represents claims, arguments, evidence, hypotheses and attacks as inspectable
semantic data with provenance, immutable revisions and pluggable, deterministic
evaluators. It stores durable knowledge in [KnowShowGo](https://github.com/lehelkovach/knowshowgo)
through [`@lehelkovach/knowshowgo-client`](https://github.com/lehelkovach/knowshowgo-client).

It is not a chatbot, a fact-checking feed, a debate-scoring site, and it never
produces a single "truth score".

> Truth does not score speakers. It evaluates reasoning.

## Use this when

- A debate hides disagreement about premises and you want the premises out in
  the open, one per line, with who asserts them and how strongly.
- You want to know *where* an argument breaks (a premise, the inference, or the
  conclusion) rather than whether it "wins".
- You want to revise a position over time and see exactly what changed and
  what it did to the conclusions.

## Do not use this when

- You want a probability that a claim is true. Labels here are
  accepted / rejected / undecided per argument and established / defeated /
  open per claim, plus named findings. That is deliberate.
- You want an LLM to decide. AI output can only ever *propose* a patch that a
  person reviews and commits (not in this release yet).

## Quick start

```bash
git clone https://github.com/lehelkovach/truth-app && cd truth-app
npm ci                                  # Node >= 18, ESM, no build step
npm test

node src/cli.mjs demo fixtures/ai-risk  # validate → history → verify → evaluate → diff
node src/cli.mjs report fixtures/ai-risk --format html --out out/ai-risk.html
```

`truth evaluate` on the AI-risk fixture prints, for every argument, whether
it stands, is defeated or is contested, and *why* (which attacker or which
defeated premise), followed by the automated findings:

```
thesis claim:S12: established

  defeated  argument:A1   [risk]    Misaligned superintelligence will seek power  — attacked by accepted argument:B11
  stands    argument:A3   [risk]    Shutdown resistance  — all attackers rejected (argument:B1)
  ...
findings:
  major MODAL_OVERREACH  argument:A5  conclusion claim:P11 is asserted as 'certain' but the weakest premise (claim:P5, claim:P10) is only 'probable' (deductive scheme)
```

## The demo case: is AI an existential threat?

`fixtures/ai-risk` encodes the existential-risk case in the strongest form its
proponents give it (orthogonality and instrumental convergence, intelligence
explosion, one-shot alignment, expected value, lab scheming evidence,
timelines, expert authority, mass unemployment), the author's counter-case,
and the risk side's best replies to that counter-case. Every claim records
the modality **as its proponent asserts it** and cites its source. Twelve
fallacy annotations are attached, on both sides, each with the catalogue test
that justifies it.

Two commits are in the fixture. The first authors the case; the second enters
the risk side's reply to the "takeoff is bounded" argument. `truth diff`
shows the three units and one relation added, and `truth evaluate --commit 2`
shows the intelligence-explosion chain flipping from defeated to standing
while the thesis still stands, because the extinction conclusion also depends
on the power-seeking argument, which remains defeated. The `UNCONTESTED`
findings then tell the author exactly where to reply next.

See [`docs/CASE_AUTHORING.md`](docs/CASE_AUTHORING.md) for the method.

## What the evaluators say, and what they do not

Every argument gets separate answers, each under a named evaluator, and the
UI shows them side by side rather than folding them into one score:

| Dimension | Values | From |
|---|---|---|
| Argument state | stands / defeated / contested | grounded argumentation over declared attacks |
| Logical result | entailed / not entailed / contradicted / outside coverage | native evaluator over KnowShowGo Logic IR, with a proof or a missing condition |
| Grounding | resolved / ambiguous / unresolved | exact label or alias match to concepts; ambiguity stops |
| Evidence | present / missing / retracted | source presence, not source quality |
| Lifecycle, parser | proposed / accepted / retracted; human / imported / AI-proposed | the unit's own status and provenance |

Diagnostics are red, yellow or green **with an explanation**: what was
detected, why it matters, what was checked, and what you can do. A red
"conclusion does not follow" names the missing condition; a red equivocation
names both concept senses and the claims that use each.

`fixtures/hermione` is the spec's own example. Its second commit adds an
argument whose conclusion does not follow; the `repair` branch adds the
missing premise, and `truth compare fixtures/hermione main repair` prints:

```
+ claim:C7 (claim)
~ argument:A2 (argument) premiseRefs, warrant [inference]
EVALUATION argument:A2 [logical logic.native]: not_entailed → entailed
DIAGNOSTICS red 1→0 · yellow 2→3 · green 9→11
```

In the AI-risk case, "intelligence" is grounded to two senses (task
competence in the timelines premise, goal-directed agency in the
instrumental-convergence premise) and the evaluator flags the orthogonality
argument for equivocation on its own; the `regrounded` branch shows what
changes when the premise is restated in one sense.

## UI

```bash
npm run serve     # builds public/data/*.json from every fixture, serves http://127.0.0.1:8787
```

A static page with issue, history, graph, arguments, diagnostics, logic,
concepts and compare panels, and an inspector for any node. It renders a
precomputed bundle and computes nothing itself.

## How it works

```
compact case → TruthPatch → AJV + invariants → immutable snapshot → commit
                                                       │
                     evaluator (grounded argumentation) ┼→ Evaluation (pins commit + evaluator)
                                                       │
                     KSG adapter (knowshowgo-client) ───┘→ objects, assertions, syllogisms
```

- **TruthIR profile** (`schema/`): units (issue, position, claim, argument,
  evidence, source, assumption, hypothesis, theory, annotation, actor) and
  relations (supports, rebut, undercut, undermine, qualifies, cites, …).
- **Semantic version control** (`src/domain/commit.mjs`): content-hashed
  commits, per-unit revisions, branches, history, `verify`, semantic diff with
  diff classes.
- **Evaluation** (`src/domain/argumentation.mjs`): grounded semantics with
  premise support; structural findings (modal overreach, circularity,
  unsourced evidence, uncontested arguments, standoffs).
- **Logic** (`src/logic/`): a byte-compatible mirror of KnowShowGo's Logic IR
  v0.0.1, an authoring syntax, Prolog and Datalog projections, and a native
  evaluator (forward chaining, three-valued, quantifiers over the snapshot,
  proofs).
- **Grounding and diagnostics** (`src/domain/grounding.mjs`,
  `src/domain/diagnostics.mjs`): concept handles, exact/alias resolution,
  equivocation detection, explained red/yellow/green diagnostics, status
  dimensions.
- **KnowShowGo** (`src/adapters/ksg.mjs`): the only boundary; units become
  objects with lineage, relations become assertions with `prev_assertion_id`
  chains, commits become assertions. `truth ksg-push` uses a deterministic fake
  client unless you pass `--live` with `KSG_API_URL` set.

Full details: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md),
[`docs/TRUTHIR_PROFILE.md`](docs/TRUTHIR_PROFILE.md),
[`docs/SEMANTIC_VERSIONING.md`](docs/SEMANTIC_VERSIONING.md),
[`docs/DECISIONS.md`](docs/DECISIONS.md).

## Commands

| Command | Does |
|---|---|
| `truth validate <fixture\|patch.json>` | Schema + referential invariants. |
| `truth evaluate <fixture> [--commit N] [--json] [--quiet]` | Labels, derivations, findings. |
| `truth report <fixture> [--format md\|html] [--out F]` | Full projection incl. history and diff. |
| `truth history <fixture>` | Commits with hashes. |
| `truth diff <fixture> [--from N] [--to N]` | Semantic diff. |
| `truth verify <fixture>` | Replay and re-hash every commit. |
| `truth compile <case.json> --out patch.json` | Compact case → TruthPatch. |
| `truth fallacies [-v]` | Catalogue with tests. |
| `truth ksg-push <fixture> [--live] [--expect-release vX]` | Mirror into KnowShowGo. |
| `truth compare <fixture> <ref> <ref>` | Semantic diff plus evaluation diff between branches or commits (`main`, `repair@1`, commit id). |
| `truth logic <fixture> [claim]` | Logic IR rendering and Prolog projection per claim. |
| `truth concept <fixture> [concept]` | Where a concept is used, which arguments a regrounding touches, competing senses. |
| `truth bundle <fixture> --out F` | Precomputed bundle for the UI. |
| `truth demo <fixture>` | All of the above in order. |

`truth` is `node src/cli.mjs` (or `npx truth` after `npm link`).

## Status and non-goals (v0.1)

Done in this release: schemas, hashing, patch/revision/commit/diff, grounded
evaluator, KSG Logic IR mirror with parity tests, native logic evaluator,
concept grounding and equivocation, explained diagnostics, fixture branches
and compare, KSG adapter with contract check, three fixtures, CLI,
HTML/Markdown reports, static UI, CI on Node 18/20/22.

Not yet: composer and proposal-review flow, AI translator, debate ingestion,
merge / pull requests, Datalog or Prolog execution, casting units to KSG's
seeded prototypes, ASP / Bayesian / LNN evaluators, multi-user auth. See
[`docs/ROADMAP.md`](docs/ROADMAP.md) and [`docs/OPEN_QUESTIONS.md`](docs/OPEN_QUESTIONS.md).

## License

MIT © Lehel Kovach
