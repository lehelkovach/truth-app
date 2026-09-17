/**
 * Catalogue of named fallacies and reasoning defects.
 *
 * Each entry has a category, a one-line definition and the *test* an analyst
 * applies before attaching the label. Fallacy annotations are units of kind
 * `annotation` that name an entry here; the evaluator only checks that the
 * name exists. Structural checks that can be automated (modal overreach,
 * unsourced premise, circularity) emit codes that map back to entries via
 * `code`.
 */

const entries = [
  ['appeal_to_possibility', 'presumption', "Treating 'X could happen' as if it established 'X will (probably) happen'.", 'Do the premises only establish possibility while the conclusion asserts probability or certainty?', 'MODAL_OVERREACH'],
  ['unsupported_premise', 'presumption', 'A load-bearing premise is asserted without evidence, definition or argument.', 'Would the argument collapse if this premise were denied, and is nothing offered for it?', 'UNSOURCED_PREMISE'],
  ['circular_reasoning', 'presumption', 'The conclusion is assumed, directly or through a chain, among the premises.', 'Trace the support chain: does it return to the conclusion?', 'CIRCULAR'],
  ['hasty_generalization', 'induction', 'Generalising from a small, unrepresentative or contrived sample.', 'Is the sample size, setting or selection adequate for the population the conclusion covers?'],
  ['unwarranted_extrapolation', 'induction', 'Extending a trend beyond the range where it was observed without a mechanism that guarantees it continues.', 'What physical, economic or data constraint could bend the curve, and has it been ruled out?'],
  ['appeal_to_authority', 'relevance', "Using an expert's opinion as evidence outside the domain where expertise gives privileged access, or where equally qualified experts disagree.", "Is the claim within the authority's domain, does expertise confer accuracy on it, and is expert opinion divided?"],
  ['argument_from_ignorance', 'presumption', 'Treating the absence of a disproof as support for a claim.', "Is the only support 'nobody has shown it is false'?"],
  ['false_dilemma', 'presumption', 'Presenting two options as exhaustive when intermediate or alternative outcomes exist.', 'List the outcomes the argument excludes. Are any of them live?'],
  ['slippery_slope', 'causal', 'A chain of consequences asserted without showing each link is likely, treating the endpoint as the probable outcome.', 'Assign a probability to each link; is the product still high enough to support the conclusion?'],
  ['equivocation', 'ambiguity', 'A key term shifts meaning between premises and conclusion.', 'Substitute one fixed definition throughout: does the argument still go through?'],
  ['pascals_mugging', 'decision', 'Justifying an action by multiplying a tiny or unmeasured probability by an unbounded stake, so the probability estimate does no work.', 'Would the argument recommend the same action at a probability 100x smaller?'],
  ['conjunction_neglect', 'probability', 'Assigning a multi-step scenario a probability higher than the product of its steps.', 'How many independent links must all hold? Multiply.'],
  ['disjunction_neglect', 'probability', 'Assuming a bad outcome requires one specific path when many independent paths lead to it.', 'Are there other routes to the conclusion the objection ignores, and are they independent?'],
  ['anthropomorphism', 'analogy', 'Attributing human motives (self-preservation, ambition, deceit) to a system without showing it has them.', 'Is the motive demonstrated in the system or imported from the human analogy?'],
  ['lump_of_labor', 'economics', 'Assuming a fixed quantity of work so that automating a task removes a job one-for-one.', 'Does the argument account for new tasks, lower prices and demand growth?'],
  ['appeal_to_history', 'induction', "Treating failed past predictions as evidence that a present prediction is wrong ('cry wolf').", 'Is the reference class of past predictions relevant, and are the mechanisms the same?'],
  ['survivorship_bias', 'induction', 'Reasoning only from cases that were observed to turn out fine.', 'Would the cases that turned out badly have been observed?'],
  ['motte_and_bailey', 'ambiguity', 'Defending a modest claim when challenged, then reasserting the strong claim.', 'Are there two claims sharing a name, one easy to defend and one doing the work?'],
  ['straw_man', 'relevance', "Attacking a weaker version of the opponent's argument.", 'Would the opponent recognise the version being attacked as their own?'],
  ['burden_shift', 'presumption', 'Demanding the other side disprove a claim the proponent has not supported.', 'Who asserted, and who is being asked to prove?'],
  ['base_rate_neglect', 'probability', 'Ignoring the prior frequency of an outcome when weighing new evidence.', 'What is the base rate, and does the argument say why this case differs?'],
  ['tu_quoque', 'relevance', "Dismissing a claim because the speaker does not act consistently with it.", "Does the speaker's behaviour bear on whether the claim is true?"]
];

export const FALLACIES = Object.freeze(Object.fromEntries(entries.map(([name, category, definition, test, code]) => [name, Object.freeze({ name, category, definition, test, code: code ?? null })])));

export function describeFallacy(name) {
  return FALLACIES[name] ?? null;
}

export function fallacyByCode(code) {
  return Object.values(FALLACIES).find((f) => f.code === code) ?? null;
}
