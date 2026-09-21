# Authoring a case

The AI-risk fixture was built this way; use it as the template.

1. **Pick the issue and the thesis.** One question, one claim you will argue
   for (`thesis`). Name the positions (`parties`).
2. **Decompose the opponent's argument into propositions.** One idea per
   claim. For each, record the `kind` (empirical, predictive, normative,
   definitional, conceptual), the `modality` **as the proponent asserts it**,
   and the `basis` (evidence with sources, definition, assumption, or
   derived if it only follows from an argument). Steelman: quote the
   strongest published form and cite it.
3. **Write the arguments.** Premises → conclusion, a `scheme`, and a
   `warrant` that says why the premises license the conclusion. Sources on
   the argument point at where the argument itself is made.
4. **Run `truth evaluate`.** Read the automated findings first. Modal
   overreach tells you where a possibility became a probability; unsourced
   evidence tells you what to look up; circularity tells you where the chain
   eats itself.
5. **Attack precisely.** For each argument you contest, decide whether you
   deny a premise (`undermine`, name the premise), deny the inference
   (`undercut`), or assert the contrary (`rebut`). Every attack is itself an
   argument with premises and a conclusion, so write it as one. A `rebut`
   cuts both ways: write it once and the evaluator adds the reverse edge, so a
   lone rebut between two standing arguments is a `STANDOFF`, not a win. To
   defeat rather than contest, undercut the inference or undermine a premise.
6. **Annotate fallacies sparingly.** Use the catalogue (`truth fallacies -v`).
   Each entry has a test; apply it before attaching the label. Prefer
   `severity: note` where the label depends on a contested premise.
7. **Give the other side its best reply.** Enter the strongest rebuttals you
   know of (in the fixture: A11 disjunctive risk, A12 timing vs possibility,
   A13 threshold, A14 training selects for goals). If your thesis only stands
   when the opponent is silent, it does not stand.
8. **Read `UNCONTESTED`.** Those are the frontier: the arguments the other
   side has not answered. Either answer them or say plainly they are open.
9. **Commit revisions, do not edit.** A new reply is a new patch
   (`commits/0002-*.json`). `truth diff` shows what changed and
   `truth evaluate --commit N` shows what it did to the labels.

## Grounding and formalising (optional, per claim)

```json
"concepts": {
  "mammal":   { "label": "mammal", "kind": "predicate", "definition": "…" },
  "hermione": { "label": "Hermione", "kind": "entity" },
  "intelligence-agency": { "label": "intelligence (goal-directed agency)", "aliases": ["agency"], "senseOf": "intelligence" }
},
"propositions": [
  { "id": "C1", "text": "Every mammal is warm-blooded.", "terms": ["mammal", "warm-blooded"], "logic": "forall x: mammal(x) -> warm_blooded(x)", … },
  { "id": "P2", "text": "…", "terms": [{ "symbol": "intelligence", "concept": "intelligence-agency" }], … },
  { "id": "P1", "text": "…", "terms": [{ "symbol": "intelligence", "candidates": ["intelligence-competence", "intelligence-agency"] }], … }
]
```

- A bare string in `terms` resolves by exact label or alias. One hit binds
  it; several leave `candidates` (yellow, ambiguous); none leaves it
  unresolved. Nothing is guessed.
- `logic` is parsed into KSG Logic IR (`forall`, `exists`, `->`, `&`, `|`,
  `~`, `pred(args)`); identifiers are concept keys. `truth logic <fixture>`
  shows the IR and its Prolog projection.
- Use two `senseOf` concepts when a word does double duty. If premises then
  ground it differently inside one argument, W001 fires with both senses and
  the claims, which is the equivocation you would otherwise have to argue.
- Native entailment only runs on arguments whose premises and conclusion all
  have valid, fully grounded expressions; everything else is `outside
  coverage`, which is a scope statement, not a verdict.

Branches: `fixtures/<case>/branches/<name>/branch.json` (`{ "from": "main@2" }`)
plus ordered patches; `truth compare <fixture> main <name>` shows the semantic
diff and the evaluation diff (labels, logic results, grounding, diagnostics).

Compile a compact case with:

```bash
node src/cli.mjs compile fixtures/<case>/source/case.json --out fixtures/<case>/commits/0001-author-case.json --message "Author case"
```
