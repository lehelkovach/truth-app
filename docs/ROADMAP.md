# Roadmap (from the master handoff, Appendix A)

| PR | Scope | State |
|---|---|---|
| 1 | ESM scaffold + CI, schemas + AJV, canonical hashing, patch/revision/commit/diff, fixtures + tests, architecture docs, grounded evaluator, KSG adapter with fake transport | ✅ this branch |
| 1b | Spec v1.1 deterministic core: KSG Logic IR mirror (parity-tested), native evaluator with proofs and open-world UNKNOWN, concept grounding + equivocation, red/yellow/green diagnostics + status dimensions, fixture branches + compare with evaluation diff, static UI over bundles | ✅ this branch |
| 2 | Cast units to KSG's seeded Logic IR prototypes (T1–T6) ✅, mirrored inference core, prototype-match + inference decisions recorded, push report ✅, live round-trip over real HTTP against a v0.2.20 contract server ✅, release-contract smoke in CI ✅ | done; the only step left is pointing `npm run ksg:smoke` at a real deployment (`KSG_API_URL` + token), which the same command already supports |
| 3 | AI translator: provider-neutral interface ✅, structured TruthPatch proposals ✅ (prose → composer grammar → `compose()` so every proposal is schema- and invariant-validated), source alignment ✅ (verified against real units and real source text), accept / edit / reject → commit review gate ✅ (only `accept()` commits, and only a committable proposal), prompt-injection regression fixtures ✅ (`fixtures/translator/`), offline scripted provider + lazily-imported Anthropic provider, `truth translate` CLI and `/api/translate` + "propose from prose" in the UI | ✅ this branch |
| later | Logic IR bindings via the client (R1/R2), semantic merge, ASP / Bayesian / LNN evaluators, scientific ingestion | research |
