# TruthIR TruthApp profile v0.1

Schema: `schema/truthir-profile-v0.1.schema.json`. Every unit has `id`
(`kind:name`), `kind`, `status` (proposed | accepted | retracted | deprecated)
and `provenance` (`sourceType` user | llm | import | evaluator | fixture, plus
`sourceRef`, `method`, `model`, `actorRef`, `fragment`).

| Kind | Required fields | Purpose |
|---|---|---|
| `issue` | `question` | Groups positions; optional `thesisRef` names the claim the case argues for. |
| `position` | `issueRef`, `name` | A stance. Arguments and claims carry `positionRef`. |
| `claim` | `text`, `claimKind`, `modality`, `basis` | A proposition. `claimKind`: empirical, predictive, normative, definitional, conceptual. `basis`: evidence, definition, assumption, derived. `sourceRefs` cite `source` units. Optional semantics: `terms[]` (`{ symbol, conceptRef }` or `{ symbol, candidates[] }`), `proposition` (`{ predicateRef, roles: { agent: concept:… }, polarity, context: { population, geography, time, modality, conditions } }`), `logicIr` (KSG Logic IR v0.0.1, uuids are `concept:` refs until pushed), `logicText` (the authoring form it was parsed from). |
| `concept` | `label` | TruthApp's handle on a KSG concept: `aliases`, `definition`, `conceptKind` (concept, entity, predicate), `ksgRef` (uuid once pushed, null while local), `senseOf` (the umbrella concept this is one sense of). |
| `argument` | `title`, `premiseRefs`, `conclusionRef`, `scheme` | Premises → conclusion with a `warrant`. `scheme`: deductive, inductive, abductive, analogical, expected-value, authority, extrapolation. `strict` true for deductive. |
| `evidence` | `text`, `sourceRef` | A fragment from a source, linked to claims by `supports`. |
| `source` | `title` | Paper, book, interview; `who`, `year`, `url`, `doi`, `note`. |
| `assumption` | `text` | Defeasible premise. |
| `hypothesis` | `claimRef`, `prediction` | Adds `falsificationCriterion`, `scope`. |
| `theory` | `title` | Bundles `hypothesisRefs`, `assumptionRefs`. |
| `annotation` | `annotationType`, `targetRef`, `text` | `fallacy` annotations carry `name` (catalogue), `where` (`inference`, `conclusion`, `premise:<claim id>`), `severity`, `byRef`. |
| `actor` | `name` | Author or speaker. |

Relations: `{ id, operator, from, to, targetRef?, note?, status, provenance }`
with operators supports, attacks, rebut, undercut, undermine, contradicts,
depends_on, derived_from, tested_by, replicates, falsifies, qualifies,
assumes, competes_with, supersedes, cites, evidence_for, evidence_against,
defines, uses_concept. `undermine` requires `targetRef`
(the premise) and may target `argument:*`.

Patch (`schema/truth-patch-v0.1.schema.json`): `addUnit`, `reviseUnit`,
`retractUnit`, `addRelation`, `reviseRelation`, `retractRelation`. A revise
may pin `target.revision`; the patch is refused if the head has moved.

Commit (`schema/truth-commit-v0.1.schema.json`): content-addressed id, parent
refs, branch, `patchHash`, `snapshotHash`, provenance, `immutable: true`.
