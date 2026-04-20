# Nexford Adaptive Study Partner

*The intelligence layer that docks into Nexford's Canvas to win the persistence war.*

This repo is the **AI Product Specialist assignment submission** — a working prototype of an adaptive study partner for Nexford University, plus the product brief and demo script that frame it.

If you only have ten minutes, start with [`SUBMISSION.md`](SUBMISSION.md). For a single map of every doc and deploy note, see [`Docs/COMMAND_CENTER.md`](Docs/COMMAND_CENTER.md).

## Command Center — three links, one read

| What | Why this exists |
|---|---|
| **[Live prototype on Vercel](https://nexford-adaptive-study-partner.vercel.app/)** | Live OpenAI + Supabase when env vars are set; optional `NEXT_PUBLIC_DEMO_MODE=true` only for deterministic fixtures. |
| **[Product brief (PDF)](Docs/PRODUCT_BRIEF_ONE_PAGER.pdf)** | The strategic motivation, the unit economics, the persistence thesis — printable / iPad. |
| **[Source code & API contracts (GitHub)](https://github.com/Joelwillfors/nexford-adaptive-study-partner)** | Technical depth; headless API inventory in [`Docs/HEADLESS_API.md`](Docs/HEADLESS_API.md). |

Regenerate the PDF after editing the one-pager: run `npm run build:onepager-pdf` from the repo root (after `npm install` once).

---

## What this is

**One Adaptive Study Partner with four cognitive functions** — Sensing (the Profiler), Teaching (the Socratic Mentor), Planning (Atlas + the deterministic Planner), and Closing the loop (the Watchlist). Each function targets a different point in the dropout funnel; together they form a single persistence loop from *student got stuck* → *intervention this week.*

The standalone web app in this repo is the **proof of the contract** — same JSON, two clients. Production is a **headless intelligence layer embedded inside Nexford's existing Canvas**: Mentor next to the lecture text, Atlas next to the calendar, Watchlist inside the instructor dashboard. The standalone surfaces are receipts for the contracts Canvas would consume; the full route inventory is in [`Docs/HEADLESS_API.md`](Docs/HEADLESS_API.md).

Built in 48 hours for the assignment. The 48-hour build is the proof that the contract holds.

## Try the live demo

The deploy runs **live** against OpenAI + Supabase when the production env vars from [`DEPLOY.md`](DEPLOY.md) are set; deterministic demo fixtures are available via the optional `NEXT_PUBLIC_DEMO_MODE=true` flag. Identity is hardcoded to the seeded student (Sara Patel); all four cognitive functions wire up against a single seeded course (Business Fundamentals — accounting).

- **Deployed URL** — [nexford-adaptive-study-partner.vercel.app](https://nexford-adaptive-study-partner.vercel.app/). Production uses the Vercel env vars described in [`DEPLOY.md`](DEPLOY.md); demo fixtures are optional.
- Toggle between the **Student** view (`/`, `/learn`, `/journey`, `/plan`) and the **Teacher** view (`/teacher`, `/teacher/watchlist`, `/teacher/student/[id]`) using the role pill in the top nav.
- The narrative path the demo script walks: hover a sentence on a lecture page → Mentor opens → ask the gym-membership question → mode switches after 2 wrong → Profiler records the bottleneck → Watchlist surfaces it for the instructor → Atlas re-plans the week.

To run locally:

```bash
cd frontend
npm install
cp .env.example .env.local        # add SUPABASE_*, OPENAI_API_KEY
npm run dev                       # http://localhost:3000
```

## Read the brief

| Doc | When to read |
|---|---|
| [`Docs/PRODUCT_BRIEF_ONE_PAGER.md`](Docs/PRODUCT_BRIEF_ONE_PAGER.md) | 90 seconds — the CPO memo (PDF: [`PRODUCT_BRIEF_ONE_PAGER.pdf`](Docs/PRODUCT_BRIEF_ONE_PAGER.pdf)). |
| [`Docs/PRODUCT_BRIEF.md`](Docs/PRODUCT_BRIEF.md) | 10 minutes — the long form, six insights, honest gaps, Profiler eval table. |
| [`Docs/HEADLESS_API.md`](Docs/HEADLESS_API.md) | The contracts Canvas would consume — same JSON, two clients. |
| [`Docs/ROADMAP.md`](Docs/ROADMAP.md) | What's shipped, what's next, what's explicitly out of scope. |
| [`Docs/README.md`](Docs/README.md) | Engineering-side internal overview (architecture, file layout, dev notes). |
| [`Docs/COMMAND_CENTER.md`](Docs/COMMAND_CENTER.md) | One-page map to every doc + deploy pointers. |
| [`SUBMISSION.md`](SUBMISSION.md) | Reviewer cover sheet — the three artefacts in read order, mapped to the assignment rubric. |

---

*Submitted as the Nexford AI Product Specialist assignment. Joel Willfors.*
