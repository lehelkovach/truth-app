---
title: "Argit: Version-Controlled Argumentation with Side-by-Side Deterministic Evaluation"
author: "Lehel Kovach"
date: "Draft, 2026-10-27"
bibliography: references.bib
link-citations: true
abstract: |
  Argument maps are snapshots, and most tools that evaluate them collapse the
  result into a score or a winner. We present Argit, an open-source reasoning
  workbench that treats a case (claims, arguments, evidence, attacks and
  annotations) as versioned semantic data. Patches apply to immutable
  snapshots; commits are content-hashed and parent-linked; branches fork from
  any commit; and comparison is a semantic diff plus an evaluation diff, so an
  analyst sees what changed and what it did to the conclusions. Evaluation is
  deterministic and multi-dimensional, reported side by side and never
  aggregated: argument state under grounded semantics extended with premise
  support; logical result from a first-order evaluator over a shared Logic IR,
  with a proof or the missing condition; concept grounding with equivocation
  detection; evidence presence; and lifecycle and provenance. Automated
  findings are structural and conservative; named fallacies are analyst
  annotations drawn from a catalogue of 22 entries, each with a decision test.
  We describe the data model, the semantics and the implementation, and
  illustrate on three cases. On Pierson v. Post (1805), the standard worked
  example in computational argumentation, the evaluator reports a definitional
  dispute over "possession" across the two sides' attacks, leaves the holding
  defeated after the opinions are encoded because the dissent's appeal to the
  custom of sportsmen goes unanswered, and shows on a branch exactly which
  implicit premise the majority needs to make the holding stand. On a 65-claim
  encoding of the AI existential-risk debate it surfaces an equivocation on
  "intelligence" and seven modal overreaches, and a second commit flips one
  argument chain while the thesis still stands. We report honestly that the
  Logic IR covers 6 of 26 claims in the legal case and none of the 65 in the
  policy case, and we discuss why that ceiling is the right place for a
  deterministic evaluator to stop.
---

> **Draft status.** Numbers in this draft are computed from the fixtures at
> the commit that carries this file (`npm run coverage`, `truth compare`).
> Two items remain open and are marked **[PENDING]**: the second-encoder
> pilot (§7.4) and the author's review of the Pierson v. Post encoding
> (§7.1). The comparison table and the references were verified against
> sources on 2026-10-27.

# 1 Introduction

A debate usually hides a disagreement about premises. Two people argue about a
conclusion for an hour and never discover that one of them means *task
competence* by "intelligence" and the other means *goal-directed agency*, or
that one side's "possession" is a hand on the animal and the other's is a
reasonable prospect of catching it. Argument-mapping tools help by drawing
the structure, but the map is a snapshot: when a position is revised, the old
map is overwritten, and nothing records what the revision did to the
conclusions. Tools that do evaluate the structure usually fold the result into
a single number or a winner, which is exactly the information an analyst
should not trust a machine to produce.

We built Argit around three questions an analyst actually asks:

1. *Where does this argument break?* At a premise, at the inference, or at
   the conclusion, and under which evaluator?
2. *What changed between these two versions, and what did it do to the
   conclusions?*
3. *Are the two sides using the same sense of this term?*

The design follows from a stance we state up front. Argit evaluates reasoning;
it does not score speakers and it never produces a truth score. Every
evaluation dimension is reported separately, with the evaluator that produced
it and the commit it was computed on. Ingestion is permissive and evaluation
is strict: a claim may enter with no source and the basis "assumption", and
the evaluator will report that rather than refuse it. Anything an AI model
produces can only be proposed; a human commits it.

**Contributions.**

- *Semantic version control for argumentation.* Content-hashed, parent-linked
  commits over an immutable snapshot; per-unit revisions; branches that fork
  from any commit; a semantic diff with typed diff classes; and comparison as
  semantic diff plus evaluation diff (§4).
- *Non-aggregated, deterministic, multi-dimensional evaluation.* Five
  dimensions (argument state, logical result, grounding, evidence, lifecycle
  and provenance) reported side by side; every evaluation artifact pins
  evaluator id, version and input commit (§5).
- *Grounded semantics with premise support.* Dung's grounded labelling
  extended so that a derived claim needs an accepted argument; the fixpoint
  is unique and standoffs are reported, never broken (§5.1).
- *Logical evaluation over a shared Logic IR.* A native first-order
  evaluator with proofs and open-world UNKNOWN over an AST mirrored
  byte-for-byte from a persistent knowledge-graph service, so a formalised
  claim persists unchanged (§5.2).
- *Conservative structural findings and a tested fallacy catalogue.* Modality
  recorded as the proponent asserts it, which makes modal overreach
  detectable; eight automated structural codes; 22 named fallacies that only
  an analyst may attach, each with a decision test (§5.5, §5.6).

**What we do not claim.** That the system determines truth; that it detects
fallacies in natural language; that it mines arguments from text; or that it
has been validated with users. §9 is specific about each.

# 2 Background and related work

**Abstract argumentation.** Dung's frameworks and the grounded extension
[@dung1995acceptability] give a unique, sceptical labelling. We use grounded semantics
because it never requires the evaluator to choose between equally defensible
extensions; where credulous semantics would pick, we report a standoff. The
labelling view we implement follows Caminada's reinstatement labellings
[@caminada2006reinstatement; @baroni2011introduction].

**Structured argumentation.** ASPIC+ [@modgil2014aspic] and Carneades
[@gordon2007carneades] give arguments internal structure and
distinguish attacks on conclusions, inferences and premises, following Pollock
[@pollock1987defeasible]. We adopt that typology as `rebut`, `undercut` and `undermine`, the
last on a named premise. Toulmin's *warrant* [@toulmin2003uses] is a field on
every argument, and its absence is a finding. Unlike bipolar frameworks
[@cayrol2005bipolar], our support-type relations (`supports`,
`qualifies`, `cites`, `tested_by`, `replicates`) are recorded and displayed
but never move a label: only declared attacks and premise support do.

**Argument mapping and analysis tools.** Argdown, OVA3 [@janier2014ova], Rationale [@vangelder2007rationale], AGORA-net [@hoffmann2015changing; @hoffmann2018stimulating], Carneades, Kialo,
DebateGraph, ArgueMapper and the Arguebuf format [@lenz2022arguemapper], PyArg and
Monkeypuzzle each map, and some evaluate, argument structure. A 2024 survey of 59
argumentation tools [@persiani2024fantastic] found 47 with open code, 33
shipped without any licence, 16 with documentation, 10 with tests and one
with continuous integration. Argit ships a deterministic
fixture replay and 80 tests. §8 compares features.

**Interchange and provenance.** The Argument Interchange Format [@chesnevar2006aif] and Arguebuf address exchange; PROV-O [@w3c2013provo] and ClaimReview
address provenance of statements. Argit records provenance on every unit
(human, imported or AI-proposed) and a lifecycle status (proposed, accepted,
retracted), and a retracted source propagates to every claim that cited it.

**Versioning structured knowledge.** Quit Store [@arndt2019quit] versions RDF
with Git semantics; model differencing tools such as EMF Compare and GumTree
[@falleri2014gumtree] compute structural diffs over trees. None attaches an
*evaluation* diff to the structural one, which is the operation an analyst
needs: not only "this premise was added" but "and that is why this argument
now stands".

**Fallacies and critical questions.** Walton, Reed and Macagno's schemes with
critical questions [@walton2008schemes] are the model for our
catalogue: each fallacy entry carries the test an analyst must answer before
attaching the label, and the evaluator only checks that the label names a
catalogue entry.

**Fact verification as contrast.** FEVER [@thorne2018fever] and its
successors produce a verdict over retrieved evidence with no argument
structure and no history. Argit is complementary: it holds the structure and
the history, and leaves verdicts about the world to people and to evidence.

**The gap.** We know of no tool that combines versioned cases with evaluation
diffs and multi-dimensional, non-aggregated evaluation over a shared logic IR.

# 3 The TruthIR data model

A case is a set of *units* and *relations*. Unit kinds are issue, position,
claim, argument, evidence, source, assumption, hypothesis, theory,
annotation, actor and concept. The profile is a flat JSON Schema (draft-07),
`schema/truthir-profile-v0.1.schema.json`, with referential invariants that
the schema cannot express checked in code: references resolve, premises are
claims, an `undermine` names a premise of its target, an annotation that
names a premise points at a premise of its target.

Three fields on a claim carry most of the design.

- **`modality`** is one of *speculative, possible, plausible, probable,
  certain*, and records how strongly the *proponent* asserts the claim, not
  what the analyst believes. This is what lets the evaluator ask whether a
  conclusion is asserted more strongly than its premises allow.
- **`basis`** is *evidence, definition, assumption* or *derived*. The first
  three are established unless undermined; a derived claim needs an accepted
  argument.
- **`terms`** bind the words in the claim to concepts by exact label or alias.
  One hit binds; several leave candidates; none leaves the term unresolved.
  Concepts can declare `senseOf` another concept, which is how "possession
  (actual corporal control)" and "possession (reasonable prospect of
  capture)" are both senses of "possession". Modality, context, population
  and time live on the claim, never inside the logic (decision D15).

Relations divide into those that move labels (`rebut` on a conclusion,
`undercut` on an inference, `undermine` on a named premise, where
`to: "argument:*"` expands to every argument using that premise) and those
that are recorded and shown but do not (`supports`, `qualifies`, `cites`,
`tested_by`, `replicates`, `falsifies`, `supersedes` and the rest).

A compact authoring format (propositions, arguments, attacks and fallacy
annotations keyed by short ids, plus concepts and sources) compiles
deterministically to a patch, and a test proves the compact file and the
committed patch agree.

*Figure 1 (pipeline).* source material → compact case → TruthPatch → schema
and invariants → `applyPatch` → immutable snapshot → content-hashed commit →
{semantic diff, evaluation, knowledge-graph mirror} → projections (Markdown,
HTML, CLI, static UI).

# 4 Semantic version control

A **TruthPatch** is the unit of change: a list of `addUnit`, `reviseUnit`,
`addRelation` and retraction operations, with a message and provenance.
`applyPatch` is pure. It never mutates; it returns a new snapshot in which
every unit carries a revision counter and a content hash, and the snapshot is
deep-frozen. A **commit** pins the hash of the patch and the hash of the
resulting snapshot and links to its parent; `verifyCommit` recomputes both.
Canonical JSON makes the hashes stable across machines.

A **branch** forks from any commit (`from: "main@2"`) and keeps the parent's
history, so `resolveRef("repair@2")` on a branch forked after commit 2
returns the same commit as `main@2`. Merge is deliberately out of scope for
this version (§10).

**Semantic diff** reports added, removed and revised units and relations, and
for a revised unit the fields that changed, classified (claim content,
inference, grounding, lifecycle). **Compare** is the semantic diff plus the
**evaluation diff**: for every unit, which dimensions changed label between
the two refs and from what to what, plus the thesis status and the counts of
red, yellow and green diagnostics.

*Figure 2.* The `hermione` fixture's `repair` branch. Commit 2 on `main` adds
an argument whose conclusion does not follow; the branch adds the missing
premise. `truth compare fixtures/hermione main repair`:

```
+ claim:C7 (claim)
~ argument:A2 (argument) premiseRefs, warrant [inference]
EVALUATION argument:A2 [logical logic.native]: not_entailed → entailed
DIAGNOSTICS red 1→0 · yellow 2→3 · green 9→11
```

The point is not the diff but the second line: the analyst sees the one
inference that changed and the dimension on which it changed. §7.1 shows the
same operation turning a legal holding from defeated to established.

# 5 Evaluation dimensions

Every evaluation is an artifact that pins the evaluator id and version and
the input commit (decision D6), and reports the dimensions below separately
(D18). Nothing is aggregated into a score (D5).

## 5.1 Argument state

Let $A$ be the arguments, $R$ the attack edges derived from `rebut`,
`undercut` and expanded `undermine` relations, $P(a)$ the premise claims of
$a$, $S(c)$ the arguments concluding a derived claim $c$, and $I$ the claims
established independently (basis evidence, definition or assumption). Labels
start *undecided* and move only to *accepted* or *rejected*:

- $a$ is **accepted** when every attacker of $a$ is rejected and every
  premise of $a$ is established;
- $a$ is **rejected** when some attacker of $a$ is accepted or some premise
  of $a$ is defeated;
- otherwise $a$ stays **undecided**.

A claim $c \in I$ is **established** unless an argument using it is
undermined by an accepted argument. A derived claim is **established** when
some $a \in S(c)$ is accepted, **defeated** when every $a \in S(c)$ is
rejected, and **open** while any is undecided.

Because labels move only from undecided to a decided value, the iteration is
monotone and the fixpoint is unique: the evaluator is deterministic. A mutual
rebuttal with no further attack leaves both arguments undecided; the
evaluator reports `STANDOFF` and never breaks it on its own. Without premises
and supports the procedure is Dung's grounded labelling; the extension is the
premise support, which is what makes "this chain falls because its premise
fell" visible in the derivation that accompanies every label.

## 5.2 Logical result

Claims may carry a **Logic IR** expression: an AST over `ConceptRef`,
`EntityRef`, `Variable`, `Predicate`, `Not`, `And`, `Or`, `Implies`, `ForAll`
and `Exists`, authored in a small text syntax
(`forall x: ferae_naturae(x) -> requires_occupancy(x)`) whose identifiers
resolve through the case's concepts and are never guessed. The AST, its
canonical form, hash and rendering are mirrored byte-for-byte from the
knowledge-graph service the workbench persists to, and the parity is proven
by generated vectors (decision D12): a claim formalised here persists there
unchanged.

The **native evaluator** saturates the snapshot's formal claims by forward
chaining and evaluates each argument whose premises and conclusion all carry
a valid, fully grounded expression. The result is three-valued and
open-world: *entailed* with a proof, *contradicted* when the negation is
derived, *not entailed* with the missing condition, and *outside coverage*
when any premise or the conclusion has no expression or an unresolved term.
Quantifiers are answered over the closed domain of the snapshot and labelled
`domain: snapshot` (D13). The IR deliberately has no modal, probabilistic,
temporal or comparison operators (D14, D15); §9 reports what that costs.

## 5.3 Grounding and equivocation

Terms resolve by exact label or alias only, and ambiguity stops for review
(D16). Two findings follow. **W001**: within one argument, the same symbol is
bound to two different concepts. **W002**: across a declared attack, the
attacker and the target bind the same symbol to different concepts, so the
attack may be talking past its target. Both are grounding facts, not
rhetorical accusations (D17): the remedy offered is to re-ground, split the
term, or record the attack as a definition dispute.

## 5.4 Evidence

A claim with basis *evidence* is reported *present*, *missing* or
*retracted* according to whether its cited sources exist in the snapshot and
whether any is retracted. This is presence, not quality. The evaluator does
not and should not judge a study's design.

## 5.5 Structural findings

| Code | Fires when | Severity rule |
|---|---|---|
| `MODAL_OVERREACH` | the conclusion's modality exceeds the weakest premise's | major for a deductive scheme or a two-step gap; else minor |
| `UNSOURCED_PREMISE` | a load-bearing premise has basis evidence but no source | minor |
| `CIRCULAR` | the support chain returns to the conclusion | major |
| `DERIVED_UNSUPPORTED` | a derived claim has no argument concluding it | major |
| `NO_WARRANT` | an argument states no warrant | minor |
| `STANDOFF` | two arguments rebut each other and neither is defeated | info |
| `UNCONTESTED` | an argument has no declared attack | info |
| `UNKNOWN_FALLACY` | an annotation names no catalogue entry | minor |

Each finding carries what was detected, why it matters, what was checked and
what the analyst can do.

## 5.6 Fallacy catalogue

Twenty-two named entries across presumption, induction, relevance, causal,
ambiguity, probability, decision, analogy and economics, each with a
one-line definition and the *test* an analyst applies before attaching the
label (for `appeal_to_possibility`: "Do the premises only establish
possibility while the conclusion asserts probability or certainty?"). Three
entries map to automated codes (`MODAL_OVERREACH`, `UNSOURCED_PREMISE`,
`CIRCULAR`); the rest are analyst annotations, attributed to the party that
makes the point, and the evaluator only verifies that the name exists
(decision D8). Appendix C lists the catalogue.

## 5.7 Diagnostics

Every dimension's result is also rendered as a diagnostic: red, yellow or
green, always with an explanation (detected, why, checked, options) and the
evaluator that produced it. Colour is diagnostic state, never a truth label.
Lifecycle, logical, argument, evidence, grounding and parser states are
reported as separate columns of one table and never combined.

# 6 Implementation

Argit is Node.js ESM with no TypeScript and no build step; JSON Schema, AJV,
JSDoc and the fixtures are the contract (D1). The command line offers
`validate`, `evaluate`, `report`, `history`, `diff`, `compare`, `verify`,
`compile`, `compose`, `logic`, `concept`, `fallacies`, `bundle`, `ksg-push`
and `demo`. A **composer** compiles a readable line-oriented case syntax to a
patch as the analyst types, and maps every diagnostic back to the line that
caused it. The **UI** is a static page over a precomputed bundle and computes
nothing itself (D20). Evaluators are pluggable through a registry; the
current argument evaluator is `truth.native` 0.2.0.

Persistence goes through one adapter to the knowledge-graph client; concepts,
claims and arguments are cast to the service's seeded prototypes, and the
cast decision is itself recorded as an evaluation. A contract server shares
its match logic with the test double so the two cannot drift, and a
release-contract smoke runs in CI.

The repository is about 6,000 lines of source in 55 files with 80 tests, all
passing at the commit this draft describes. Fixture replay is deterministic:
loading a fixture twice yields identical commit ids, and `verify` recomputes
every hash.

# 7 Case studies

Table 1 gives the sizes; the figures are the CLI outputs in
`docs/paper/figures/`.

| Case | Claims | Arguments | Attacks | Concepts | Sources | Annotations | Commits (+branches) |
|---|---|---|---|---|---|---|---|
| AI existential risk | 65 | 29 | 19 | 9 | 32 | 12 | 2 (+1) |
| Pierson v. Post | 26 | 10 | 7 | 13 | 10 | 3 | 2 (+1) |
| Exercise and depression | 5 | 2 | 0 | 0 | 3 | 0 | 2 |
| Hermione | 5 | 2 | 0 | 4 | 0 | 0 | 2 (+1) |

## 7.1 Pierson v. Post (externally authored)

Pierson v. Post, 3 Cai. R. 175 (N.Y. Sup. Ct. 1805) [@pierson1805], is the fox-hunting case
that computational argumentation has used as a worked example since Gordon
and Walton's Carneades reconstruction [@gordon2006pierson; see also @berman1993missing; @benchcapon2002missing; @benchcapon2003model; @atkinson2005legal]. Post was
hunting a fox with hounds on an unowned beach; Pierson, seeing this, killed
the fox and carried it off. The majority (Tompkins, J.) held that pursuit
alone confers no property in a wild animal; the dissent (Livingston, J.)
would have given the fox to a pursuer with a reasonable prospect of taking it.
Every proposition in our encoding is taken from the two opinions or the
authorities they cite, with modality recorded as the opinion asserts it. The
structure follows the published reconstructions; the encoding was drafted
with AI assistance from the opinion text and reviewed by the author
**[author: confirm after review]**.

**Commit 1: the sides as argued.** Five majority propositions form a formal
chain (a fox is *ferae naturae*; such animals are acquired only by occupancy;
occupancy requires corporal possession; Post only pursued; pursuit alone
confers no property), and the native evaluator derives the conclusion in
four steps: argument A1 is *entailed*. On the argument dimension, however, A1
is *undecided*: it rebuts and is rebutted by Barbeyrac's reasonable-prospect
argument B1, and nothing yet decides between them. The two policy arguments,
certainty and peace (A2) against encouraging the chase (B2), are in the same
position. The evaluator reports both standoffs, flags both policy arguments
for `MODAL_OVERREACH` (each asserts its rule as probable from a plausible
premise), and leaves the holding *open*. Only the precedent argument from
Keeble v. Hickeringill stands, because nobody has yet attacked it. And it
reports **W002** on both A1 and B1: the majority grounds "possession" to
*actual corporal control* and the dissent to *reasonable prospect of
capture*, so the two sides' attacks may be talking past each other. That is
the definitional dispute every commentary on the case identifies, found by
exact-match grounding with no semantic machinery.

**Commit 2: the opinions answer each other.** The majority undercuts B1 (a
commentator's dictum is not the law) and distinguishes Keeble (it turned on
possession of the soil, and the beach was no one's); the dissent undercuts
A1 (*tempora mutantur*: the custom of sportsmen, not Justinian, should
decide). The result is the figure's headline: **the holding is defeated.**
The dissent's custom argument B3 has no attacker, so it is accepted; A1 is
rejected; its conclusion falls; and the holding, which depends on it, falls
with it. Keeble is distinguished (B4 rejected). The majority's undercut of
Barbeyrac is *undecided*, because it rests on the certainty rule M8, and M8 is
still open in the policy standoff. The majority's own use of "possession" in
the dictum argument is left *ambiguous* rather than guessed.

**Branch: the implicit answer made explicit.** The majority never directly
answers *tempora mutantur*; it defers to the authorities for the sake of
certainty. The branch `majority-answers-custom` adds what that deference
implies: absent statute the received authorities are the law (A7, undercutting
B3), and discourtesy among sportsmen is for their code of honour, not the
courts (A8, undercutting the policy inference B2). `truth compare main@2
majority-answers-custom` prints six added units and two relations, then:

```
EVALUATION argument:A1 [argument]: rejected → accepted
EVALUATION argument:B3 [argument]: accepted → rejected
EVALUATION claim:D3 [claim]: open → defeated
EVALUATION claim:H [claim]: defeated → established
THESIS: defeated → established
DIAGNOSTICS red 3→5 · yellow 21→17 · green 33→42
```

No standoff survives. The reading we draw is modest and, we think, correct:
under grounded semantics the 1805 holding stands only if the court is taken
to have rejected the custom-of-sportsmen argument, and the tool shows exactly
which two premises carry that rejection. Whether a court *did* reject it is
for a lawyer; what the encoding needs to make the holding stand is now
inspectable.

## 7.2 AI existential risk

Sixty-five claims, 29 arguments and 19 attacks across two parties: the
existential-risk position in the strongest form its proponents use (Bostrom,
Yudkowsky and Soares, Ord, Carlsmith, Hinton, the CAIS statement, AI 2027),
the author's counter-case, and the risk side's best replies. Twelve fallacy
annotations are attached on both sides, each with its catalogue test.

The evaluator surfaces, without being told, an equivocation on
"intelligence" (**W001** on the orthogonality argument: *task competence* in
the timelines premise, *goal-directed agency* in instrumental convergence),
seven `MODAL_OVERREACH` findings, and six unsourced premises. Commit 2 adds
the risk side's reply to "takeoff is bounded"; the intelligence-explosion
chain flips from defeated to standing while the thesis still stands, because
the extinction conclusion also depends on the power-seeking argument, which
remains defeated. The eleven `UNCONTESTED` findings tell each side where to
reply next. A `regrounded` branch restates one premise in a single sense and
the compare shows what moves.

This case is also the paper's honest ceiling: **none of its 65 claims carries
a Logic IR expression**, because they are predictive, modal, probabilistic or
normative, and the IR deliberately expresses none of those (§9).

## 7.3 Exercise and depression

A small scientific graph: claims backed by evidence, a hypothesis with a
falsification criterion, then a second commit that adds a replication and a
limitation and narrows the hypothesis scope from "adults with depressive
symptoms" to "adults with mild-to-moderate depressive symptoms". It shows
`tested_by`, `replicates` and `qualifies` relations that are recorded but do
not move labels, and scope narrowing as a semantic diff.

## 7.4 Encoding reliability **[PENDING: needs a second encoder]**

`docs/paper/ENCODING-RELIABILITY-PROTOCOL.md` specifies a pilot: a second
analyst encodes Pierson v. Post from the opinion text alone, the two
encodings are paired by meaning, and agreement is reported at the
proposition, argument, attack and evaluation levels using the tool's own
diff. The result, whatever it is, goes here in one paragraph and one table.

# 8 Comparison with existing tools

Table 2 compares documented features as of 2026-10-27. A cell reads *no*
only where a tool's documentation shows absence or the feature is clearly
out of scope; otherwise *n.d.* (not documented). The full table with a
source URL for every cell is `docs/paper/COMPARISON.md`.

| Tool | Formal semantics | Logic eval | History | Sem. diff | Branches | Eval diff | Grounding | Provenance | Schemes / fallacies + CQs | No scalar | Open source | Tests |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Argdown | no | no | n.d. | n.d. | n.d. | no | n.d. | n.d. | n.d. | yes (nothing scored) | yes, MIT | yes |
| OVA3 | no | no | n.d. | n.d. | n.d. | no | n.d. | partial | partial | yes (nothing scored) | partial (CC-BY-SA) | n.d. |
| Rationale | no (manual) | no | n.d. | n.d. | n.d. | no | n.d. | yes | partial | yes | no | no |
| AGORA-net | n.d. | n.d. | n.d. | n.d. | n.d. | n.d. | n.d. | n.d. | n.d. | n.d. | yes, AGPL-3.0 | n.d. |
| Carneades 4 | yes (grounded, complete, preferred, stable; CAES) | partial | n.d. | n.d. | n.d. | n.d. | n.d. | n.d. | partial | partial | yes, MPL-2.0 | n.d. |
| Kialo | no (votes) | no | partial | n.d. | partial (clone) | no | n.d. | partial | n.d. | no | no | no |
| DebateGraph | no (ratings) | no | partial (history tab) | n.d. | n.d. | no | n.d. | partial | n.d. | no | n.d. | n.d. |
| ArgueMapper + Arguebuf | no | no | partial (undo; timestamps) | n.d. | n.d. | no | n.d. | yes | partial | yes (nothing scored) | yes, MIT | partial |
| PyArg | yes (AF, ASPIC+, ABA) | partial | n.d. | n.d. | n.d. | n.d. | n.d. | n.d. | n.d. | yes | yes, MIT | yes |
| Monkeypuzzle | no | no | n.d. | n.d. | n.d. | n.d. | n.d. | partial | partial | yes (nothing scored) | yes, GPL-3.0 | n.d. |
| **Argit** | yes (grounded + premise support) | yes (first-order over the closed snapshot) | yes | yes | yes | yes | yes (exact match; W001, W002) | yes (source units; retraction propagates) | partial (22 fallacies with tests; schemes as a field) | yes, by design | yes (MIT License) | yes (80) |

Three readings. First, formal semantics with an open implementation exist
in Carneades 4 and PyArg; neither documents history, diff, branches or an
evaluation diff. Second, the only version-like features found anywhere are
Kialo's change tracking and discussion cloning, DebateGraph's History tab,
and ArgueMapper's undo log and per-node timestamps; nothing documents a
semantic diff, and nothing documents an evaluation diff. Third, the survey
finding on tests [@persiani2024fantastic] holds in this sample: Argdown,
PyArg and arguebuf-python ship tests; Carneades 4, OVA3, ArgueMapper,
AGORA-net and Monkeypuzzle do not document any. Argit's own row is
self-graded and should be read as a claim about this commit, not a
comparison of quality.

# 9 Limitations and threats to validity

- **The Logic IR covers little of a real debate.** 6 of 26 claims in Pierson
  v. Post (23%) and 0 of 65 in the AI-risk case carry an expression; the
  logical dimension reads *outside coverage* for the rest. The IR has no
  modal, probabilistic, temporal or comparison operators by design, so most
  claims people actually argue about land as utterances with a modality, not
  as propositions. We think this is the right place for a deterministic
  evaluator to stop, and the grounded-argumentation dimension does the work
  for informal claims, but the paper should not be read as formalising
  debates.
- **Evidence is presence, not quality.** No study-design, causal or
  statistical assessment is made or implied.
- **Grounding is exact-match.** No embedding or model resolves a term, by
  design, so recall of concept links depends entirely on the analyst's
  `terms` annotations. The equivocation findings are only as complete as
  that annotation.
- **Attacks are declared, not mined.** An undeclared attack is invisible, and
  the `UNCONTESTED` findings make that visible but cannot fill it. The
  Pierson v. Post result in §7.1 depends on which answers the encoder chose
  to declare; the branch exists precisely to make that choice explicit.
- **Rebuttal symmetry is the author's choice.** A `rebut` is directed; the
  evaluator does not add the reverse edge and reports a standoff only when
  both exist.
- **No merge.** Branches compare but do not reconcile.
- **Single user; no authentication is claimed.**
- **Encodings are the authors'.** Three of four cases were authored by the
  first author; the fourth was drafted with AI assistance from a public text
  and reviewed by the author. §7.4 is the planned check and has not run.
- **No user study.**
- **Deterministic is not correct, and provenance is not truth.** The
  evaluator is only as good as the encoding, and a perfectly traceable false
  claim is still false. The claim of this paper is inspectability.

# 10 Future work

An AI translator that emits TruthPatch proposals which must pass schema and
human review before commit (D7), with prompt-injection regression fixtures;
merge and pull requests over cases; Datalog and ASP execution behind the same
evaluator interface (projections exist, execution does not); a comparison
node in Logic IR v0.0.2; probabilistic evaluators as further separately
reported dimensions, never folded into the argument label; and ingestion from
debate transcripts and scientific literature.

# 11 Conclusion

Argit treats an argument as something with a history and an evaluation as
something with a provenance. Commits, branches and evaluation diffs let an
analyst see what a revision did to the conclusions; separate, deterministic
dimensions let them see where an argument breaks and under which evaluator;
exact-match grounding catches the definitional disputes that debates hide.
On the oldest worked example in the field it shows, in two commits and a
branch, which implicit premise a famous holding needs. It does not say who is
right. It was built not to.

# References

Built by pandoc from `references.bib` (28 entries). Every DOI was checked
against Crossref, the publisher, CEUR or OpenAlex on 2026-10-27. Three
items carry a note for manual confirmation: the LNCS volume numbers for
@caminada2006reinstatement and @cayrol2005bipolar, and the first name of the
second author of @chesnevar2006aif.

# Appendix A: Reproduction

```bash
git clone https://github.com/lehelkovach/truth-app && cd truth-app
npm ci && npm test                                   # 80 tests
node src/cli.mjs evaluate fixtures/pierson-post --commit 1
node src/cli.mjs evaluate fixtures/pierson-post --commit 2
node src/cli.mjs compare  fixtures/pierson-post main@2 majority-answers-custom
node src/cli.mjs compare  fixtures/hermione main repair
node src/cli.mjs compare  fixtures/ai-risk main@1 main@2
npm run coverage fixtures/pierson-post
npm run coverage fixtures/ai-risk
node src/cli.mjs fallacies --verbose
```

# Appendix B: Finding codes

See §5.5 and `docs/paper/figures/` for the full diagnostic output on each case.

# Appendix C: Fallacy catalogue

`docs/paper/figures/fallacy-catalogue.txt` (22 entries; name, category,
definition, test, automated code where one exists).
