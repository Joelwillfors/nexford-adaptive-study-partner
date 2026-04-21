# Scaling the Headless API to 10,000 Students

*Operational readiness brief. Companion to [`PRODUCT_BRIEF_ONE_PAGER.md`](https://github.com/Joelwillfors/nexford-adaptive-study-partner/blob/main/Docs/PRODUCT_BRIEF_ONE_PAGER.md) and [`HEADLESS_API.md`](https://github.com/Joelwillfors/nexford-adaptive-study-partner/blob/main/Docs/HEADLESS_API.md). Last revised April 2026.*

---

## TL;DR

- **10,000 students fits the current architecture.** No re-platforming, no new services — Vercel Edge, Supabase Pro, and the existing agent split all scale horizontally under this load.
- **Four operational levers do the work:** OpenAI tier upgrade + prompt caching, Profiler async queue, read replicas (or materialized views) for the teacher dashboard, and cost governance per student.
- **The bottleneck is not architecture — it is OpenAI rate limits.** Hit first, fixable inside a week, and predictable from day one.

---

## Workload profile at 10k students

Assumptions: a typical Nexford cohort hits the product ~4 times/week per student, 60% of visits include a Mentor exchange of 3–5 turns, every Mentor turn fires one async Profiler pass.

| Signal | Per student / day | At 10k students |
|---|---|---|
| Mentor turns (GPT-4o) | ~2.1 | ~21,000/day · ~2.2/sec peak |
| Profiler passes (GPT-4o-mini, async) | ~2.1 | ~21,000/day |
| Planner / Atlas tool calls (GPT-4o) | ~0.3 | ~3,000/day |
| Dashboard aggregations (teacher-initiated) | — | ~200/day peak at 08:00 local |
| Database writes | ~10 | ~100,000/day |

**Rough LLM spend**, GPT-4o @ $2.5/M input · $10/M output, GPT-4o-mini @ $0.15/M · $0.60/M, with prompt caching on the Mentor system prompt: **~$4–6k/month**. This is the dominant variable cost; everything else (Vercel, Supabase Pro) is a fixed sub-$1k line. That gives a per-student marginal cost of roughly **$0.40–0.60/month** — an order of magnitude below Nexford's revenue per student.

---

## What scales automatically

These components need **no intervention** at 10k students.

- **Vercel Edge Functions.** Stateless request handlers, auto-scale per request. The headless API contracts in [`HEADLESS_API.md`](https://github.com/Joelwillfors/nexford-adaptive-study-partner/blob/main/Docs/HEADLESS_API.md) are a thin layer over Supabase + OpenAI; cold-start risk is mitigated by regional pinning (`iad1`) and by the fact that warm concurrency at 21k Mentor calls/day is easily sustained.
- **Supabase Pro.** An 8 GB / 2 vCPU instance handles ~100k writes/day and the Mentor read path (RLS-filtered `SELECT` on `chat_sessions`, `messages`, `profile_entries`) with comfortable headroom. The existing indexes on `student_id`, `course_id`, `concept_id` cover the hot paths.
- **Row-Level Security.** RLS scales with the database — every student's request already runs under their own JWT, so tenant isolation is free at any cohort size.
- **OpenAI inference itself.** The models don't care; only the rate limits do (below).

---

## The four levers we pull

### 1. OpenAI rate limits — the real ceiling

**Default Tier 1 is 500 RPM per model.** At 10k students we project ~130 RPM average on GPT-4o and ~130 RPM on GPT-4o-mini, but peaks at 9:00 AM EST and 10:00 PM EST will spike 3–4x above average. We will hit Tier 1 limits on bad days.

- **Move to Tier 3** ($100 prepay, 30k RPM on GPT-4o). One form, approved in ~24h.
- **Enable prompt caching** on the Mentor system prompt (currently ~2.5k tokens of pedagogy + guardrails) — OpenAI charges 50% for cache hits, which cuts the Mentor input bill in half once hit rate stabilizes above ~70%.
- **Back-pressure at the edge.** Add a per-user 429 retry-after shim so a transient OpenAI rate limit surfaces as "Socrates is thinking…" rather than a 500 page.

Effort: **~1 day**. This is the only lever whose absence causes user-visible failures before 10k students.

### 2. Profiler → async job queue (Inngest)

Today the Profiler runs fire-and-forget inside the Mentor response path (`frontend/src/lib/ai/profiler.ts`). At 2.2 Mentor calls/second peak, the background spawn works — but it adds ~80ms of overhead to the critical response path and the Profiler itself can fail silently under load.

- **Decouple with Inngest.** Enqueue a `profile.updated` event on every Mentor turn; an Inngest worker drains the queue against GPT-4o-mini. Retry, dedup, and observability come free.
- **Why not just keep it inline?** At 21k Profiler calls/day, any transient OpenAI error becomes a lost pedagogical signal. Durable queue is the difference between "Sara's profile is 99% correct" and "Sara's profile is 99.99% correct."

Effort: **~2 days**. Inngest is a drop-in; the hard part is migrating existing Profiler state to an event-sourced shape, which the current schema already supports.

### 3. Teacher dashboard → read replicas or materialized views

The teacher dashboard ([`frontend/src/app/api/dashboard/route.ts`](https://github.com/Joelwillfors/nexford-adaptive-study-partner/blob/main/frontend/src/app/api/dashboard/route.ts)) aggregates profile entries across a whole cohort (`stuck_student_count` per concept, Watchlist rankings, Class Intelligence grid). This is a **read-heavy, slow-query pattern** that will degrade first.

- **Near-term fix (~1 day):** a `class_intelligence_rollups` materialized view, refreshed every 5 minutes on a cron. Teachers don't need sub-minute freshness; 5-minute staleness is invisible.
- **Medium-term (~3 days):** when teacher concurrency > 50 at 08:00 peak, spin up a Supabase read replica and route dashboard queries to it. Writes continue on primary, RLS still enforces tenant isolation.

Effort: **1–3 days depending on teacher load.**

### 4. Cost governance per student

- **Per-student token budget.** Soft-cap at 50k tokens/day (~25 Mentor turns). On breach: graceful degrade to GPT-4o-mini for the Mentor, or a "Sara, Socrates needs a rest — try tomorrow?" message. Abuse-resistant and explainable.
- **Profiler stays on GPT-4o-mini forever.** Classification + structured JSON output is not where Mentor-grade reasoning is worth paying for. We already default to mini here; the lever is to *keep* it there as the Profiler pipeline expands.
- **Consider self-hosting the Profiler on Llama 3** once 50k students / $50k-month LLM spend is on the table. Not before — premature optimization swallows engineering cycles that are better spent on pedagogy.

Effort: **~2 days to ship the soft-cap + metrics.**

---

## Order of failure (without intervention)

If we did **nothing** and ramped to 10k students over one semester:

1. **Week 1 at 2–3k students — OpenAI Tier 1 rate-limits trip** at peaks. User-visible 429s. Fix lead time: 1 day.
2. **Week 3 at 5k students — Mentor response p95 climbs** from 4s to 7s as inline Profiler contends. Not a hard failure, but the "it feels fast" property degrades. Fix: async queue, ~2 days.
3. **Week 6 at 8k students — teacher dashboard slow queries** push p95 past 3s. Teachers notice. Fix: materialized view, 1 day.
4. **Past 10k — LLM spend outgrows internal budget** if no governance. Fix: soft-cap + metrics, 2 days.

**Combined fix window: ~1 sprint.** Every one of these is predictable from today, and none require architecture changes.

---

## Where the architectural ceiling actually is

The current design scales to roughly **50k–80k students on the same topology** — a single Supabase primary, multi-replica for reads, Vercel Edge, OpenAI Enterprise. Past that, two structural moves unlock the next order of magnitude:

- **Per-course sharding.** Each course gets its own Supabase instance. RLS stays inside each shard; the `student_id` index becomes shard-local. This is a weeks-of-migration project but the code change is small because every query already scopes to `course_id`.
- **Multi-region Edge.** The product becomes latency-sensitive for non-US students past 100k. Vercel's Edge network + regional Supabase replicas solve this; the headless API's stateless shape means no session-affinity gymnastics.

---

## The CPO framing

The architecture in [`PRODUCT_BRIEF_ONE_PAGER.md`](https://github.com/Joelwillfors/nexford-adaptive-study-partner/blob/main/Docs/PRODUCT_BRIEF_ONE_PAGER.md) was chosen because it works at the prototype scale *and* at the 10k scale without a rewrite. The deterministic divide — AI for intent, code for logic — is what makes the system legible under load: a hallucinated schedule is a trust failure, a slow database is a latency failure, and we designed for both.

**What a serious scale-up operation looks like from here:** one engineer, one sprint, four levers, no new services. The rest is observability and patience.

---

*Cross-links: [`HEADLESS_API.md`](https://github.com/Joelwillfors/nexford-adaptive-study-partner/blob/main/Docs/HEADLESS_API.md) · [`ROADMAP.md`](https://github.com/Joelwillfors/nexford-adaptive-study-partner/blob/main/Docs/ROADMAP.md) · [`COMMAND_CENTER.md`](https://github.com/Joelwillfors/nexford-adaptive-study-partner/blob/main/Docs/COMMAND_CENTER.md).*
