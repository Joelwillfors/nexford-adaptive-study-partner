# Command Center — one map to every artefact

*Nexford Adaptive Study Partner · Joel Willfors · AI Product Specialist assignment.*

**This single page is the reviewer's index.** Every link below is absolute — the PDF version is designed to be sent standalone and still open every downstream doc directly on GitHub.

## The two live pointers

| Link | Purpose |
|------|---------|
| [**Live prototype on Vercel**](https://nexford-adaptive-study-partner.vercel.app/) | One Vercel deploy, live OpenAI + Supabase, seeded student (Sara Patel) on Business Fundamentals. Toggle **Student ↔ Teacher** from the top nav. |
| [**Source on GitHub**](https://github.com/Joelwillfors/nexford-adaptive-study-partner) | The 48-hour build. Next.js 16 · React 19 · Supabase · OpenAI function calling. |

## Reviewer read order

| Document | When to open it | Time |
|----------|-----------------|------|
| [`SUBMISSION.md`](https://github.com/Joelwillfors/nexford-adaptive-study-partner/blob/main/SUBMISSION.md) | Cover sheet — three artefacts + rubric crosswalk. Start here. | 1 min |
| [`PRODUCT_BRIEF_ONE_PAGER.md`](https://github.com/Joelwillfors/nexford-adaptive-study-partner/blob/main/Docs/PRODUCT_BRIEF_ONE_PAGER.md) · [PDF](https://github.com/Joelwillfors/nexford-adaptive-study-partner/blob/main/Docs/PRODUCT_BRIEF_ONE_PAGER.pdf) | 90-second CPO memo — persistence thesis, four cognitive functions, four decisions, four insights, Canvas-embed diagram. | 2 min |
| [`PRODUCT_BRIEF.md`](https://github.com/Joelwillfors/nexford-adaptive-study-partner/blob/main/Docs/PRODUCT_BRIEF.md) | Long-form brief — six insights, honest gaps, Profiler eval (n=20), Day 1 if hired. | 5 min |
| [`HEADLESS_API.md`](https://github.com/Joelwillfors/nexford-adaptive-study-partner/blob/main/Docs/HEADLESS_API.md) | HTTP + JSON contracts Canvas would consume. Same JSON, two clients. | 3 min |
| [`ROADMAP.md`](https://github.com/Joelwillfors/nexford-adaptive-study-partner/blob/main/Docs/ROADMAP.md) | Shipped / next / explicit non-goals / Tier-3 Adaptive Meta-Agent. | 2 min |
| [`README.md`](https://github.com/Joelwillfors/nexford-adaptive-study-partner/blob/main/README.md) | Repo overview — code layout, local dev, env setup. | 2 min |

## Deploy & operations

| Document | Purpose |
|----------|---------|
| [`DEPLOY.md`](https://github.com/Joelwillfors/nexford-adaptive-study-partner/blob/main/DEPLOY.md) | Vercel deploy from scratch — `frontend/` as Root Directory, four env vars, smoke-test checklist. |
| Vercel project settings | Framework auto-detected from [`frontend/package.json`](https://github.com/Joelwillfors/nexford-adaptive-study-partner/blob/main/frontend/package.json); region + env vars live in Vercel Dashboard, not in a repo-level config file. |

## Smoke-test the live URL in 60 seconds

Open [https://nexford-adaptive-study-partner.vercel.app/](https://nexford-adaptive-study-partner.vercel.app/) and walk the demo spine:

1. **Landing** (`/`) — Sara Patel, 33% through Business Fundamentals, Continue-learning card.
2. **Learn** (`/learn/accrual_vs_cash`) — hover any sentence → *Explain this* → Socratic Mentor opens, streams a reply within ~6s.
3. **Journey** (`/journey`) — concept map of what Sara has mastered so far.
4. **Plan** (`/plan`) — Atlas's deterministic planner, week inside the 12–15h Success Band.
5. **Teacher** (top-nav role pill → Teacher → `/teacher/watchlist`) — Sara's row surfaces with the bottleneck.

If anything 500s, the Vercel function log will flag a missing `OPENAI_API_KEY` or `SUPABASE_SERVICE_ROLE_KEY`.

---

*Regenerate this file's PDF from the repo root: `npm run build:command-center-pdf`.*
*Regenerate the one-pager PDF: `npm run build:onepager-pdf`.*
