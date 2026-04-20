# Submission — Nexford AI Product Specialist

*Joel Willfors — 48-hour build of an Adaptive Study Partner for Nexford University.*

## Command Center — three links, one read

| What | Why this exists |
|---|---|
| **[Live prototype on Vercel](https://nexford-adaptive-study-partner.vercel.app/)** | Live stack — OpenAI + Supabase in Production; optional demo fixtures via `NEXT_PUBLIC_DEMO_MODE`. |
| **[Product brief (PDF)](Docs/PRODUCT_BRIEF_ONE_PAGER.pdf)** | The strategic motivation, the unit economics, the persistence thesis — printable / iPad. |
| **[Source code & API contracts (GitHub)](https://github.com/Joelwillfors/nexford-adaptive-study-partner)** | Technical depth; headless API inventory in [`Docs/HEADLESS_API.md`](Docs/HEADLESS_API.md). |

Full doc map: [`Docs/COMMAND_CENTER.md`](Docs/COMMAND_CENTER.md).

*Long-form brief: [`Docs/PRODUCT_BRIEF.md`](Docs/PRODUCT_BRIEF.md). One-pager source (Markdown): [`Docs/PRODUCT_BRIEF_ONE_PAGER.md`](Docs/PRODUCT_BRIEF_ONE_PAGER.md).*

---

This page is the reviewer's map. Three artefacts, one read order, one rubric crosswalk. Total time to evaluate: **~10 minutes**, plus the live demo if you want to drive.

---

## The three artefacts, in read order

1. **The live demo** — [**nexford-adaptive-study-partner.vercel.app**](https://nexford-adaptive-study-partner.vercel.app/). Live OpenAI + Supabase; the role pill in the top nav toggles between Student and Teacher. A three-minute backup video walkthrough is available on request for the async-review path.
2. **The one-pager** — [`Docs/PRODUCT_BRIEF_ONE_PAGER.md`](Docs/PRODUCT_BRIEF_ONE_PAGER.md) (also available as PDF: [`Docs/PRODUCT_BRIEF_ONE_PAGER.pdf`](Docs/PRODUCT_BRIEF_ONE_PAGER.pdf)). 90-second CPO memo with the persistence thesis, the four cognitive functions, the four highest-leverage decisions, the four insights, and the Canvas-embed production diagram. **~2 min.**
3. **The long-form brief** — [`Docs/PRODUCT_BRIEF.md`](Docs/PRODUCT_BRIEF.md). Full Problem & User → Why AI → What I built → What I learned, with the Fermi cohort-economics derivation, **six named insights** (Calibration story, Ambition reduction, the mid-build pivot, the original three), the Honest gaps section with the cut-conviction line and the *what-you-will-not-see* disclosure, the **Profiler eval (n=20)** table with measured 90 / 55 / 70 numbers, and a **Day 1 if hired** 60-day shipping plan. **~5 min.**

If a question comes up that isn't answered in the three above:

- **Engineering / file layout** — [`Docs/README.md`](Docs/README.md).
- **API contracts Canvas would consume** — [`Docs/HEADLESS_API.md`](Docs/HEADLESS_API.md).
- **What's shipped, next, and explicitly out of scope** — [`Docs/ROADMAP.md`](Docs/ROADMAP.md).

---

## Rubric → artefact map

The four assignment rubric categories, mapped to where each is best evaluated:

| Rubric category | Best evaluated in | What to look for |
|---|---|---|
| **Execution** | Live demo + [`DEPLOY.md`](DEPLOY.md) | All four cognitive functions wired end-to-end against a single seeded course; demo-mode hardening; a green Vercel deploy from a clean clone. |
| **AI Fluency** | One-pager *(Why AI section)* + long-form *(Profiler eval n=20)* + demo Act 2 *(mode switching as RAG escape hatch)* | Five tools shipped through OpenAI function calling; RAG threshold calibration story (0.72 → 0.50); structured-JSON Profiler with a measurable eval harness; the explicit decision about *when* to relax a technical constraint in favor of human pedagogy. |
| **Product Judgment** | Long-form section 4 *(Insight 5 — Ambition reduction, Insight 6 — Mid-build pivot)* + [`Docs/ROADMAP.md`](Docs/ROADMAP.md) explicit non-goals + the *Day 1 if hired* 60-day list | Six agents shipped down to three; live OAuth shipped down to `.ics`; destination-AI-surface shipped down to *"the page the student already opens"* — and the *process* of arriving there (hypothesis built, hypothesis tested by building, hypothesis updated mid-build) is documented as Insight 6, not improvised in the room. |
| **Insight** | Long-form section 4 *(Insights 1–6)* + the Closing | Six named insights — the deterministic divide, restraint as a feature, making the verification probe visible, calibration logs as an AI-product receipt, ambition reduction as the strongest judgment, and the hypothesis-driven mid-build pivot as the methodology that produced it. Each tied back to the persistence thesis. |

---

## How to evaluate in 10 minutes

If you only have ten minutes:

1. **2 min** — read the one-pager.
2. **3 min** — watch the 3-minute demo recording (or click through the live URL to `/learn` → `/journey` → `/plan` → `/teacher/watchlist`).
3. **5 min** — skim long-form sections 3 (*What I built — four cognitive functions*) and 4 (*Six insights + Honest gaps + Profiler eval table*).

The persistence thesis is the spine of all three; if any one of the three doesn't make the persistence loop visible end-to-end, it's a defect in the artefact, not the product.

---

*Submitted as the Nexford University AI Product Specialist assignment.*
