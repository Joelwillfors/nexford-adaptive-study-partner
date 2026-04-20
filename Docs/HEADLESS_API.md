# Nexford Adaptive Study Partner — Headless API

*The contracts Canvas would consume. The standalone UI in this repo is one client of these contracts. Production is the same JSON, called by Canvas.*

---

The Adaptive Study Partner ships as a headless intelligence layer. Every screen in the prototype is a thin client over the routes below; in production those same routes are called by Canvas widgets (Mentor side panel on the reading view, Atlas overlay on the calendar, Watchlist tile on the instructor dashboard). What follows is the contract surface, grouped by the four cognitive functions plus the LMS seam and ingestion.

Identity is passed in the body or query string for now (`studentId`, `courseId`). The seams for real auth are written into [`supabase/migrations/001_foundation.sql`](../supabase/migrations/001_foundation.sql) (RLS, service role on the server). All endpoints respond JSON; failure paths fall through to seeded fixtures behind `NEXT_PUBLIC_DEMO_MODE` so the demo never lands on an empty state.

---

## Teaching — Socrates (the Socratic Mentor)

### `POST /api/chat`

RAG-grounded GPT-4o agent. One endpoint, three `kind`s, one structured response. Mode (`socratic` / `direct`) is computed deterministically from history — see [`frontend/src/lib/ai/socratic-mentor.ts`](../frontend/src/lib/ai/socratic-mentor.ts).

```ts
type Request =
  | { kind: "message";       question: string;  courseId: string; userId: string; sessionId: string; lms?: LmsContext }
  | { kind: "checkpoint";    concept: string;   courseId: string; userId: string; sessionId: string; lms?: LmsContext }
  | { kind: "quiz_response"; concept_tag: string; selected_index: number; correct: boolean;
                              confidence?: "guessing" | "fairly_sure" | "certain";
                              courseId: string; userId: string; sessionId: string; lms?: LmsContext }

type Response = {
  message: AssistantMessage  // { type: "text" | "quiz" | "recap", ... }
  mode: "socratic" | "direct"
  isVictoryLap?: boolean
  recap?: AssistantMessage | null
  conceptTag?: string | null
  modeDecisionReason?: string
  sources?: { name: string; similarity: number }[]
}
```

**Canvas consumes it for:** the "Explain this" hover on the lecture reading view, the structured checkpoint quiz at the end of a section, and the verification probe after a quiz answer. The async Profiler pass fires server-side after every `message` turn — there is no separate Profiler endpoint to call.

---

## Sensing — the Profiler (read-only views over the knowledge graph)

The Profiler writes asynchronously after every `/api/chat` exchange. The reads below are how Canvas surfaces what it has learned.

### `GET /api/journey?studentId&courseId`

Flattens `learner_profiles.knowledge_graph` into an array suitable for the student-facing knowledge graph view. Pure read, no LLM.

```ts
type Response = {
  courseId: string; studentId: string
  overallLevel: "strong" | "moderate" | "weak" | "unknown"
  totalSessions: number
  lastActive: string | null
  concepts: Array<{
    tag: string; name: string
    level: "strong" | "moderate" | "weak"; levelScore: 1 | 2 | 3
    attempts: number; lastSeen: string | null
    bottleneck: string | null
    reasoningStepFailed: string | number | null
    misconception: string | null
  }>
  stats: { mastered: number; inProgress: number; struggling: number }
}
```

### `GET /api/journey/streak?studentId`

Active-days streak from `chat_logs`, with a 7-day sparkline and a streak-length-keyed motivational quote.

```ts
type Response = {
  currentStreak: number; longestStreak: number; todayActive: boolean
  last7: string[]   // ISO YYYY-MM-DD active days
  quote: string
  source: "live" | "demo_seed"
}
```

### `GET /api/journey/last-struggle?studentId&courseId`

The single concept most worth nudging the student on right now (highest `intervention_cost` within the last 7 days). Powers the proactive "want a 5-min review?" banner.

```ts
type Response = {
  concept: string; label: string
  lastSeen: string | null
  interventionCost: number
  source: "live" | "demo_seed"
}
```

### `GET /api/teacher/student/[id]?courseId`

Per-student teacher drilldown. Slices the knowledge graph for the instructor: counts, every weak concept (sorted by attempts then recency), and any structured Profiler misconceptions.

```ts
type Response = {
  studentId: string; level: string; sessions: number; lastActive: string | null
  counts: { weak: number; moderate: number; strong: number; total: number }
  weakConcepts:    Array<{ tag: string; label: string; attempts: number; lastSeen: string | null; bottleneck?: string; misconception?: string }>
  misconceptions:  Array<{ tag: string; label: string; text: string;     lastSeen: string | null }>
}
```

### `GET /api/teacher/concept/[tag]?courseId`

Concept-centric inversion: every student in the course who has data on this concept, plus the last few mentor + student lines that touched it. Drives the "needs attention" drilldown to the words the student actually said.

```ts
type Response = {
  concept: string
  summary: { totalStudents: number; weakCount: number; moderateCount: number; strongCount: number }
  students: Array<{
    userId: string; level: string; attempts: number
    interventionCost: number
    lastIntervention?: { type: string; at: string }
    bottleneck: string; misconception: string | null
    recentLogs: Array<{ role: "student" | "mentor"; content: string; createdAt: string }>
  }>
}
```

### `GET /api/dashboard?courseId`

The instructor "Morning Digest" — cohort-level rollup with the watchlist (every student plus a deterministic R/Y/G `risk` band), `actionRequired` (weak + 3+ sessions), `sharedMisconceptions` (concepts ranked by stuck-student count), `reviewsSent7d`, and `hardEarnedMastery` (strong-but-cost-≥3 tuples — the "dual-scoring" surface).

**Canvas consumes the Sensing routes for:** the student-side knowledge graph widget, the streak chip in the LMS header, the proactive "want a 5-min review?" nudge, and the entire instructor watchlist + drilldown experience.

---

## Planning — Atlas (function-calling) + the deterministic Planner

### `POST /api/plan/generate`

Pure deterministic planner. Forgetting-curve priority + greedy fill against a 3-unit daily cognitive-load budget targeting Nexford's 12–15h success band. No LLM call; auditable.

```ts
type Request  = { studentId?: string; courseId?: string; weekStart?: string }
type Response = WeekPlan   // { weekStart, days: DayPlan[], weekTotalMin, band, availabilityRules?: ... }
```

### `POST /api/plan/chat`

Atlas — the function-calling Planner Assistant. One LLM call per user message, JSON-schema-constrained tools, a second pass for a clean human summary, then a deterministic "you're in the success band" sentence appended server-side. Five tools:

| Tool | Purpose |
|---|---|
| `move_slot(concept, fromDay, toDay)`            | One-off relocation. |
| `trim_day(day, maxMinutes)`                     | Cap a single day's total minutes. |
| `add_remediation(concept, day)`                 | Inject a 10-min Review slot; refuses when day at 3-unit budget. |
| `set_availability_rule(label, dayOfWeek, startTime, endTime)` | Persist a recurring busy window; regenerates the plan in the same turn. |
| `clear_availability_rule(label)`                | Drop a rule and reclaim the freed window. |

```ts
type Request = {
  plan: WeekPlan
  userMessage: string
  history?: Array<{ role: "user" | "assistant"; text: string }>
  studentId?: string; courseId?: string
}

type Response = {
  replyText: string                  // human summary + band confirmation
  toolCalls: Array<{ name: ToolName; args: Record<string, unknown>; result: { status: "ok" | "noop" | "error"; message: string } }>
  updatedPlan: WeekPlan
  source: "demo_seed" | "live_llm" | "fallback"
}
```

**Canvas consumes the Planning routes for:** the Atlas chat overlay rendered next to the Canvas calendar. The student talks once; the deterministic Planner re-plans hour-aware around the rule; Canvas's calendar refreshes from the same `WeekPlan` returned in `updatedPlan`. The full schemas are in [`frontend/src/lib/ai/planner-tools.ts`](../frontend/src/lib/ai/planner-tools.ts).

---

## Closing the loop — Watchlist + Gradebook

### `POST /api/teacher/gradebook-export`

Idempotent write of a teacher intervention. Re-clicking the same `(student, concept, day)` returns the existing row and reports `already_sent_today` instead of creating a duplicate. Audit trail in `gradebook_exports`.

```ts
type Request = {
  studentId: string; conceptTag: string
  interventionKind?: "review_nudge" | "remediation_module" | "direct_message"
  exportedBy?: string
  payload?: Record<string, unknown>
}

type Response = {
  id: string
  status: "created" | "already_sent_today"
  exportedForDay: string   // YYYY-MM-DD
  provider: string
}
```

`GET` on the same path returns provider health (`{ name, mode: "mock" | "live", configured, lastSyncedAt }`) for the navbar pill.

**Canvas consumes it for:** the "Send Review" action on the instructor dashboard, written through `LMSProvider.exportToGradebook`. The local row stays as the audit trail even after the live Canvas REST call lands.

---

## LMS seam — what Canvas would replace

Every read above that reaches the LMS is funnelled through the [`LMSProvider`](../frontend/src/lib/lms/provider.ts) interface. Today the resolved provider is `MockCanvasProvider`; the moment `NEXT_PUBLIC_CANVAS_API_BASE_URL` is set, `CanvasProvider` takes over with zero UI changes. The interface is the production contract:

```ts
interface LMSProvider {
  getCurrentCourse():            Promise<Course>
  getModules():                  Promise<ModuleSummary[]>
  getAssignments(opts?):         Promise<Assignment[]>
  getLastQuizScore(studentId):   Promise<LastQuizScore | null>
  getStudentId():                Promise<string>
  exportToGradebook(input):      Promise<GradebookExportResult>
  getRoster():                   Promise<RosterSummary>
  getSyllabusSummary():          Promise<SyllabusSummary>
  getHealth():                   Promise<ProviderHealth>
}
```

### `POST /api/lms/sync-canvas`

Student-side "Import schedule from Canvas." Composite read over `getModules()` + `getAssignments({ from: now })`. Returns the upcoming counts; the calendar already renders Canvas-sourced events with a "via Canvas" provenance pill, so this is the tactile receipt of the read direction.

### `POST /api/lms/sync-roster`

Teacher-side "Sync Syllabus & Roster from Canvas." Composite read over `getRoster()` + `getSyllabusSummary()`.

```ts
type RosterResponse = {
  students: number; activeStudents: number
  modules: number; assignments: number
  syncedAt: string
}
```

**In production these two routes go away** — Canvas is the host, not a thing we read from. They exist in the standalone prototype to make the read direction of the integration visible during the demo.

---

## Ingestion — the RAG pipeline

### `POST /api/ingest`

Multipart form upload (`file`, `courseId`, `courseTitle?`, `moduleName?`). Returns `202 Accepted` immediately with a `taskId`; the embedding pipeline runs async (overlap-aware chunking → batch embeddings → `pgvector`) and writes its progress to `grading_tasks`.

```ts
type AcceptedResponse = { taskId: string; status: "accepted"; message: string }
```

### `GET /api/task-status?taskId`

Poll endpoint for ingestion progress.

```ts
type Response = {
  id: string
  status: "pending" | "in_progress" | "completed" | "failed"
  result: unknown | null
  error_message: string | null
  updated_at: string
}
```

**Canvas consumes ingestion for:** the instructor's "upload course material" action. The pipeline is entirely server-side; the standalone `/teacher/upload` page is the demo client over it.

---

## Internal / not part of the headless contract

For completeness — these routes power internal tools and are not endpoints Canvas would call:

- `GET /api/admin/token-roi` — LLM cost analytics for the internal economics view.
- `POST /api/admin/dedupe` — dev-only one-shot canonicalisation of `learner_profiles.knowledge_graph`.

---

*The standalone UI in this repo is one client of these contracts. Production is the same JSON, called by Canvas.*
