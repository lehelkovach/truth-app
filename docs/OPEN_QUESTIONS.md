# Open questions (need project-owner input; unrelated work is not blocked)

1. **VSIR/TruthIR frame schema.** The master handoff says to reuse the
   existing frame/slot schema. It is not in `truth-app`, `knowshowgo-client`,
   `iac-bus` or `yolo-online-learner`. v0.1 uses a flat profile
   (`schema/truthir-profile-v0.1.schema.json`). If the frame schema lives
   elsewhere, point to it and the profile will be re-expressed as frames.
2. **KSG object category for units.** The adapter still writes
   `category_name = unit.kind`. KSG already seeds `Utterance` / `Claim` /
   `Proposition` / `Argument` prototypes; switching to them is T1–T2 in
   `docs/KSG-LOGIC-IR-STATUS.md`. Confirm that TruthApp should cast rather
   than keep its own categories.
3. **Semantic bindings / Logic IR.** Resolved 2026-09-17: KSG `dev` has R1/R2
   shipped and a seeded `Proposition` prototype. Assessment and build list in
   `docs/KSG-LOGIC-IR-STATUS.md`. Remaining question for the owner: which
   AI-risk claims should be formalised first (T5 there needs Concept uuids).
4. **Rebuttal symmetry.** A `rebut` is authored as a directed relation. Should
   the evaluator add the reverse edge automatically (Pollock) or leave it to
   the author? v0.1 leaves it to the author and reports STANDOFF only when
   both directions exist.
5. **Client pin.** Pinned to `v0.2.20-client` from GitHub (package is not on
   npm). Confirm this is the intended release channel for TruthApp.
