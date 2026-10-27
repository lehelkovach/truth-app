# Paper outline: TruthApp (working system name: Argit)

Grounded in `lehelkovach/truth-app` at commit e2b7717 (75/75 tests passing, 2026-10-27).
Target: 8 pages + references for a workshop, trimmed to 4 for a demo track; arXiv version unconstrained.
Items marked **TODO** do not exist yet and must be done before submission.

---

## 0. Name and title

The repo can stay `truth-app` for now. The name matters in the paper title, the abstract, and the arXiv listing, because "TruthApp" invites the objection the paper spends a section pre-empting ("you cannot compute truth") and reads as a consumer app.

| Candidate | Why | Risk |
|---|---|---|
| **Argit** (recommended) | Says the distinctive mechanism: git for arguments. Commits, branches, diff, compare are literally the paper's contribution. No collision found among argumentation tools. | Slightly cute. Check the npm and GitHub namespaces before committing. |
| Warrant | Toulmin's term for what licenses the step from grounds to claim; the tool's job is to check whether the warrant holds. `NO_WARRANT` is already a finding code. No argumentation-tool collision found. | "Warrant" is an authorization-infrastructure company (acquired by WorkOS). Different field, but it owns the search results. |
| Standpoint | Pragma-dialectics term; neutral. No collision found. | Says nothing about versioning or evaluation. |

Title options (pick one, keep the subtitle descriptive so the mechanism is searchable):

1. *Argit: Version-Controlled Argumentation with Side-by-Side Deterministic Evaluation*
2. *Argit: Semantic Commits, Diffs and Branches for Contested Claims*
3. *Evaluating Reasoning, Not Scoring Truth: A Version-Controlled Workbench for Structured Argument*

## 1. Abstract (draft, ~180 words)

Argument maps are snapshots, and most tools that evaluate them collapse the result into a score or a winner. We present Argit, a reasoning workbench that treats a case (claims, arguments, evidence, attacks, annotations) as versioned semantic data: patches apply to immutable snapshots, commits are content-hashed and parent-linked, branches fork from any commit, and comparison is a semantic diff plus an evaluation diff, so an analyst sees what changed and what it did to the conclusions. Evaluation is deterministic and multi-dimensional, reported side by side and never aggregated: argument state under grounded semantics extended with premise support; logical result from a first-order evaluator over a shared Logic IR, with a proof or the missing condition; concept grounding with equivocation detection; evidence presence; and lifecycle and provenance. Automated findings are structural and conservative (modal overreach, unsourced premise, circularity, standoff, uncontested attack); named fallacies are analyst annotations drawn from a catalogue of 22 entries, each with a decision test. We describe the data model, the semantics, and the implementation, and illustrate on three cases including a 63-claim encoding of the AI existential-risk debate, where the evaluator surfaces an equivocation on "intelligence" and a modal overreach, and a second commit flips one argument chain while the thesis still stands. **TODO**: one sentence on the externally authored case and the feature comparison.

## 2. Contributions (the list in the introduction)

1. **Semantic version control for argumentation.** Content-hashed, parent-linked commits over an immutable snapshot; per-unit revisions; branches; semantic diff with diff classes; compare as semantic diff plus evaluation diff. No existing argument-mapping tool does this (**TODO**: verify claim against the comparison table in §8).
2. **Non-aggregated, multi-dimensional deterministic evaluation.** Five dimensions reported separately (argument, logical, grounding, evidence, lifecycle/provenance). Design decision D5: no scalar, ever. Each evaluation artifact pins evaluator id, version and input commit (D6), so results are reproducible.
3. **Grounded semantics with premise support.** Dung's grounded labelling extended so a derived claim needs an accepted argument; unique fixpoint; standoffs are reported, never broken. Attack vocabulary rebut / undercut / undermine; support-type relations are recorded but do not move labels.
4. **Logical evaluation over a shared Logic IR.** A native first-order evaluator (three-valued, open-world UNKNOWN, quantifiers over the closed snapshot domain) that returns a proof or the missing condition, over an AST mirrored byte-for-byte from a persistent knowledge graph service, so a formalised claim persists unchanged.
5. **Conservative structural findings and a tested fallacy catalogue.** Modality recorded as the proponent asserts it (speculative to certain), enabling `MODAL_OVERREACH`; seven automated structural codes; 22 named fallacies that only an analyst may attach, each with a decision test.

Explicitly *not* claimed: that the system determines truth; that it detects fallacies in natural language; that it mines arguments from text; that it has been validated with users.

## 3. Section-by-section

### 1 Introduction (1 page)
- Problem: debates hide disagreement about premises; argument maps are static; evaluation tools output a winner or a probability; LLM fact-checkers emit verdicts with no inspectable structure.
- Three questions an analyst actually asks: where does the argument break (premise, inference, conclusion); what changed between two versions and what did it do to the conclusions; which sense of a term is each side using.
- Design stance in one paragraph: evaluate reasoning, do not score speakers; AI output may only propose (D7); permissive ingestion, strict evaluation (D10).
- Contribution list (§2 above). Paper map.

### 2 Background and related work (1 page)
- **Abstract argumentation.** Dung 1995; labelling-based semantics (Caminada 2006). Position: we use grounded because it is unique and sceptical; credulous semantics would require the evaluator to pick.
- **Structured argumentation.** ASPIC+ (Modgil & Prakken), Carneades (Gordon, Prakken, Walton 2007), Toulmin 1958 (warrant), Pollock on rebutting vs undercutting defeaters. Position: we borrow the attack typology, add `undermine` on a named premise, and keep supports non-label-moving (contrast with bipolar frameworks, Cayrol & Lagasquie-Schiex).
- **Argument mapping and analysis tools.** Argdown, OVA3 (ARG-tech), Rationale (van Gelder), AGORA-net (Hoffmann), Carneades, Kialo, DebateGraph, ArgueMapper/Arguebuf (Lenz et al.), PyArg, Monkeypuzzle. Cite the Persiani et al. survey finding low software-engineering maturity across the tool ecosystem; our 75-test suite and deterministic replay answer that directly.
- **Interchange and provenance.** AIF (Chesñevar et al. 2006); PROV-O; ClaimReview; Wikidata references. We record provenance per unit (human / imported / AI-proposed) and lifecycle (proposed / accepted / retracted).
- **Versioning structured knowledge.** Quit Store and versioned RDF (Arndt et al.); model differencing (EMF Compare, GumTree). None attach an evaluation diff to a semantic diff.
- **Fallacy taxonomies and critical questions.** Walton, Reed & Macagno 2008. Our catalogue's "test" field is a critical question the analyst must answer before attaching the label.
- **Fact verification as contrast.** FEVER (Thorne et al. 2018): verdicts over evidence, no argument structure, no versioning. We are complementary, not competing.
- Gap statement: no tool combines versioned cases, evaluation diffs, and multi-dimensional non-aggregated evaluation with a shared logic IR.

### 3 The TruthIR data model (0.75 page)
- Units: claim, argument, evidence, source, hypothesis, theory, issue, position, annotation, actor. Flat profile, JSON Schema draft-07 (`schema/truthir-profile-v0.1.schema.json`).
- Claim fields that matter: `modality` on a five-step scale as asserted by the proponent; `basis` in {evidence, definition, assumption, derived}; `proposition.context` for population, time, scope (D15: modality and context live on the claim, never in the IR).
- Relations: label-moving (rebut, undercut, undermine; `undermine` to `argument:*` expands to every argument using the premise) versus recorded-only (supports, qualifies, cites, tested_by, replicates).
- Referential invariants beyond schema: refs resolve, premise kinds, undermine targets, annotation must point at a premise of its target.
- Figure 1: the pipeline (source → compact case → TruthPatch → validate → applyPatch → snapshot → commit → {diff, evaluate, KSG mirror} → projections). Already drawn in `docs/ARCHITECTURE.md`.

### 4 Semantic version control (1 page)
- TruthPatch as the unit of change; `applyPatch` is pure; per-unit revision counters and hashes; canonical JSON and `sha256:` content hashes; deep-frozen snapshots.
- Commits pin patch hash and snapshot hash and link to a parent; `verifyCommit` recomputes.
- Branches as forks from `main@n`; merge deliberately out of scope (D19, §9).
- Semantic diff: added / removed / revised with diff classes per field; compare = semantic diff plus evaluation diff (which labels and diagnostics changed, and why).
- Worked example (Figure 2): the `hermione` repair branch. Second commit adds an argument whose conclusion does not follow; the `repair` branch adds the missing premise; `truth compare main repair` prints `+ claim:C7`, `~ argument:A2 premiseRefs, warrant`, `not_entailed → entailed`, red 1→0.
- Why this matters for analysis: the history is itself evidence of how a position evolved; a retracted source propagates to `EVIDENCE_RETRACTED` on every claim that cited it.

### 5 Evaluation dimensions (2 pages; the technical core)
- **5.1 Argument state.** Formal definition of `evaluateGrounded` with premises, supports, independent claims. Accepted iff every attacker rejected and every premise established; rejected iff some attacker accepted or some premise defeated; undecided otherwise. Claim labels established / defeated / open. State and sketch: labels move only from undecided to decided, so the fixpoint is unique and the evaluator is deterministic. Standoff (mutual rebut) is reported as a finding, not resolved.
- **5.2 Logical result.** Logic IR AST (ConceptRef, EntityRef, Variable, Predicate, Not, And, Or, Implies, ForAll, Exists); canonical form and hash; the native evaluator over the snapshot's closed domain (`domain: 'snapshot'`), three-valued, with a proof for entailed and the missing condition for not entailed; `outside coverage` when the claim has no IR; `contradicted` when the negation is entailed. Byte-for-byte parity with the knowledge-graph service's module, proven by generated vectors (D12). Note the deliberate non-goals: no modal, probabilistic or temporal operators; no comparison node (proposed upstream, OPEN_QUESTIONS 6).
- **5.3 Grounding and equivocation.** Exact label or alias match only; ambiguity stops (D16). W001: one symbol bound to two concept ids within one argument. W002: across a declared attack. Equivocation is a grounding fact, not a rhetorical accusation (D17).
- **5.4 Evidence.** present / missing / retracted. Presence, not quality, and say so.
- **5.5 Structural findings.** Table: `MODAL_OVERREACH`, `UNSOURCED_PREMISE`, `CIRCULAR`, `DERIVED_UNSUPPORTED`, `NO_WARRANT`, `STANDOFF`, `UNCONTESTED`, `UNKNOWN_FALLACY`. Each with its exact trigger condition and severity rule (e.g. modal overreach is major for a deductive scheme or a two-step gap).
- **5.6 Fallacy catalogue.** 22 entries across categories (presumption, induction, relevance, causal, ambiguity, probability, decision, analogy, economics). Each has a definition and a test; three map to automated codes. The evaluator only checks that an annotation names a catalogue entry. Table in appendix.
- **5.7 Diagnostics.** Red / yellow / green, always with what was detected, why it matters, what was checked, what to do. Dimensions reported separately (D18); no aggregation.

### 6 Implementation (0.5 page)
- Node ESM, no TypeScript, no build step (D1); JSON Schema + AJV + fixtures as the contract.
- CLI verbs: validate, evaluate, report, history, diff, compare, verify, compile, compose, fallacies, ksg-push, demo.
- Composer: readable case syntax compiled live to a TruthPatch with every diagnostic mapped back to its source line.
- Static UI over a precomputed bundle; computes nothing itself (D20).
- Pluggable evaluator registry; current evaluator `truth.native` 0.2.0.
- Persistence boundary: one adapter to the knowledge-graph client; units cast to seeded prototypes (Concept, Proposition/Claim/Utterance, Argument); the cast decision is itself recorded as an evaluation. Contract server shares `matchDecision` with the fake so they cannot drift; release-contract smoke in CI.
- Size and tests: 53 source files, ~5.7k lines, 75 tests, all passing; fixture replay is deterministic.

### 7 Case studies (1.5 pages)
- **7.1 AI existential risk.** 2 parties, 63 propositions, 28 arguments, 18 attacks, 12 fallacy annotations, 2 commits. Encoded in the strongest form proponents give it, then the counter-case, then replies. What the evaluator surfaced without being told: equivocation on "intelligence" (task competence in the timelines premise vs goal-directed agency in instrumental convergence; W001 on the orthogonality argument); `MODAL_OVERREACH` on A5 (conclusion "certain", weakest premise "probable", deductive). Commit 2 adds the reply to "takeoff is bounded": the intelligence-explosion chain flips from defeated to standing while the thesis still stands because extinction also depends on the power-seeking argument, which remains defeated; `UNCONTESTED` findings name where to reply next. The `regrounded` branch restates the premise in one sense and the compare shows what moves.
- **7.2 Hermione.** The spec's own three-proposition example; the repair-branch walkthrough from §4.
- **7.3 Exercise and depression.** Scientific mini-graph: claims backed by evidence, a hypothesis with a falsification criterion; the second commit adds a replication and a limitation and narrows the hypothesis scope. Shows `tested_by` / `replicates` relations and scope narrowing as a semantic diff.
- **7.4 TODO: an externally authored case.** Re-encode a published analysis not written by the author: a case from AIFdb / the Araucaria corpus, a Kialo debate export, or a published COMMA case study. Report what the evaluator finds and where the encoding was ambiguous. This is the single most important missing piece; reviewers will discount three self-authored fixtures.
- **7.5 TODO: encoding reliability.** Have a second person encode one case independently; semantic-diff the two encodings. Even an n=2 agreement table is better than none and uses the tool's own diff.

### 8 Comparison with existing tools (0.5 page, one table)
**TODO.** Rows: Argdown, OVA3, Rationale, AGORA-net, Carneades, Kialo, DebateGraph, ArgueMapper/Arguebuf, PyArg, Argit. Columns: formal semantics; logic evaluation; versioned history; semantic diff; branches; evaluation diff; grounding / equivocation; evidence provenance; fallacy annotation with tests; no-scalar guarantee; open source; tests shipped. Fill from each tool's documentation and cite it. Where a cell is uncertain, say "not documented" rather than "no".

### 9 Limitations and threats to validity (0.75 page; be as blunt as the repo docs are)
- Logic IR has no modal, probabilistic or temporal operators, so most real-world claims land as utterances with a modality, not as propositions; the logical dimension reads `outside coverage` for them. State the fraction for the AI-risk case (**TODO**: count).
- Evidence dimension is presence, not quality; no study-quality or causal-inference assessment.
- Grounding is exact match; no embedding or LLM resolution by design, so recall of concept links depends on the analyst.
- Attacks must be declared by the analyst; no argument mining. An undeclared attack is invisible.
- Rebuttal symmetry is left to the author (OPEN_QUESTIONS 4).
- No merge; branches can be compared but not reconciled.
- Single user; no authentication claims (D11).
- Cases are self-authored (addressed partially by §7.4, §7.5). No user study.
- Deterministic does not mean correct: the evaluator is only as good as the encoding. The system makes encoding choices visible; it does not make them for you.
- Provenance does not establish truth. A traceable false claim is still false. The paper's claim is inspectability, not veracity.

### 10 Future work (0.25 page)
- AI translator that emits TruthPatch proposals which must pass schema and human review before commit (D7, D21), with prompt-injection regression fixtures.
- Merge and pull requests over cases.
- Datalog / ASP execution backends behind the same evaluator interface (projections exist, execution does not).
- Comparison node in Logic IR v0.0.2.
- Probabilistic or Bayesian evaluators as additional, separately reported dimensions.
- Debate and scientific-literature ingestion.

### 11 Conclusion (0.25 page)

### Appendices
- A. Schema excerpt (claim and argument units; relation vocabulary).
- B. Full table of finding codes with trigger conditions.
- C. The 22-entry fallacy catalogue with tests.
- D. Reproduction: clone, `npm ci`, `npm test`, `node src/cli.mjs demo fixtures/ai-risk`, `truth compare fixtures/hermione main repair`.

## 4. Figures and tables

| # | What | Status |
|---|---|---|
| Fig 1 | Pipeline diagram | exists in ARCHITECTURE.md; redraw cleanly |
| Fig 2 | Hermione repair-branch compare output, annotated | exists as CLI output |
| Fig 3 | AI-risk argument graph with labels coloured, equivocation highlighted | UI renders it; export SVG |
| Fig 4 | Commit-1 vs commit-2 evaluation diff on AI-risk | CLI output; format as a table |
| Fig 5 | Composer screenshot with a red diagnostic mapped to its line | screenshot |
| Tab 1 | Evaluation dimensions, values, source | exists in README |
| Tab 2 | Structural finding codes and triggers | assemble from argumentation.mjs |
| Tab 3 | Tool comparison | **TODO** |
| Tab 4 | Case sizes (units, relations, commits, findings) for all cases | count from fixtures |
| Tab 5 (appendix) | Fallacy catalogue | exists in fallacies.mjs |

## 5. Work that must happen before submission, in order

1. **Pick the name**; check npm and GitHub for collisions; decide whether the repo renames now or later.
2. **Externally authored case (§7.4).** Two to four days. Without it the paper is a system description with no external validity.
3. **Tool comparison table (§8).** One to two days of reading documentation; cite each cell.
4. **Count the Logic IR coverage fraction on AI-risk** for §9.
5. **Second-encoder check (§7.5)** if a willing colleague exists; otherwise state it as future work.
6. **Related-work reading pass.** Confirm every citation above against the actual paper; the list is from memory and must be checked.
7. **Tag a release, archive it on Zenodo for a DOI**, cite the DOI in the paper.
8. **arXiv endorsement** for cs.AI if this is a first submission (UCLA affiliation should make this straightforward). Primary cs.AI; consider cross-listing cs.LO.

## 6. Venues

Check current calls for dates; these are the recurring homes for this kind of paper.

- **arXiv cs.AI** first, regardless of venue, for the dated public record.
- **CMNA** (Computational Models of Natural Argument), annual workshop; good fit for tools that sit between formal and natural argument.
- **COMMA** demo track and the co-located **SAFA** workshop; COMMA is biennial, so check whether the next edition is in reach.
- **ArgMining** workshop (ACL / EMNLP); weaker fit since the paper does no mining, but system demos appear there.
- **Argument & Computation** journal for a longer version once §7.4 and §8 exist; it publishes system descriptions.
- **AI³** (Advances in Argumentation in AI) workshop, annual.

## 7. Page budget (8-page version)

| Section | Pages |
|---|---|
| 1 Intro | 1.0 |
| 2 Related | 1.0 |
| 3 Data model | 0.75 |
| 4 Version control | 1.0 |
| 5 Evaluation | 2.0 |
| 6 Implementation | 0.5 |
| 7 Cases | 1.5 |
| 8 Comparison | 0.5 |
| 9 Limitations | 0.75 |
| 10–11 Future, conclusion | 0.5 |

Four-page demo cut: keep §1 (half), §4 (half), §5.1–5.3 compressed, §7.1, Fig 2 and Fig 3, and a four-row limitations list.

## 8. Venue update (verified 2026-10-27)

| Venue | State on 2026-10-27 | Limits |
|---|---|---|
| **ArgMining 2027** (14th Workshop on Argument Mining and Reasoning, EACL 2027, Athens, 9–14 March 2027) | **Open.** Direct submission 15 Dec 2026; ARR commitment 22 Dec 2026; notification 5 Jan 2027; camera-ready 19 Jan 2027. https://argmining-org.github.io/2027/ | long 8 pp + refs + 2 appendix; short 4 pp + 1; abstract 2 pp |
| Argument & Computation (journal, open access, IOS Press per OpenAlex; APC listed USD 900) | Rolling | author guidelines not reachable; check manually |
| COMMA 2026 (Barcelona, 16–18 Sept 2026) | Passed (deadline 24 Apr 2026). Biennial; 2028 call not yet found | 12 pp incl. refs; demos 2 pp |
| CMNA'26 (at COMMA 2026) | Passed (deadline 6 Jul 2026) | long 10, short 5, demo 2 (CEUR) |
| SAFA 2026 (at COMMA 2026) | Passed (deadline 13 Jul 2026) | 2024: 14 full / 7 position |
| AI³ 2026 (AIxIA, Perugia, Oct 2026) | Passed | 15 / 5 / 3 (CEUR) |

**Recommendation.** Post to arXiv cs.AI as soon as the author has reviewed the Pierson encoding, then submit the 8-page version to ArgMining 2027 by 15 December 2026. The journal version follows once the second-encoder pilot has run.
