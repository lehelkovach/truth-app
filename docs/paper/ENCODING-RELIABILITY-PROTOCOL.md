# Encoding reliability protocol (second-encoder pilot)

**Why.** Every case in `fixtures/` was encoded by one person. A reviewer will
ask whether a second analyst, given the same source, would produce an encoding
on which the evaluator says the same things. This protocol answers that with
one additional encoder and the tool's own diff. It is a pilot of encoding
stability, not an inter-annotator study; say so in the paper.

**Case.** `fixtures/pierson-post` (Pierson v. Post, 1805). The source text is
public domain, short (about 3,000 words for both opinions), and the arguments
are explicit. The AI-risk case is too large for a first pilot.

## 1. What the second encoder receives

- The full text of the majority and dissenting opinions, as a plain file.
  Nothing else from the case: not `fixtures/pierson-post`, not this
  repository's description of it, not the paper draft.
- `docs/CASE_AUTHORING.md` (the compact format) and the output of
  `node src/cli.mjs fallacies --verbose` (the catalogue with tests).
- The one instruction that matters: *record modality as the opinion asserts
  it, not as you believe it*; *declare an attack only where the text makes
  one argument answer another*.
- A time budget of three hours, recorded.

## 2. What they produce

`case-B.json` in the compact format, compiled with
`node src/cli.mjs compile case-B.json --out 0001-author-case.json` and
validated with `node src/cli.mjs validate`. They must not look at encoding A
until they have committed B.

## 3. Pairing

Encodings use different ids, so compare by meaning. The two encoders, together,
produce `mapping.json`:

```json
{ "propositions": { "A:M1": "B:P4", "A:M2": "B:P5", "A:D1": null },
  "arguments":    { "A:A1": "B:Arg2", "A:B4": null } }
```

A pair is recorded only when both agree the two units assert the same thing.
Unpaired units on either side are counted, not forced.

## 4. What to measure

| Level | Measure | How |
|---|---|---|
| Propositions | Jaccard overlap | paired / (paired + unpaired-A + unpaired-B) |
| Propositions | Modality agreement | exact match rate on paired propositions, and the mean absolute distance on the 5-point scale |
| Propositions | Basis agreement | exact match rate on paired propositions |
| Arguments | Jaccard overlap | as above, over paired arguments |
| Arguments | Same premises and conclusion | share of paired arguments whose premise sets map onto each other exactly under the proposition mapping, and whose conclusions pair |
| Attacks | Jaccard overlap | an attack pairs when attacker, target and type all pair |
| Evaluation | Thesis label agreement | `truth evaluate` on each encoding; same thesis status? |
| Evaluation | Argument label agreement | over paired arguments, share with the same label (accepted / rejected / undecided) |
| Findings | Code agreement | for each of W001, W002, MODAL_OVERREACH, STANDOFF: does the finding appear in both, and on paired arguments? |

Report the table as it comes out. Two encoders is not enough for a kappa with
a confidence interval; do not compute one.

## 5. What to write in the paper

One paragraph and the table. State: who the second encoder was (role, not
name, unless they consent), the time they took, what the biggest
disagreement was and whether it was about the text or about the format. If
agreement is low on attacks, that is a finding about how much structure the
analyst supplies, which is exactly what the limitations section claims.

## 6. Tooling to add if a third encoder is ever recruited

A script that takes `mapping.json` and two fixture directories and prints the
table above. Until then the table is filled by hand from `truth evaluate --json`.
