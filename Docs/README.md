# Nexford Adaptive Study Partner — Internal Overview

The **Adaptive Study Partner** is the agentic coursework companion for Nexford University students. A single Next.js app composes three specialised AI agents on top of a Supabase Postgres + pgvector backend; together they replace the *"upload PDF, get summary"* loop with an evidence-grounded Socratic mentor, an asynchronous learner-state profiler, and a deterministic weekly study planner.

## Mission

**Help every student earn the "aha" moment, then the credential — without the dropout.**

Nexford's 95%-pass-rate graduates are the existence proof; the bottleneck is the silent middle of the cohort who get stuck on a single concept and disengage. The Adaptive Study Partner exists to surface that struggle in real time (Socratic Mentor → Profiler), translate it into a teacher-actionable signal (Class Intelligence dashboard), and convert the resulting plan into a week the student will actually follow (Planner Agent + function-calling chat).

## What lives where

| Layer | Path | Role |
|---|---|---|
| **UI** | [`frontend/src/app/`](../frontend/src/app/) | Next.js 16 + React 19 surfaces: portal, learn, plan, journey, teacher. |
| **Socratic Mentor** | [`frontend/src/lib/ai/socratic-mentor.ts`](../frontend/src/lib/ai/socratic-mentor.ts), [`frontend/src/app/api/chat/route.ts`](../frontend/src/app/api/chat/route.ts) | RAG-grounded GPT-4o agent. Two modes (Socratic / Direct) with a deterministic ZPD trigger. |
| **Profiler Agent** | [`frontend/src/lib/ai/profiler.ts`](../frontend/src/lib/ai/profiler.ts) | Async fire-and-forget pass after every exchange; writes `reasoning_step_failed`, `misconception`, `bottleneck` into a JSONB knowledge graph. |
| **Planner Agent** | [`frontend/src/lib/ai/planner-agent.ts`](../frontend/src/lib/ai/planner-agent.ts), [`frontend/src/app/api/plan/generate/route.ts`](../frontend/src/app/api/plan/generate/route.ts) | Deterministic forgetting-curve + greedy-fill 7-day plan against a 3-unit daily cognitive-load budget. No LLM call; auditable. |
| **Function-calling Planner Chat** | [`frontend/src/lib/ai/planner-tools.ts`](../frontend/src/lib/ai/planner-tools.ts), [`frontend/src/app/api/plan/chat/route.ts`](../frontend/src/app/api/plan/chat/route.ts) | GPT-4o tool-use loop (`move_slot` / `trim_day` / `add_remediation`) for natural-language plan edits. Reasoning panel exposes every tool call. |
| **LMS abstraction** | [`frontend/src/lib/lms/`](../frontend/src/lib/lms/) | `LMSProvider` interface with `MockCanvasProvider` (ships) and `CanvasProvider` (stub). Powers the home-portal hero, the Canvas pill in nav, and the gradebook export ledger. |
| **Document ingestion** | [`frontend/src/lib/ai/ingest-pipeline.ts`](../frontend/src/lib/ai/ingest-pipeline.ts) | Async PDF → overlap-aware chunking → batch embeddings → pgvector. 202 Accepted with task queue. |
| **Persistence** | [`supabase/migrations/`](../supabase/migrations/) | Foundation schema + per-feature migrations (`learner_profiles`, `chat_logs`, `gradebook_exports`, `availability_rules`). |
| **Shared types** | [`frontend/src/lib/planner/types.ts`](../frontend/src/lib/planner/types.ts), [`frontend/src/lib/ai/concept-canon.ts`](../frontend/src/lib/ai/concept-canon.ts) | Single source of truth for plan shapes and the canonical concept registry consumed by Mentor, Profiler, Planner, and Teacher views. |

## Running the stack

```bash
cd frontend
npm install
npm run dev
```

Next.js boots on **port 3000**. Required env in `frontend/.env.local`:

- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` — hosted Supabase project (Frankfurt).
- `OPENAI_API_KEY` — Mentor, Profiler, Planner Chat.
- Optional: `NEXT_PUBLIC_DEMO_MODE=true` returns deterministic seed data so the demo cannot fail on cold-start or rate-limit.

Migrations are applied via `supabase db push` from the repo root after `supabase link --project-ref <ref>`. The repo's CLI history (`supabase migration list`) is the source of truth for what's deployed.

## Further reading

- [`Docs/PRODUCT_BRIEF.md`](./PRODUCT_BRIEF.md) — Long-form product brief (assignment Part 3): Problem, Why AI, What was built, Product Insight, Honest Gaps.
- [`Docs/PRODUCT_BRIEF_ONE_PAGER.md`](./PRODUCT_BRIEF_ONE_PAGER.md) — 90-second CPO memo version of the brief.
- [`Docs/DEMO_SCRIPT.md`](./DEMO_SCRIPT.md) — Stage script and rehearsal checklist for the live demo (assignment Part 4).
- [`Docs/ROADMAP.md`](./ROADMAP.md) — Currently shipped, next sprint, six-month horizon, holy grail, explicit non-goals. The archive of restraint.
- [`Docs/HEADLESS_API.md`](./HEADLESS_API.md) — The contracts Canvas would consume. Same JSON, two clients (the standalone UI in this repo, and Canvas in production).

---

*Internal documentation. The product is the live demo, not the docs.*
