/**
 * Concept tag canonicalization.
 *
 * The Socratic mentor, the profiler, and the lesson registry each emit
 * `concept_tag` strings independently. Without a shared vocabulary they
 * drift: `accrual_accounting_revenue_recognition` from the mentor,
 * `revenue_recognition` from the profiler, and `unearned_revenue` from
 * the lesson all refer to the same idea but show up as distinct nodes
 * in the student's knowledge graph. That breaks the Journey view's
 * credibility and makes the teacher dashboard look noisy.
 *
 * The fix is deliberately low-tech: a hand-curated alias table plus a
 * normalization function. We call `canonicalConceptTag` at every write
 * site (chat route + profiler merge + mentor return payload) so the
 * knowledge graph only ever stores canonical keys. Reads do not need to
 * normalize because writes already did.
 *
 * Scale note: this table is intentionally small. When we seed more lessons
 * we extend the table; we explicitly do NOT use an LLM to dedupe at write
 * time because the cost-per-turn penalty is not justified for a bounded
 * concept universe. A drift-warning log surfaces unseen tags during stress
 * tests so the table stays honest.
 */

export const CANONICAL_KEYS = [
  "accrual_vs_cash",
  "matching_principle",
  "prepaid_expenses",
  "revenue_recognition",
  "expense_recognition",
  "accounting_equation",
  "depreciation",
  "asset",
  "wacc",
  "customer_acquisition_cost",
  "lifetime_value",
] as const;

export type CanonicalConcept = (typeof CANONICAL_KEYS)[number];

/**
 * Alias → canonical mapping. Keys are already lowercased + snake_cased by
 * the normalizer before lookup, so entries here must also be normalized.
 * Canonical values map to themselves to keep the lookup branch-free.
 */
const CANONICAL_ALIASES: Record<string, CanonicalConcept> = {
  // accrual_vs_cash — the core timing distinction
  accrual_vs_cash: "accrual_vs_cash",
  cash_vs_accrual: "accrual_vs_cash",
  accrual_vs_cash_timing: "accrual_vs_cash",
  accrual_vs_cash_accounting: "accrual_vs_cash",
  cash_vs_accrual_timing: "accrual_vs_cash",
  cash_vs_accrual_accounting: "accrual_vs_cash",
  accrual_accounting: "accrual_vs_cash",
  cash_accounting: "accrual_vs_cash",
  accrual_basis: "accrual_vs_cash",
  cash_basis: "accrual_vs_cash",

  // matching_principle — the rule that links a cost to the period it helps
  matching_principle: "matching_principle",
  matching: "matching_principle",
  matching_principle_in_action: "matching_principle",
  expense_matching: "matching_principle",
  expense_recognition_principle: "matching_principle",

  // prepaid_expenses — the $12k insurance family (canonical plural)
  prepaid_expenses: "prepaid_expenses",
  prepaid_expense: "prepaid_expenses",
  prepaid_expense_matching: "prepaid_expenses",
  prepaid_expense_accounting: "prepaid_expenses",
  prepaid_insurance: "prepaid_expenses",
  prepaid_insurance_expense: "prepaid_expenses",
  prepaid_asset: "prepaid_expenses",
  deferred_expense: "prepaid_expenses",

  // revenue_recognition — the $1.2k gym family (canonical renamed from
  // accrual_revenue_recognition; old tag kept as alias for legacy rows)
  revenue_recognition: "revenue_recognition",
  accrual_revenue_recognition: "revenue_recognition",
  accrual_accounting_revenue_recognition: "revenue_recognition",
  accrual_revenue: "revenue_recognition",
  unearned_revenue: "revenue_recognition",
  deferred_revenue: "revenue_recognition",
  deferred_revenue_recognition: "revenue_recognition",

  // expense_recognition — distinct from matching_principle: this one is
  // about splitting a known expense across periods (rent, utilities),
  // not about pairing an expense to the revenue it produced
  expense_recognition: "expense_recognition",
  accrual_accounting_expenses: "expense_recognition",
  rent_expense_recognition: "expense_recognition",
  monthly_rent_calculation: "expense_recognition",

  // accounting_equation — the van-loan family
  accounting_equation: "accounting_equation",
  accounting_equation_balance: "accounting_equation",
  accounting_equation_financing: "accounting_equation",
  balance_sheet_equation: "accounting_equation",
  fundamental_accounting_equation: "accounting_equation",
  assets_liabilities_equity: "accounting_equation",

  // depreciation — includes the LLM-invented "cost_spreading" family
  depreciation: "depreciation",
  straight_line_depreciation: "depreciation",
  cost_spreading: "depreciation",
  asset_cost_allocation: "depreciation",
  asset_value_allocation: "depreciation",
  asset_value_recognition: "depreciation",

  // asset — the "what counts as an asset" primer
  asset: "asset",
  asset_definition: "asset",

  // wacc — weighted average cost of capital (finance track)
  wacc: "wacc",
  weighted_average_cost_of_capital: "wacc",

  // unit economics (profiler examples; rarely mentor-emitted today)
  customer_acquisition_cost: "customer_acquisition_cost",
  cac: "customer_acquisition_cost",
  lifetime_value: "lifetime_value",
  ltv: "lifetime_value",
  customer_lifetime_value: "lifetime_value",
};

/**
 * Cognitive load per concept (1–3 scale per Bjork 1994 desirable
 * difficulty framing): 1 = foundational definitional, 2 = single-step
 * application, 3 = multi-step calculation / cross-concept synthesis.
 *
 * Used by the Planner Agent (Phase 3 Block B) to fill a daily load
 * budget rather than just stack count: 3 units/day pairs cleanly as
 * 1×load-3 (one deep-work block), 1×load-2 + 1×load-1 (a heavier
 * application slot plus a quick review), or 3×load-1 (a "review day"
 * of three short refreshers). The 3-unit cap pairs with 60–120 min
 * deep-work slot durations to land the week inside Nexford's 12–15h
 * success band — see `study-band.ts`.
 *
 * Values are deliberately conservative for the demo cohort (early
 * undergrad). Re-tune once we have actual time-to-mastery telemetry.
 */
export const COGNITIVE_LOAD: Record<CanonicalConcept, 1 | 2 | 3> = {
  accrual_vs_cash: 1,
  matching_principle: 2,
  prepaid_expenses: 2,
  revenue_recognition: 2,
  expense_recognition: 2,
  accounting_equation: 1,
  depreciation: 3,
  asset: 1,
  wacc: 3,
  customer_acquisition_cost: 2,
  lifetime_value: 2,
};

/**
 * Module routing — which lesson to deep-link to when a student clicks
 * "Let's work on it" from the Journey view. Currently only module-3 is
 * seeded; everything defaults there. When we ship more modules we extend
 * the map without touching callers.
 */
const CONCEPT_TO_MODULE: Record<CanonicalConcept, string> = {
  accrual_vs_cash: "module-3",
  matching_principle: "module-3",
  prepaid_expenses: "module-3",
  revenue_recognition: "module-3",
  expense_recognition: "module-3",
  accounting_equation: "module-3",
  depreciation: "module-3",
  asset: "module-3",
  wacc: "module-3",
  customer_acquisition_cost: "module-3",
  lifetime_value: "module-3",
};

/**
 * Normalize a raw concept_tag string. Trims, lowercases, converts spaces
 * and hyphens to underscores. Returns null on empty input so callers can
 * use `??` to fall back to context-derived tags.
 */
export function normalizeConceptTag(raw?: string | null): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  return trimmed.toLowerCase().replace(/[\s-]+/g, "_").replace(/_+/g, "_");
}

/**
 * Canonicalize a raw concept_tag. Applies the alias table after normalization.
 * If the input is not in the table we return the normalized form — this keeps
 * unknown tags visible in the graph rather than dropping them, and lets the
 * drift-warning log surface them for the next alias-table update.
 */
export function canonicalConceptTag(
  raw?: string | null,
): string | null {
  const normalized = normalizeConceptTag(raw);
  if (!normalized) return null;
  return CANONICAL_ALIASES[normalized] ?? normalized;
}

/**
 * True when a normalized tag is already in our canonical vocabulary.
 * Used by the drift-warning log to flag new tags for triage.
 */
export function isKnownCanonicalConcept(
  raw?: string | null,
): boolean {
  const normalized = normalizeConceptTag(raw);
  if (!normalized) return false;
  return normalized in CANONICAL_ALIASES;
}

/**
 * Map a canonical (or raw) concept tag to the lesson module that teaches
 * it. Falls back to module-3 for unknown tags so Journey click-through
 * never dead-ends.
 */
export function moduleIdFor(raw?: string | null): string {
  const canonical = canonicalConceptTag(raw);
  if (canonical && canonical in CONCEPT_TO_MODULE) {
    return CONCEPT_TO_MODULE[canonical as CanonicalConcept];
  }
  return "module-3";
}
