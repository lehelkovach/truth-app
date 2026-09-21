# The composer

The composer is the editor surface from spec v1.1 §10: you write a case in
a readable structured subset, and as you type it is compiled to a TruthPatch,
validated, committed to a throwaway store, evaluated, and every diagnostic is
mapped back to the line that caused it. Red is a demonstrable problem, yellow
needs review, green was verified under a named evaluator. Nothing is stored;
to keep a case, save the text as `fixtures/<case>/source/case.truth` and
compile it with `truth compose file.truth --out commits/0001-author-case.json`.

```
truth compose fixtures/hermione/source/case.truth --show
npm run serve      # then the Compose tab, or POST /api/compose { text }
```

## Grammar

One statement per line. Indented lines are properties of the statement above.
`#` starts a comment.

| Statement | Meaning |
|---|---|
| `issue: <question>` | The issue. `title:` optionally sets the project title. |
| `thesis: C3` | The claim the case argues for. |
| `party risk: Existential-risk position` | A position; the id is used in brackets below. |
| `concept mammal (mammal): definition` | A concept. `entity hermione (Hermione): …` and `predicate has_fur (has fur)` set the kind. Properties: `aliases:`, `kind:`, `sense of: <key>`, `ksg: <uuid>`. |
| `C1 [certain, definition, risk]: text` | A claim. Brackets, any order: modality (speculative, possible, plausible, probable, certain), basis (evidence, definition, assumption, derived), kind (empirical, predictive, normative, definitional, conceptual), party id. Properties: `logic:`, `terms:`, `source: Title \| url`, `predicate: pred agent=key patient=key`, `notes:`. |
| `A1 [deductive, risk]: C1, C2 => C3` | An argument. Brackets: scheme, party id. Properties: `title:`, `warrant:`, `source:`, `notes:`. |
| `B1 undercuts A1: note` | An attack: `undercuts`, `rebuts` (symmetric; the reverse edge is implied), `undermines … at <premise>`, `supports`, `qualifies`. |
| `fallacy A1 equivocation [inference, weakens, skeptic]: why` | A fallacy annotation from the catalogue (`truth fallacies`). |

`terms:` is a comma list; a bare word resolves by exact label or alias, and
`word=conceptKey` pins it. `logic:` uses concept keys as identifiers:
`forall x: mammal(x) -> warm_blooded(x)`, `~bird(hermione)`, `a & b`, `a | b`.

## What the marks mean

| Mark | Source |
|---|---|
| red `PARSE` | The line could not be read. |
| red `INVALID` | The compiled patch fails the schema or a reference does not resolve (an undefined claim id, an unknown predicate in `logic:`). |
| red `LOGIC_NOT_ENTAILED` | The native evaluator could not derive the conclusion from the premises; the tip names the missing condition. |
| red `LOGIC_CONTRADICTED`, `W001`, `CIRCULAR`, `ARG_REJECTED` | Contradiction, equivocation, circular support, defeated argument. |
| yellow `GROUNDING_*`, `MODAL_OVERREACH`, `UNSOURCED_PREMISE`, `LOGIC_OUTSIDE_COVERAGE`, `STANDOFF` | Review: something is ambiguous, unsupported, or beyond the evaluator's coverage. |
| green `LOGIC_ENTAILED`, `ARG_ACCEPTED`, `GROUNDING_RESOLVED`, `EVIDENCE_PRESENT` | Verified under the named evaluator. |

Clicking a mark opens the full explanation in the inspector: what was
detected, why it matters, what was checked, the proof or missing condition,
and the options. That is the whole contract: no flag without an explanation.
