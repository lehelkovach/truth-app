# Open questions (need project-owner input; unrelated work is not blocked)

1. **VSIR/TruthIR frame schema.** The master handoff says to reuse the
   existing frame/slot schema. It is not in `truth-app`, `knowshowgo-client`,
   `iac-bus` or `yolo-online-learner`. v0.1 uses a flat profile
   (`schema/truthir-profile-v0.1.schema.json`). If the frame schema lives
   elsewhere, point to it and the profile will be re-expressed as frames.
2. **KSG object category for units.** The adapter writes every unit with
   `category_name = unit.kind` under parent `TruthUnit`. Should these be
   prototypes (per the KSG Truth Foundation handoff, "claims are not
   intrinsic types") once prototype matching is exposed in the client?
3. **Semantic bindings / Logic IR.** The Logic IR v0.0.1 handoff belongs to
   the KSG server repo, not here. TruthApp claims carry surface text only;
   `formalized_as` links will be added when the client exposes Logic IR
   persistence (client R1/R2 rungs).
4. **Rebuttal symmetry.** A `rebut` is authored as a directed relation. Should
   the evaluator add the reverse edge automatically (Pollock) or leave it to
   the author? v0.1 leaves it to the author and reports STANDOFF only when
   both directions exist.
5. **Client pin.** Pinned to `v0.2.20-client` from GitHub (package is not on
   npm). Confirm this is the intended release channel for TruthApp.
