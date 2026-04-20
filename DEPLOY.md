# Deploy — Nexford Adaptive Study Partner

A production deploy of the prototype to Vercel takes ~5 minutes. The
standalone UI in this repo is the proof of the [`HEADLESS_API.md`](Docs/HEADLESS_API.md)
contracts; production lives inside Nexford's Canvas.

**Demo mode:** no forced `NEXT_PUBLIC_DEMO_MODE` in config. For **live** Mentor / Profiler / Supabase behaviour in Production, set the four variables below and **omit** `NEXT_PUBLIC_DEMO_MODE` (or set it to `false`). For a **flaky-demo** or offline rehearsal only, you can set `NEXT_PUBLIC_DEMO_MODE=true` in Vercel Project Settings → Environment Variables, or in `frontend/.env.local` locally.

## Prerequisites

- Vercel account (free tier is fine for the demo).
- Vercel CLI: `npm i -g vercel`.
- A populated `frontend/.env.local` so `npm run build` succeeds locally.
- An OpenAI API key with access to `gpt-4o-mini` and `gpt-4o`.
- A Supabase project with the migrations in [`supabase/migrations/`](supabase/migrations/) applied (required for live mode without `NEXT_PUBLIC_DEMO_MODE`).

## Steps

```bash
# 1. From the repo root, link the project. When prompted for the
#    *project root*, point Vercel at frontend/ — the Next.js app lives
#    there. Vercel auto-detects Next.js from frontend/package.json;
#    no repo-level vercel.json is required.
vercel link

# 2. Push required env vars to Vercel (Production scope).
#    Do not set NEXT_PUBLIC_DEMO_MODE unless you want deterministic fixtures.
vercel env add NEXT_PUBLIC_SUPABASE_URL production
vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY production
vercel env add SUPABASE_SERVICE_ROLE_KEY production
vercel env add OPENAI_API_KEY production

# 3. Verify the build works locally before pushing — Vercel runs the
#    same command, so a green local build is a green Vercel build.
cd frontend
npm install
npm run build
cd ..

# 4. Deploy to production.
vercel deploy --prod

# 5. Paste the printed URL into SUBMISSION.md (the cover sheet) so a
#    reviewer landing on GitHub gets one click to the live demo.
```

## Smoke test the live URL

Current production deploy: [https://nexford-adaptive-study-partner.vercel.app/](https://nexford-adaptive-study-partner.vercel.app/).

After deploy, hit the URL and:

- `/` should render the role-toggle landing page.
- `/learn/accrual_vs_cash` should stream a Mentor reply within 6 seconds.
- `/plan` should render a week of slots inside the 12–15h Success Band.
- `/teacher/watchlist` should show Sara Patel's row at the top.

If `/api/chat` errors with a 500, check the Vercel function log for
`OPENAI_API_KEY` or `SUPABASE_SERVICE_ROLE_KEY` not being set.

## Common gotchas

- **Next.js 16 / React 19 build warnings.** Expected; the build still
  produces a green deploy.
- **Edge function regional pinning.** Set region in Vercel Dashboard →
  Project → Settings → Functions → Region (e.g. `iad1` for consistent
  OpenAI latency from US-East). Change if you're demoing from EU.
- **Optional demo flag:** If you add `NEXT_PUBLIC_DEMO_MODE`, it must be the
  string `"true"` to enable fixtures. Omit it for live OpenAI + Supabase.
