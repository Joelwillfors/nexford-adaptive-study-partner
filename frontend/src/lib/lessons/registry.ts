/**
 * Lesson registry — seeded content for the demo modules.
 *
 * Each lesson has an array of sections. The scroll-checkpoint detector
 * fires `nx:checkpoint` at the end of each section so the mentor drawer
 * can generate a targeted comprehension quiz.
 *
 * In production, this would come from Canvas (LMSProvider.getLessonContent)
 * via LTI deep-linking. For the demo we ship it as MDX-equivalent data.
 */

export interface LessonSection {
  id: string;
  heading: string;
  concept: string;
  estimatedMinutes: number;
  markdown: string;
}

export interface Lesson {
  moduleId: string;
  title: string;
  intro: string;
  sections: LessonSection[];
  nextModuleId?: string;
}

export const LESSONS: Record<string, Lesson> = {
  "module-1": {
    moduleId: "module-1",
    title: "What is Accounting?",
    intro:
      "Already complete in your seeded transcript. The full reader for this module is part of the demo's content roadmap — open module-3 (Accrual vs Cash Accounting) for the live mentor experience.",
    sections: [],
    nextModuleId: "module-2",
  },
  "module-2": {
    moduleId: "module-2",
    title: "The Accounting Equation",
    intro:
      "Already complete in your seeded transcript. The full reader for this module is part of the demo's content roadmap — open module-3 (Accrual vs Cash Accounting) for the live mentor experience.",
    sections: [],
    nextModuleId: "module-3",
  },
  "module-3": {
    moduleId: "module-3",
    title: "Accrual vs Cash Accounting",
    intro:
      "When exactly does an expense hit the books? Cash accounting says: when money moves. Accrual accounting says: when the economic event happens. That one-sentence difference explains most of how real businesses report profit — and why two companies with the same bank balance can show wildly different earnings.",
    sections: [
      {
        id: "s1",
        heading: "1. The core distinction",
        concept: "accrual_vs_cash_timing",
        estimatedMinutes: 8,
        markdown: `Cash accounting records a transaction the moment cash changes hands. You pay a vendor → the expense is recorded. A customer pays you → the revenue is recorded.

Accrual accounting records a transaction when the **economic event** occurs, regardless of whether cash has moved. You *use* electricity for a month → the expense is recognized, even if the bill arrives three weeks later. You *deliver* a service → revenue is recognized, even if the customer hasn't paid yet.

Public companies in every major economy are required to use accrual accounting. Cash-based reporting misrepresents profitability whenever there is any gap between when work is done and when money moves — which is essentially always.

**Why it matters:** A subscription business that collects $1.2M annually upfront on January 1st has not earned $1.2M in January. Under accrual, they earn roughly $100K per month across the year. The cash is in the bank — the revenue is not yet "real."`,
      },
      {
        id: "s2",
        heading: "2. The prepaid expense puzzle",
        concept: "prepaid_expense_matching",
        estimatedMinutes: 10,
        markdown: `Consider a concrete case. On January 1st, your business pays **$12,000 in cash** for a 12-month insurance policy.

Under cash accounting, this is simple: $12,000 expense in January. Done.

Under accrual accounting, it is very different. The policy *covers* 12 months — your business consumes one twelfth of its economic benefit each month. January's expense is **$1,000**, not $12,000. The remaining $11,000 sits on the balance sheet as an asset called **Prepaid Insurance**, which drains by $1,000 each month until it reaches zero in December.

This is the **matching principle** in action: expenses are matched to the period they benefit, not the period the cash left. If you expensed the full $12,000 in January, you would overstate January's costs and understate every subsequent month's costs — distorting your monthly profit picture enough to mislead every stakeholder who reads the statements.

The mental model to hold: **consumption drives recognition, not payment.**`,
      },
      {
        id: "s3",
        heading: "3. When a loan buys a van",
        concept: "accounting_equation_financing",
        estimatedMinutes: 7,
        markdown: `Here is the scenario that trips up almost every first-year accounting student: your company buys a $50,000 delivery van using a bank loan.

Assets increase by $50,000 (you now own a van). What balances the equation?

It is tempting to say equity decreases, because "we owe money." That is wrong. Equity is ownership — it did not change just because you borrowed. What changed is that the business now has a new obligation: **liabilities increase by $50,000**.

Assets = Liabilities + Equity
+$50,000 = +$50,000 + $0

The equation stays in balance. No revenue, no expense, no impact on profit — this was a financing transaction, not an operating one.

The deeper lesson: not every large cash outflow is an expense, and not every expense involves cash. Untangling that knot is what accrual accounting, matching, and the accounting equation are all designed to do.`,
      },
    ],
    nextModuleId: "module-4",
  },
  "module-4": {
    moduleId: "module-4",
    title: "The Matching Principle",
    intro: "Coming up next. For the demo, the content for this module is still being seeded.",
    sections: [],
    nextModuleId: "module-5",
  },
  "module-5": {
    moduleId: "module-5",
    title: "Revenue Recognition",
    intro:
      "Coming up next. For the demo, the content for this module is still being seeded — open module-3 to see the live mentor experience.",
    sections: [],
    nextModuleId: "module-6",
  },
  "module-6": {
    moduleId: "module-6",
    title: "Balance Sheet Analysis",
    intro:
      "Coming up next. For the demo, the content for this module is still being seeded — open module-3 to see the live mentor experience.",
    sections: [],
  },
};

export function getLesson(moduleId: string): Lesson | null {
  return LESSONS[moduleId] ?? null;
}

/**
 * Human-readable title for a module id. Used by the teacher dashboard
 * to label module-grouped buckets without leaking the entire LESSONS
 * map into UI components. Unknown ids fall back to "Other concepts" so
 * tags whose canonical entry has no module mapping still surface in a
 * named bucket rather than disappearing.
 */
export function getModuleTitle(moduleId: string): string {
  return LESSONS[moduleId]?.title ?? "Other concepts";
}
