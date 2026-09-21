# Open questions (need project-owner input; unrelated work is not blocked)

1. **VSIR/TruthIR frame schema.** Resolved 2026-09-21 (D23): TruthIR was
   merged into Logic IR upstream; there is no separate frame/slot schema to
   reuse. The flat profile (`schema/truthir-profile-v0.1.schema.json`) stands.
2. **KSG object category for units.** Resolved 2026-09-18: the adapter casts
   concepts / claims / arguments to KSG's seeded prototypes (Concept,
   Proposition / Claim / Utterance, Argument) and records the prototype-match
   decision as an evaluation. Domain units (issue, position, source, evidence,
   hypothesis, theory, annotation, actor) keep a TruthApp `category_name`
   under `TruthUnit`, since they are not logic primitives. Confirmed
   2026-09-21 (D24): keep the split; no domain prototypes requested.
3. **Semantic bindings / Logic IR.** Resolved 2026-09-17: KSG `dev` has R1/R2
   shipped and a seeded `Proposition` prototype. Assessment and build list in
   `docs/KSG-LOGIC-IR-STATUS.md`. Answered 2026-09-21 (D26): formalise the
   doom core first, P3 → P5 → P11 and the no-counterbalance premises P4, P9,
   P10, P20, then the skeptic replies that meet them. Tracked as T7 there.
4. **Rebuttal symmetry.** Resolved 2026-09-21 (D22): the evaluator adds the
   reverse edge automatically (Pollock). Authored one way or both, a live
   mutual rebut is a STANDOFF; derived edges are marked `derived: true`.
5. **Client pin.** Pinned to `v0.2.20-client` from GitHub (package is not on
   npm). Confirm this is the intended release channel for TruthApp.
6. **Comparisons in Logic IR.** Resolved for this repo 2026-09-21 (D25): do
   not fork; nothing is added here. The proposal below is for KSG's ladder.
   Spec v1.1 §6.1 lists comparisons in the
   first-slice subset. KSG's v0.0.1 AST has no comparison node and adding one
   here would fork the IR (D14). Proposal for KSG: a `Compare` kind
   (`{ kind: 'Compare', op: '<'|'<='|'='|'>='|'>', left, right }` over
   literal or bound values) in Logic IR v0.0.2, with canonicalisation rules.
7. **Export the Logic IR core from the client.** `src/logic/ir.mjs` mirrors
   `knowshowgo/src/logic_ir/core.js` and is parity-tested, but it is a copy.
   The August handoff §46 puts the logic facade in `knowshowgo-client`; once
   `core.js` is exported there, this file becomes a re-export.
8. **Quantifier domain.** The local evaluator answers `∀`/`∃` over the
   snapshot's entities and labels the result `domain: 'snapshot'`. Confirm
   this is acceptable for TruthApp (closed snapshot) while KSG refuses until
   KG4 (open graph).
