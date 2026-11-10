# The Reasoning Explorer

A viewer that answers, for every argument in a case, the one question rhetoric
tries to blur: **does the conclusion actually follow?** — and shows its work.
It is the "Prolog-style testing of arguments" surface: the Logic IR of each
claim, its Prolog projection, the conclusion as a goal, and two independent
engines' verdicts with a proof trace or the missing condition.

## Two engines, shown separately

| Engine | What it does | Output |
|---|---|---|
| **KnowShowGo inference core** (`src/logic/infer.mjs`, byte-faithful mirror of `knowshowgo/src/logic_ir/infer.js`) | Tries to prove the conclusion from the premises by **one named rule**: universal modus ponens, modus ponens, hypothetical syllogism, reiteration. Blocks (unresolved) on ungrounded symbols rather than guessing. | `valid` + the rule and substitution · `invalid` · `unresolved` |
| **Native prover** (`src/logic/evaluate.mjs`) | Forward-chains the premises to saturation (Kleene three-valued, open world), then evaluates the conclusion over the snapshot's entities. | `entailed` + proof steps · `not_entailed` + missing condition · `contradicted` · `outside_coverage` |

They usually agree. When they do not, the card says why (e.g. a universal
conclusion over an empty entity domain is proved by rule but not model-checked;
a multi-step derivation is found by chaining but not by a single rule).

## One verdict per argument

| Verdict | Meaning |
|---|---|
| **valid** | A rule fired or forward chaining derived the conclusion: it follows necessarily. |
| **invalid** | Both engines could evaluate and neither confirms: the premises do not license the conclusion. Named fallacies are shown beside it. |
| **not deducible** | Logic cannot get a grip — an inductive / abductive / extrapolation scheme (which never claimed to deduce), a claim without Logic IR, or an ungrounded term. A boundary, not a defeat; the argument's *standing* comes from grounded argumentation. |
| **contradicted** | The premises entail the negation of the conclusion. |

**Validity is not truth.** Each premise's standing (`established` / `defeated`
/ `open`) is printed beside it as a separate dimension; a valid argument from a
defeated premise is still valid and still unsound. Nothing is averaged.

## Terms, subjects and KnowShowGo

Every argument lists the concepts it rests on, split into **subjects**
(entities) and **predicates**, each with its definition, aliases and binding:
`local` (defined in the case) or `KSG <ref>` (bound to a KnowShowGo concept).
Grounding is exact/alias resolution that **stops on ambiguity**: a term that
matches two concepts is `ambiguous`, which blocks the KSG core and puts the
native prover outside coverage. The grounding layer's **W001** fires when one
symbol is bound to two different concepts inside one argument — equivocation
caught structurally, not by taste.

Each claim also shows the KSG prototype it casts to under KnowShowGo's own
matcher contract (`src/logic/formalize.mjs`): `Proposition` (valid IR, every
symbol resolved), `Claim` (subject/predicate roles), or `Utterance` (informal
or unresolved — never promoted by guessing).

## The primer fixture

`fixtures/reasoning-primer/` is a teaching case: classic valid syllogisms next
to the fallacies that imitate them, every term defined as a concept.

| Argument | Shape | KSG core | Native | Verdict |
|---|---|---|---|---|
| A1 Barbara | ∀x human→mortal; human(socrates) ⊢ mortal(socrates) | valid · universal modus ponens | entailed | **valid** |
| A2 Modus ponens | rain→wet; rain ⊢ wet | valid · modus ponens | entailed | **valid** |
| A3 Hypothetical syllogism | ∀x greek→human; ∀x human→mortal ⊢ ∀x greek→mortal | valid · hypothetical syllogism | not checkable (no entities) | **valid** |
| A4 Affirming the consequent | rain→wet; wet ⊢ rain | invalid | not entailed · missing condition | **invalid** |
| A5 Denying the antecedent | rain→wet; ¬rain ⊢ ¬wet | invalid | not entailed | **invalid** |
| A6 Undistributed middle | ∀x philosopher→human; ∀x greek→human ⊢ ∀x greek→philosopher | invalid | not entailed | **invalid** |
| A7 Equivocation | "bank" bound to river-bank in one premise, finance-bank in another | invalid | not entailed · **W001** | **invalid** |
| A8 Hasty generalisation | inductive, no Logic IR | unresolved | outside coverage | **not deducible** |

## Using it

```bash
node src/cli.mjs reasoning fixtures/reasoning-primer          # per-argument verdicts, rules, Prolog, proofs
node src/cli.mjs reasoning fixtures/reasoning-primer --all    # plus the claims table
node src/cli.mjs reasoning fixtures/hermione --ref repair     # any fixture, any ref
npm run serve                                                 # the Reasoning tab in the UI
```

Programmatic: `reasoningReport(snapshot, evaluation.result)` from
`src/services/reasoning.mjs` (also exported from `src/app.mjs`); bundles carry
it per commit as `reasoning`.
