# Roadmap (from the master handoff, Appendix A)

| PR | Scope | State |
|---|---|---|
| 1 | ESM scaffold + CI, schemas + AJV, canonical hashing, patch/revision/commit/diff, fixtures + tests, architecture docs, grounded evaluator, KSG adapter with fake transport | ✅ this branch |
| 1b | Spec v1.1 deterministic core: KSG Logic IR mirror (parity-tested), native evaluator with proofs and open-world UNKNOWN, concept grounding + equivocation, red/yellow/green diagnostics + status dimensions, fixture branches + compare with evaluation diff, static UI over bundles | ✅ this branch |
| 2 | Cast units to KSG's seeded Logic IR prototypes (T1–T6 in `KSG-LOGIC-IR-STATUS.md`), live KSG round-trip against a dev server, release-contract smoke in CI, composer/review UI shell, Vite wrapper if wanted | next |
| 3 | AI translator: provider-neutral interface, structured TruthPatch proposals, source alignment, accept / edit / reject → commit, prompt-injection regression fixtures | after 2 |
| later | Logic IR bindings via the client (R1/R2), semantic merge, ASP / Bayesian / LNN evaluators, scientific ingestion | research |
