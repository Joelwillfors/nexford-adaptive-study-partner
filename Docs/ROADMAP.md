# Nexford Adaptive Study Partner — Roadmap

*Living document. Last revised before the Patrick demo.*

---

## How to read this document

This roadmap doubles as the **archive of restraint**: every meaningful idea the team has discussed for the Adaptive Study Partner lives in here, tagged by horizon. A roadmap that only lists what's coming next under-sells the thinking. A roadmap that only lists ambitions over-sells the team. The four-tier structure below is the honest middle.

- **Currently shipped (v0.4)** — what runs today against [`frontend/`](../frontend/), [`supabase/migrations/`](../supabase/migrations/), and the agent code under [`frontend/src/lib/ai/`](../frontend/src/lib/ai/).
- **Tier 1 — Next sprint** — the few items we will land before the Patrick demo, scoped to ~13–15h of engineering.
- **Tier 2 — Six-month horizon** — the categories of work that earn investment after v1 ships.
- **Tier 3 — Holy grail** — the ambitions that justify the platform's existence at year three, but should never be pitched as "Q2 deliverables."
- **Explicit non-goals** — what we have *deliberately* chosen not to build, and why. This section exists because the strongest signal of product judgment is what you cut.

---

## Currently shipped (v0.4)

| Surface | What it does | Code path |
|---|---|---|
| **Socratic Mentor** | RAG-grounded GPT-4o agent that refuses to give direct answers; clinical tone, one-question rule, explicit exit condition. | [`frontend/src/lib/ai/socratic-mentor.ts`](../frontend/src/lib/ai/socratic-mentor.ts), [`frontend/src/app/api/chat/route.ts`](../frontend/src/app/api/chat/route.ts) |
| **Profiler Agent** | Async fire-and-forget pass after every exchange; writes `reasoning_step_failed`, `misconception`, `bottleneck` into a JSONB knowledge graph. | [`frontend/src/lib/ai/profiler.ts`](../frontend/src/lib/ai/profiler.ts) |
| **Mode switching (ZPD)** | Deterministic trigger on 3 consecutive "I don't know" or 2 consecutive wrong answers; UI pill makes the adaptation visible. | [`frontend/src/app/chat/page.tsx`](../frontend/src/app/chat/page.tsx) |
| **Inline structured quizzes** | Zod-schema-constrained JSON output, rendered as message-typed UI cards. | [`frontend/src/lib/ai/schemas.ts`](../frontend/src/lib/ai/schemas.ts) |
| **Teacher Dashboard** | Inverts student-centric profiler data into a concept-centric view; ranks by `stuck_student_count`; one-click "Send Review" intervention. | [`frontend/src/app/teacher/page.tsx`](../frontend/src/app/teacher/page.tsx) |
| **Journey View** | Student-facing knowledge graph computed deterministically from profile data (no live LLM call). | [`frontend/src/app/journey/page.tsx`](../frontend/src/app/journey/page.tsx) |
| **Monday Morning Planner** | Deterministic 7-day study plan: forgetting-curve priority + greedy fill against a 3-unit daily cognitive-load budget + interleaving swap pass. | [`frontend/src/lib/ai/planner-agent.ts`](../frontend/src/lib/ai/planner-agent.ts), [`frontend/src/app/plan/page.tsx`](../frontend/src/app/plan/page.tsx) |
| **Document ingestion pipeline** | Async PDF → overlap-aware chunking → batch embeddings → pgvector. 202 Accepted with task queue. | [`frontend/src/lib/ai/ingest-pipeline.ts`](../frontend/src/lib/ai/ingest-pipeline.ts) |
| **Demo-mode flag + cached fallback** | `NEXT_PUBLIC_DEMO_MODE` returns deterministic seed data so the demo cannot fail on cold-start or rate-limit. | `frontend/src/lib/flags.ts` |

---

## Tier 1 — Next sprint (lands before the Patrick demo)

Total budget: ~13–15h engineering + ~6h demo prep.

### 1. UX polish pass (~1h)

- **Dynamic greeting.** "Welcome back, Sara" syncs with local time → "Good morning" / "Good evening".
- **Factor-breakdown tooltips on the teacher view.** Hover-revealed definitions for `Bottlenecks`, `Engagement`, `Recency` — currently three opaque labels.
- **Accordion default-closed.** Module breakdowns ("Accrual vs Cash Accounting") collapse by default. Clicking the top-level "Concepts to Review: 9" card scrolls down and auto-expands the matching module.

### 2. Canvas integration with substance (~2–3h)

A button + spinner is theatre. Patrick will see through it. Instead, wire the `LMSProvider` interface (the contract scoped early in the build):

```typescript
interface LMSProvider {
  getCurrentCourse(): Promise<Course>
  getAssignments(): Promise<Assignment[]>
  getRoster(): Promise<Student[]>
  submitGrade(studentId, assignmentId, score): Promise<void>
}
```

Two implementations:

- `MockCanvasProvider` — what we have today, returning seeded data.
- `CanvasProvider` — real-API stub that throws *"Configure NEXT_PUBLIC_CANVAS_API_KEY"*.

Surface in the UI:

- A `Connected to Canvas · Mock data · Last synced 2m ago` pill in the nav.
- An **Export to Gradebook** button on the teacher's Send Review action that idempotently writes to a real `gradebook_exports` table — visible during the demo via `SELECT * FROM gradebook_exports`.

This is the same demo time as a fake button, ~3× the credibility, and matches the architectural contract a real PM would scope.

### 3. Function-calling Planner (~6–8h)

The flagship AI Fluency demo. Replaces the current regex-driven Planner chat with a real tool-use loop.

**Three tools the LLM can call:**
- `move_slot(slotId, newDay, newTime?)`
- `trim_day(day, maxMinutes)`
- `add_remediation(concept, day)` ← reused as the manual proof point for the Automated Remediation roadmap item

**Constraints:**
- One LLM call per user message, JSON-schema-constrained tool use.
- Visible *"Socrates is reasoning…"* indicator that streams the tool calls as they arrive.
- Expandable **"Show reasoning"** panel under each chat reply, listing every tool fired with its args. This is the AI Fluency receipt.

**Mitigations for live latency:**
- `NEXT_PUBLIC_DEMO_MODE=true` returns a cached tool-call sequence.
- Pre-warm script at T-5 min hits all endpoints in demo order.

### 4. Roadmap rewrite (this document) (~1h)

The previous `ROADMAP.md` was from a different project (real-estate appraisal). Rewriting it is itself an Insight artifact — restraint as roadmap.

---

## Calendar architecture (what shipped, what's next)

A standalone section because Patrick may ask exactly this question.

**Decision: keep the custom calendar UI as the Planner's manipulable surface; treat Canvas as the system of record for academic events; let students *talk* their personal availability into the Planner; export anywhere via `.ics`.**

The brief specifies Canvas as the LMS. Canvas owns the student's academic calendar via `GET /api/v1/calendar_events` (assignments, lectures, due dates) — that's a one-way read into our UI, marked with a "via Canvas" provenance pill on every event sourced from it. The custom UI is doing real product work the Canvas calendar can't: cognitive-load dots per slot, "earned review" badges from the forgetting-curve queue, and a layout the function-calling Planner manipulates live via tool calls.

What we *avoided* was the obvious wrong move: bolting on Google Calendar OAuth so the student can import their personal life from there. That misreads the user — students put their academic life in Canvas and their personal life in their head, not in a calendar app they keep in sync. So instead of asking the student to maintain a second system, we let them *say it once* in chat:

> "I work all day Wednesday."
> "I have soccer Tuesdays from 13:00 to 15:00."

The Planner Assistant picks up these utterances via two function-calling tools (`set_availability_rule` / `clear_availability_rule`), persists them as recurring rules in `availability_rules`, and the deterministic Planner Agent re-plans hour-aware around the resulting busy windows. Each rule is then surfaced on the calendar with a "via chat" pill — symmetry with the Canvas provenance pill, and a subtle proof of where each block came from.

For *push* in the other direction, every accepted study slot exposes "Add to calendar (.ics)" and the week itself exposes "Download week (.ics)". RFC-5545 files import into Google, Apple, Outlook, and Canvas indifferently — universal, no OAuth, no demo risk.

### What's actually wired

```typescript
// Read: Canvas-as-source-of-record (mocked behind LMSProvider for v1)
interface LMSProvider {
  getCourseEvents(window: DateRange): Promise<CourseEvent[]>      // → events tagged source: "canvas"
  exportToGradebook(intervention: ReviewIntervention): Promise<void>
  getHealth(): Promise<{ status: "ok" | "stub" | "down" }>
}
class MockCanvasProvider implements LMSProvider { ... }   // ships now
class CanvasProvider implements LMSProvider { ... }       // stub: throws "not configured"

// Personal availability: chat → DB → planner constraint
interface AvailabilityRule {
  userId: string; courseId: string;
  label: string; kind: "busy_recurring" | "busy_one_off";
  dayOfWeek?: "Mon"|...|"Sun"; date?: string;
  startMin: number; endMin: number;       // minutes-since-midnight, hour-aware
  source: "chat" | "manual";
}

// Push: universal export, never OAuth on stage
function slotToIcs(slot: StudySlot): string         // single VEVENT
function weekToIcs(week: WeekPlan): string          // VCALENDAR with all accepted slots
```

The deterministic Planner Agent now consumes `availability_rules` directly: for each day it computes `availableMin = (DAY_END_MIN − DAY_START_MIN) − Σ busyMin(rules)`, and the greedy slot loop terminates on whichever bound hits first — cognitive-load budget *or* available minutes. When a rule is asserted via chat, the rationale string explicitly attributes the redistribution: *"You added an availability rule (Wed 08:00–22:00 busy); I redistributed those slots into earlier days while preserving spaced review."*

### The story for the demo

*"The student already maintains an academic calendar in Canvas, so we read from it and tag every Canvas-sourced event with provenance. They also have a life Canvas doesn't know about — soccer, a job — so instead of forcing them to double-book it into Google, we let them just tell the Planner Assistant once. The Planner agent then re-plans hour-aware around those rules and explains the redistribution. And because no calendar wins the world, every accepted slot exports as `.ics` — works in Google, Apple, Outlook, Canvas. Live OAuth on stage was deliberately avoided: it's the worst possible demo risk and a misread of where the student's academic life actually lives."*

---

## Tier 2 — Six-month horizon

Five buckets. Each item is one sentence of value framing, one sentence of why it's deferred. No specs, no estimates — the doc's job is to prove we considered them, not to commit.

### Adaptive Pedagogy Engine

- **Automated Remediation Modules.** When a student fails a concept N times in the Mentor, the Profiler emits an event; the Planner consumes it and adds a custom catch-up slot to next week's schedule containing the exact texts and newly-generated questions the student struggled with. *Deferred because* it requires multi-week Negotiator memory, currently scoped out — but the `add_remediation` tool we ship in Tier 1 is the manual proof point for this auto-trigger.
- **Reversed Learning Playground.** A sandbox mode where students hit a complex problem first, inevitably fail, and then scale up the theory based on that failure. *Deferred because* it requires a second curriculum surface and a different evaluation rubric than the current Mentor; it is a pedagogy bet, not a feature.

### Retention, Predictive Analytics & Re-engagement

- **Predictive drop-off tracking.** Behavioral pattern detection (e.g., *"10 consecutive inactive days from the Mentor → 100% increased dropout probability"*) running off existing chat-session and profiler logs. *Deferred because* the predictive model needs longitudinal data we won't have until cohort 1 finishes.
- **Teacher alerts & automated triggers.** When a drop-off threshold trips, flag it for the teacher AND fire an automated re-engagement email (*"Socrates misses you"*). *Deferred because* it depends on the predictive model above and a transactional-email integration we haven't scoped.
- **Frictionless soft-starts.** If a student is flagged as slipping, the homepage swaps their next heavy module for a low-friction quiz to rebuild momentum. *Deferred because* it requires a "module weight" attribute on the curriculum we have not yet authored.
- **Mobile push micro-interactions.** Quick yes/no concept questions delivered as push notifications, keeping the brain active off-platform. *Deferred because* there is no mobile platform to ship on; pure roadmap until v2.

### Study Tools, Anti-Cheat & Platform Features

- **Live Google Calendar / Outlook OAuth (personal-overlay provider).** Import a student's existing personal calendar so the Planner respects events the student already maintains elsewhere, instead of asking them to re-state availability in chat. *Deferred because* (a) chat-driven `availability_rules` already covers ~90% of the use case with zero OAuth surface, (b) live OAuth on stage is the worst-possible demo failure mode, and (c) `.ics` export from our side already gives universal write-out to Google/Apple/Outlook/Canvas — the asymmetry is intentional. Will graduate once a real institution asks for it.
- **Global search.** Single search bar that finds the right module, concept, or past Mentor exchange across the curriculum. *Deferred because* the curriculum is currently small enough that the side nav suffices; revisit when modules > 30.
- **Student-uploaded content.** Allow students to upload their own PDFs/training materials and have the Socratic Mentor teach against them. *Deferred because* it expands the safety-and-moderation surface area significantly; needs a content-policy and abuse-handling story before shipping.
- **"Quiz Me" gamified mode.** Students generate massive custom quizzes or pick alternate interactive learning formats. *Deferred because* the structured-output quiz path already covers the demo need; gamification is incremental on top.
- **Incentivized mastery (anti-cheat by carrot).** +2 bonus points on the real exam if the student hits 100% completion and 80% first-try accuracy. *Deferred because* it requires registrar-side policy approval and a bidirectional grade contract we don't have.
- **Tab-blur tracker on quiz pages.** Detect when the student leaves the browser tab mid-quiz. *Deferred because* the right surface for academic integrity is the registrar's proctoring stack, not a layered hack on top of ours.
- **Copy/paste lockdown on quiz pages.** *Deferred for the same reason as tab-blur tracking.*

### LLM Cost Optimization & Token Economics

- **Local parsing vs LLM API (cost-reduction agent).** An offline script that mines chat logs and expands our local regex/JSON dictionaries with common student phrasings, so basic interactions can be handled without paying for live LLM calls. *Deferred because* per-call cost is currently a rounding error; this becomes economically motivated past ~10k DAU.
- **Dedicated AI Cost Agent.** An internal agent purely focused on monitoring token spend, comparing API costs against the opportunity cost of building the local-fallback equivalent, and flagging margin compression. *Deferred for the same reason* — premature until we have margin data to compress.

### Institutional Analytics & Business ROI

- **Longitudinal cohort ROI.** Track learning trends and success rates across multiple cohorts to prove which modules are actually effective — a defensible answer to *"is the AI working?"*. *Deferred because* it requires multi-cohort data we don't have at v1.
- **Actionable teacher insights.** Move beyond "here is data" to "here is the recommended action" — generate specific intervention plans when a student or class is flagged as struggling on a trend. *Deferred because* the insight-generation logic depends on a richer corpus of resolved interventions to learn from.
- **Planner for teachers.** A teacher-facing planning surface analogous to the student Planner, for scheduling interventions, office hours, and review sessions. *Deferred because* the teacher-side intervention queue (shipped in v0.4) covers the immediate need; a full planner is a v2 surface.

---

## Tier 3 — Holy grail

These are the ambitions that justify the platform's existence at year three. They appear as **talk-track items in the demo, never as roadmap commitments.**

- **The Adaptive Meta-Agent.** A nightly background ML job that analyzes database logs to discover which explanations actually work. *e.g., "When we explain Accrued Revenue using 'Gym Memberships', 80% achieve a Victory Lap in 3 turns. With 'Flight Tickets' it takes 8 turns."* The agent autonomously updates the Mentor's system prompt to favor the winning analogy. This is the system that, in principle, makes the Mentor get better every night without a human in the loop. It is also the system most likely to silently degrade into an unaligned local optimum, which is why it is roadmap, not feature.
- **Reversed Learning Playground (full version).** Not just a feature — a parallel curriculum mode where the Mentor's pedagogy inverts. A multi-quarter pedagogy bet.

---

## Explicit non-goals

The list of things we deliberately did not build, with the reason. This is the most honest section.

- **A destination LMS or standalone destination site.** The standalone UI in this prototype is a contract demonstrator, not a product surface. Production is a headless intelligence layer inside Nexford's Canvas — same JSON, two clients (see [`Docs/HEADLESS_API.md`](./HEADLESS_API.md)). Every route powering the standalone UI is the route Canvas would call. The CPO/management surface was scoped down for the same reason — institutional analytics belong in Nexford's existing tooling, not in a new destination dashboard.
- **Real Canvas / LTI 1.3 integration.** Out of scope from day one of this build. Production OAuth, scope negotiation, and tenant onboarding are an institutional sales motion, not a 48-hour build. We promised the *interface contract* and a mock implementation; we delivered both.
- **Multi-week Negotiator memory + Friday review loop.** Cut early. The "Monday Morning Planner" is single-session and architecturally pure; the longitudinal Negotiator was 15–20h of state-persistence and edge-case work that would have eaten the demo polish budget. Roadmap, not v1.
- **Recap Agent and Curator Agent (from the original 6-agent model).** Only Mentor / Profiler / Planner shipped. The other two were valuable on paper but each added an LLM call to the critical path with marginal demo signal. Roadmap.
- **Drag-and-drop calendar.** Cut to "Move Earlier / Move Later" buttons. `@dnd-kit` was a 2-hour build-and-debug for a feature the function-calling Planner now makes more impressive without it (the LLM moves slots; the user just talks).
- **A second course or module just for breadth.** Considered, rejected. Breadth without depth signals "I built fast" rather than "I built well." The current course's seeded narrative does more work in a 10-minute demo than a half-finished second course would.

---

## Principles

1. **The model is one stage in a system, not the system.** Deterministic logic where possible (Planner is greedy fill, not an LLM call; Journey View is computed, not generated). The LLM is invoked only where it adds irreplaceable value — and even there, behind a structured-output schema or a tool-call contract.
2. **Product decisions live in the architecture, not the prompt.** The Mentor cannot give a direct answer because of how it is wired, not because the prompt asks nicely. Hallucination on numerical claims is structurally prevented by injecting tier-0 facts as ground truth, not by asking the model to be careful.
3. **Demo over slideware.** Every feature that ships must be live-demonstrable end-to-end. Anything that requires a slide to explain belongs on this roadmap, not in the product.

---

*Roadmap items past Tier 1 are aspirational until broken into issues and shipped.*
