# Command Center — one map to every doc

Use this page when you need **one place** that points to the right artefact. Replace the placeholders below after you push to GitHub and deploy to Vercel.

| Link | Purpose |
|------|---------|
| **Live app (Vercel)** | `https://YOUR-PRODUCTION-URL.vercel.app` — replace with your Production deployment URL. |
| **Source (GitHub)** | `https://github.com/YOUR_USER/YOUR_REPO` — replace after first push. |

## Read order & roles

| Document | When to open it |
|----------|-----------------|
| [`../SUBMISSION.md`](../SUBMISSION.md) | Reviewer cover sheet — three artefacts, rubric crosswalk. |
| [`PRODUCT_BRIEF_ONE_PAGER.md`](./PRODUCT_BRIEF_ONE_PAGER.md) · [PDF](./PRODUCT_BRIEF_ONE_PAGER.pdf) | 90-second CPO memo. |
| [`PRODUCT_BRIEF.md`](./PRODUCT_BRIEF.md) | Long-form brief, insights, honest gaps, Profiler eval. |
| [`DEMO_SCRIPT.md`](./DEMO_SCRIPT.md) | Live walkthrough script and rehearsal checklist. |
| [`HEADLESS_API.md`](./HEADLESS_API.md) | HTTP JSON contracts for a Canvas embed. |
| [`ROADMAP.md`](./ROADMAP.md) | Shipped / next / non-goals. |
| [`README.md`](./README.md) | Engineering overview — where code lives. |

## Deploy & ops

| Document | Purpose |
|----------|---------|
| [`../DEPLOY.md`](../DEPLOY.md) | Vercel: `frontend/` as root, env vars, `vercel deploy --prod`. |
| [`../vercel.json`](../vercel.json) | Region (`iad1`) and framework defaults — **does not** force `NEXT_PUBLIC_DEMO_MODE`. |

---

*Regenerate one-pager PDF from repo root: `npm run build:onepager-pdf`.*
