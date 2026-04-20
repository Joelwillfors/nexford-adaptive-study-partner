# Nexford Adaptive Study Partner — Demo Script

**Length:** 10–11 minutes live (~11:00 with all acts; ~10:15 if Act 5 is cut) · **Audience:** CPO/CEO panel
**Promise:** "We turned a static syllabus into a self-improving study partner that increases student persistence — Cary's **pedagogy sibling** in the portfolio sense: Cary owns **career-time**; this owns **study-time** (Canvas-first for course work)."

### Act timing summary

| Act | Target | Notes |
|---|---|---|
| Act 0 — Cold open (the persistence question) | 0:30 | **Frames every act that follows; do not cut** |
| Act 1 — The Problem (closes with no-OAuth proof beat) | 1:15 | |
| Act 2 — The Student Loop | 2:45 | |
| Act 3 — Planner + Atlas | 2:30 | **AI Fluency moment in 3b** |
| Act 4 — Teacher View (incl. Watchlist drilldown) | 2:50 | **Strongest "real product" surface in 4b** |
| Act 5 — Roadmap (Canvas embed → Automated Remediation → horizon) | 1:30 | **Cut first if running long** |
| Closing — the persistence ledger | 0:15 | **Always say, never cut** |
| **Total** | **11:25 / 9:55 without Act 5** | |

---

## Setup checklist (5 min before going live)

- [ ] Browser at `http://localhost:3000` with the role toggle on **Student** (Sara Patel).
- [ ] Sign-in not required — demo identity is hardcoded.
- [ ] Open these tabs in order so they're cached:
  1. `/` (home portal)
  2. `/learn/module-3`
  3. `/journey`
  4. `/plan` *(open the Atlas FAB once to warm the chat handler)*
  5. `/teacher` (after switching role)
  6. `/teacher/watchlist` *(expand one student row + click Bottlenecks once to warm the lazy-fetch)*
  7. `/teacher/student/sara-patel` *(or whichever ID matches your seeded student)*
  8. `/teacher/concept/depreciation`
  9. `/teacher/economics`
- [ ] DevTools network panel visible on a side monitor — you'll point at it once.
- [ ] If on flaky wifi, set `NEXT_PUBLIC_DEMO_MODE=true` in `frontend/.env.local` and restart so all generators return seeded fixtures.
- [ ] Run the pre-warm script (see *Pre-show readiness* below) at T-5 minutes — hits every endpoint in demo order.
- [ ] Backup video recorded and ready on a tablet (see "Backup video" below).
- [ ] Sound off, notifications off, tabs unrelated to the demo closed, second monitor mirroring set up.

---

## Act 0 — Cold open (30 sec, do not cut)

**You say, before clicking anything:**
> "Quick frame before I click anything: what you're about to see is the standalone proof of the contract. In production these agents ship as a headless layer inside the Canvas you already run — Socrates next to the lecture text, Atlas next to the calendar, Watchlist in the instructor dashboard. I'm showing the standalone version because it makes every contract visible."

> "One question first, because everything else flows from it: how does this solution increase student persistence? Today the program sees dropout three weeks late — login frequency, quiz score. The student has been stuck on a single concept the whole time and no one knew. We rebuilt the layer in between for the **silent middle of the cohort** — the students who don't fail and don't excel; they just quietly disengage. The product is one Adaptive Study Partner with four cognitive functions — **Cary's pedagogy sibling** in the portfolio: *where Cary chose the program, this gets the student through it* — **Canvas-first** for course work, not assumed to live in Cary's career UI. Each function is a persistence lever. You'll see all four."

This frames every act that follows. If you are tight on time, cut Act 5 first; do not cut this.

---

## Act 1 — The Problem (75 sec)

**You say:**
> "Nexford runs a 12-month online degree. The dropout signal we get today is the same signal Canvas gave us in 2014: log-in frequency and final quiz score. By the time those numbers move, the student has already mentally checked out three weeks earlier. **Every retained student is a recovered lifetime tuition** — persistence isn't a metric, it's the unit-economics machine. We rebuilt the layer where it's actually won or lost — what happens between page-load and quiz-fail."

**You show:**
- The home portal (`/`).
- Point at the streak chip in the header — *"this is the only piece of the UI that looks like Duolingo. Everything else is purpose-built for the way adults reason about money."*

**You close Act 1 with the proof beat (15 sec):**
> "And that's why we did not wire Google Calendar OAuth. The student already keeps an academic calendar in Canvas. Asking for a second one is asking for the first dropout reason. We let them talk it instead — you'll see in Act 3."

---

## Act 2 — The Student Loop (2 min 45 sec)

### 2a. Read with the mentor watching (45 sec)

- Click **Module 3 — Depreciation**.
- Scroll the first paragraph. Hover and click **Explain this** on a sentence about asset cost allocation.
- The mentor drawer slides in with a framed prompt and submits automatically.

**You say:**
> "The student didn't have to ask a question. They selected a sentence — the mentor opens against that exact anchor. Fewer than three of our students last cohort ever clicked 'I need help'. They will all hover a sentence."

### 2b. Productive struggle → Direct mode → I-get-it probe (90 sec)

- Type:
  > "I own a gym and a customer paid me $1,200 today for a year of membership. Isn't that my January revenue?"
- The mentor asks a Socratic counter. Reply *"I don't know"* twice.
- The mentor switches to **Direct mode** (you'll see the mode badge change in the drawer).
- It explains: $1,200 ÷ 12 = $100 January revenue.
- Reply *"That makes sense, can we move on"*.
- **The mentor doesn't celebrate yet** — it issues a *verification probe* (a fresh scenario quiz: e.g. "A tenant pays you 6 months rent upfront…").
- Answer it correctly.
- Now the **Topic Recap card** fires.

**You say:**
> "Three things just happened that don't happen anywhere else. First, we let her struggle for two turns — that's the productive-struggle window. Second, we offered Direct mode only when she was actually stuck, not because she sounded confused. Third — and this is the new one — when she said 'got it', we didn't believe her. We tested her on a fresh scenario before we marked the concept mastered. The teacher dashboard will see *both* signals: she got it right (good) and she needed Direct help to get there (the metric we'll come back to)."

> "And that mode switch is the AI judgment most builds get wrong: RAG keeps the Mentor honest to the syllabus, but **knowing when to drop the textbook is the escape hatch** that turns 'I don't know' into a gym-membership analogy. Three strikes, then the constraint relaxes — explicitly, not accidentally."

### 2c. The Journey view (30 sec)

- Click **My Journey**.
- Point at the Mastery chart — green/amber/red bars per concept.
- Hover a red bar. Click **Let's work on it**.
- This deep-links to `/learn/<module>?focus=<concept>` and the mentor drawer opens cold against that exact concept with a fresh scenario.

**You say:**
> "Concept-level remediation in two clicks. No 'lesson' to find. No 'is this the right module' question. Just *the topic* and *go*."

---

## Act 3 — The Planner Agent + Atlas (2 min 30 sec)

### 3a. The deterministic Planner (45 sec)

- Click **My Week**.
- Point at the 7-day grid.

**You say:**
> "This isn't a course catalog. It's a deterministic scheduler that reads her knowledge graph, weights concepts by a forgetting-curve score and a cognitive-load budget, and lays out **the 12–15 weekly study hours Nexford's own materials say successful students sustain** — into 60–120 minute deep-work blocks across the week. Depreciation — which the system knows is heavy — gets its own slot. WACC — which she nailed last week — only shows up Friday for a 2-minute review."

- Click **Move Earlier** on one slot to show the layout-animation.
- Hover a card to expose the rationale string.

**You say:**
> "Every slot has a *why*. That's what makes this look like a study partner instead of a recommendation engine. And — important — there is no LLM in the slot-placement path. A schedule the student doesn't trust is a schedule they ignore, so the placement loop is auditable and reproducible."

### 3b. Atlas — planning by conversation (90 sec)  *— this is the AI Fluency moment*

- Open the **Atlas** chat FAB (bottom right of `/plan`).
- Type, *exactly*:
  > "I have soccer Tuesdays from 1 to 3 and I work all day Wednesday."
- The reasoning indicator shows **"Atlas is reasoning…"** while the tool calls stream.
- Click **Show reasoning** under the reply to expand the tool-call panel.

**You point at the panel and say:**
> "Two `set_availability_rule` calls fired. Tuesday 13:00–15:00 marked busy, Wednesday all-day marked busy — both with the right args, both persisted to a real `availability_rules` table. The deterministic Planner re-ran with the new constraints and the rationale string explicitly attributes the redistribution: *'You added an availability rule; I redistributed those slots into earlier days while preserving spaced review.'*"

**You then say:**
> "This is what AI Fluency looks like for us, and the pattern has a name: **asymmetry of friction**. Chat-in, `.ics`-out. The LLM negotiates intent in natural language; the deterministic Planner stays in charge of where slots actually go; every accepted slot exports universal `.ics` — Google, Apple, Outlook, Canvas. The student talks once. We never asked them to maintain a second calendar — and we never put a live OAuth handshake on a stage."

- Briefly point at the per-slot **Add to calendar (.ics)** button and the **Download week (.ics)** button.

### 3c. Wrap (15 sec)

> "So: Canvas read in via the LMSProvider mock, personal life read in via chat, plan written out via `.ics`. Three different integration patterns, picked on purpose, none of them depending on a live OAuth handshake."

---

## Act 4 — The Teacher View (2 min 50 sec)

- Click the **Teacher** toggle in the nav.
- Land on `/teacher`.

### 4a. Class Intelligence (45 sec)

- Point at the metric cards.
- Scroll to **Concepts that need attention** — Depreciation is at the top.
- Click into Depreciation → "View full student logs and chat history".
- The drill-down page shows each struggling student, their intervention cost, and their last 5 turns of chat.

**You say:**
> "When Sara's instructor asks 'why is depreciation a problem?' — she gets the chat log. Not a heatmap. Not an aggregate. The actual sentences where each student in the silent middle got stuck."

### 4b. Watchlist drilldown — four levels deep (75 sec)  *— the strongest "real product" surface*

- Click **Watchlist** in the teacher nav (or navigate to `/teacher/watchlist`).
- Land on the ranked student list.

**You say:**
> "Class Intelligence answers *which concepts are stuck*. Watchlist answers *which students are stuck*. Same data, different cut — both fall out of the Profiler's knowledge graph."

- Click any student row to expand it. The factor breakdown appears (Bottlenecks · Engagement · Recency).

**You say:**
> "Each factor has a tooltip explaining what it measures, because *'46% engagement'* is meaningless without a definition. Hover here — *'How many core concepts the student is currently failing in the Profiler's knowledge graph.'*"

- Click the **Bottlenecks** factor row. The inline sub-panel lazy-fetches and lists *all* weak concepts for this student.

**You say:**
> "Now the actual struggle. Six of thirteen concepts flagged weak — but here's *which six*, with attempt counts and the last time the student tried each one. This is the data that turns a watchlist into a worklist."

- Click any weak concept to navigate to `/teacher/concept/[tag]`.

**You say:**
> "And every concept opens the cohort-wide view: every other student stuck on the same idea, the dominant `reasoning_step_failed` across the cohort, and the chat sentences where each got stuck. This is what an instructor actually needs to plan an intervention."

- Hit back, then click **See full profile** in the sub-panel.
- Land on `/teacher/student/[id]`.

**You say:**
> "Or follow the student instead of the concept. Same data, inverted — full Bottlenecks list, structured Misconceptions extracted by the Profiler, engagement section as roadmap. Four levels deep, every level adds information, no dead ends. This is the relatedness lever — the system noticed the student before the student had to ask."

### 4c. Hard-Earned Mastery (20 sec)

**You say (no scroll needed):**
> "And one panel above we ship the dual score — Strong on the student's Journey, plus the fact that it took three Direct interventions to get there. One number for motivation, one for staffing."

### 4d. Token Economics (30 sec)

- Click **Economics** in the nav.

**You say:**
> "Procurement's question is unit economics. We log token usage on every Mentor turn — about $X per student per week, gpt-4o-mini handling 60% of turns at 22% of the cost. Every dollar here is denominated against a recovered tuition. The cohort growth ceiling is visible before procurement asks for it."

- Point at the *CEO note* card at the bottom.

---

## Act 5 — The Roadmap (90 sec)  *— cut first if running long*

Keep this act only if you are under 9:30 going into it.

**You say:**
> "Three things ship. First — and this is the killer move — **Socrates and Atlas embed inside Nexford's existing Canvas** for **study-time**. The standalone you just saw is the architectural proof of the `LMSProvider` contract; production is an intelligence layer on the page the student already opens for **course work**. **Cary** in the **career platform** already proved Nexford ships **named, role-scoped AI** — this is the **pedagogy sibling** on the **syllabus side** of the house; same portfolio discipline, different primary surface."

> "Right after the embed lands, the **Automated Remediation auto-trigger** lights up: when the Profiler flags a bottleneck three times, Atlas's `add_remediation` tool injects a catch-up slot into next week's plan without instructor latency. Two API calls and a cron job from being the first compounding persistence loop in the system."

> "On the horizon: the **Adaptive Meta-Agent** — a nightly job that A/B-tests Mentor metaphors, learns which framings retain students, and updates the system prompt with the winners. The system that gets better at retaining students every night, without a human in the loop."

---

## Closing — the persistence ledger (15 sec, always say)

**You say, after Act 5 (or directly after Act 4 if Act 5 was cut):**
> "This is how a cohort that loses 25% becomes a cohort that loses 15% — and how an online degree becomes a graduating degree at scale. Architecture is product judgment, and product judgment is the persistence promise made structural."

The **25% / 15%** are *directional* anchors — the order-of-magnitude framing from the one-pager's opening. The audited cohort numbers belong to Nexford; if anyone in the room presses, say *"directional, not audited"* and offer to walk the math live. Never cut this beat — it's the line that makes the panel remember why every act before it mattered.

---

## Q&A cheat sheet

| Question | Answer |
|---|---|
| **What's actually live vs. hand-seeded?** | The Socratic mentor, the profiler that builds the knowledge graph, RAG retrieval, the verification probe, the dedupe route, the streak counter, and the token ROI aggregation are all live. The Planner falls back to a seed when no engagement data exists for a student (which is correct behavior, not a fudge — a brand-new student has no graph yet). |
| **What about hallucinations?** | Every mentor turn is RAG-grounded against the source PDFs. The retrieval similarity is logged on every turn — we can show false-positive rates by concept on demand. |
| **Privacy?** | Student PII never leaves Supabase. Only `concept_tag` and quiz outcomes are passed to the LLM context. We can FERPA-walk you through the data model. |
| **Why not just use Khanmigo / Coursera coach?** | Those are answer engines. Ours is a *meta-cognitive* engine: it tracks reasoning steps that fail, not topics that get clicked. The dual-scoring on the teacher dashboard is the proof — Khanmigo can't show you the difference between a student who *understands* and a student who *needed Direct mode 4 times to fake it*. |
| **What breaks first if we 10x cohort size?** | Token spend on the big model. The economics dashboard is wired so we'll see it before procurement does. The architectural escape hatch is the canonical-concept dictionary — about 70% of mentor turns can be served from cached responses keyed on `(concept_tag, scenario_archetype)`. |

---

## Pre-show readiness (T-5 minutes)

Run these in order. Each step has a single verifiable success signal.

### 1. Demo-mode environment

```bash
# In frontend/.env.local, confirm:
NEXT_PUBLIC_DEMO_MODE=true

# Then restart Next.js:
cd frontend && npm run dev
```

**Success signal:** the home portal banner reads *"Demo mode — deterministic fixtures."* If it doesn't, the flag isn't being read; restart cleared `.next/`.

### 2. Pre-warm script

A single command-line walk that touches every endpoint in demo order so cold-start latency lands before the panel sees it. From `frontend/`:

```bash
# Identity used by the demo seed (matches DEMO_STUDENT / DEMO_COURSE_ID)
SID=11111111-1111-1111-1111-111111111111
CID=00000000-0000-0000-0000-000000000001
SESS=warmup-$(date +%s)

# Mentor RAG path
curl -s -X POST http://localhost:3000/api/chat \
  -H 'Content-Type: application/json' \
  -d "{\"kind\":\"message\",\"question\":\"warm\",\"courseId\":\"$CID\",\"userId\":\"$SID\",\"sessionId\":\"$SESS\"}" \
  > /dev/null

# Profiler-derived reads (the Profiler itself fires async after /api/chat)
curl -s "http://localhost:3000/api/journey?studentId=$SID&courseId=$CID" > /dev/null
curl -s "http://localhost:3000/api/journey/streak?studentId=$SID" > /dev/null
curl -s "http://localhost:3000/api/journey/last-struggle?studentId=$SID&courseId=$CID" > /dev/null

# Planner deterministic generator (capture the plan for the Atlas warm-up below)
PLAN=$(curl -s -X POST http://localhost:3000/api/plan/generate \
  -H 'Content-Type: application/json' \
  -d "{\"studentId\":\"$SID\",\"courseId\":\"$CID\"}")

# Atlas tool-use loop (real shape: { plan, userMessage })
curl -s -X POST http://localhost:3000/api/plan/chat \
  -H 'Content-Type: application/json' \
  -d "{\"plan\":$PLAN,\"userMessage\":\"warm\",\"studentId\":\"$SID\",\"courseId\":\"$CID\"}" > /dev/null

# Teacher data + LMS sync POSTs
curl -s "http://localhost:3000/api/teacher/student/$SID?courseId=$CID" > /dev/null
curl -s -X POST http://localhost:3000/api/lms/sync-canvas > /dev/null
curl -s -X POST http://localhost:3000/api/lms/sync-roster > /dev/null
```

**Success signal:** every curl returns 200 within 2 seconds on the second run. If anything 5xx's, restart Next.js and re-run.

### 3. Backup-video failover

- Tablet plugged in, charged ≥80%, with `nexford-demo-fallback.mp4` open in the photos app, brightness max, autolock disabled.
- Verbal failover sentence rehearsed: *"Let me give the laptop a moment — the video is the same flow, I'll narrate over it live."* Hand the panel the tablet, keep the cadence.

### 4. Network isolation

- Tether to phone hotspot or wired connection. Do not demo over conference / hotel wifi.
- Throttle test: open DevTools → Network tab → throttle to "Fast 3G" → confirm Mentor turn still completes in <8 seconds. If it doesn't, `NEXT_PUBLIC_DEMO_MODE` will save you, but verify it's on.

### 5. Tab pre-warm verification

Walk the tab list under *Setup checklist* once, in order. Click into the Watchlist row → expand → click Bottlenecks → confirm the inline sub-panel renders without a spinner on the second click. That's the lazy-fetch warm.

---

## Backup video

Record a 10-minute walkthrough of the script above using `/`, `/learn/module-3`, `/journey`, `/plan` (with one Atlas exchange), `/teacher`, `/teacher/watchlist` (with the four-level drilldown), `/teacher/student/sara-patel`, `/teacher/concept/depreciation`, and `/teacher/economics` in that order. Include the Direct → probe → Topic Recap loop in full *and* the Atlas reasoning panel + the Watchlist drilldown — those are the two unique moments.

Settings:
- 1920x1080, 30fps, no audio (you'll narrate live).
- `NEXT_PUBLIC_DEMO_MODE=true` so the Planner and Token ROI render their seeded shapes (more visually compelling than a brand-new database).
- Save as `nexford-demo-fallback.mp4` next to the laptop.
- If the laptop dies mid-demo, hand the panel an iPad with the video on loop and keep talking.

### Backup video — 3-minute submission cut

A second, tighter recording for the *async* failure mode: the panel is busy and the live-demo slot is cancelled, or the candidate is asked to ship a recorded artefact. Same product, compressed to one continuous take that hits the persistence loop end-to-end. Save alongside the 10-minute fallback as `nexford-demo-3min.mp4`.

The route is **Mentor → Profiler → Atlas → Watchlist** in one breath, no setup commentary.

| Beat | Target | What you say (verbatim, tight) |
|---|---|---|
| Cold open | 0:15 | *"One question, because everything else flows from it: how does this product increase student persistence? Watch the loop."* |
| Mentor moment | 0:45 | On `/learn/accrual_vs_cash`: hover the gym sentence → drawer opens → ask *"isn't $1,200 paid today my January revenue?"* → mode switches to Direct after 2 wrong → verification probe lands → mastery flips. Narrate one line: *"It refused the answer until she earned it."* |
| Profiler receipt | 0:30 | Cut to `/journey`. Point at the new bottleneck row. *"That conversation just wrote a structured diagnostic: cash-basis confusion blocking accrual recognition. Same student, same week. The system noticed her by name."* |
| Atlas tool-use | 0:45 | Cut to `/plan`. *"I have soccer Tuesdays 1–3 and I work all day Wednesday."* Atlas calls `set_availability_rule` + replans inside the 12–15h Success Band. *"Function-calling chooses the tool; deterministic Planner does the math; same UI."* |
| Watchlist close | 0:30 | Cut to `/teacher/watchlist`. Click Sara → Bottlenecks → the same `accrual_vs_cash` row from 30 seconds ago. *"From silent middle to instructor inbox in one student-session. That's the persistence loop."* |
| Closing | 0:15 | *"One Adaptive Study Partner, four cognitive functions, embedded in the Canvas the student already opens."* |

Total: ~3:00. The same persistence thesis as the 10-minute live take, every receipt visible.

### Recording checklist (5 steps, ~10 minutes)

1. **Resolution** — record at 1920×1080 at 30fps. QuickTime Player → File → New Screen Recording → select the Chrome window only (do not record the whole desktop; menu bars dilute the frame).
2. **Audio** — mic *off* in QuickTime; you narrate live in the meeting or over the file separately. The 10-minute fallback has no audio for the same reason.
3. **Browser zoom** — Chrome at 110% zoom (Cmd-+ once from the default) so panel readers see the type at a distance. Hide the bookmarks bar (Cmd-Shift-B). Close every other tab.
4. **Demo-mode flag** — confirm `NEXT_PUBLIC_DEMO_MODE=true` in `frontend/.env.local`, restart `npm run dev`, and verify the home portal banner reads *"Demo mode — deterministic fixtures."* before you start the recording.
5. **Save path** — save both files next to the laptop and re-upload the 3-minute cut to the submission folder: `~/Desktop/nexford-demo-3min.mp4` and `~/Desktop/nexford-demo-fallback.mp4`. Name them exactly so the Pre-show readiness checklist above (T-5 minutes step 3) finds them automatically.

---

## Rehearsal sheet

Three full-length rehearsals before showtime:

1. **Solo with stopwatch.** Target 10:30 with all acts (11:25 ceiling, Closing always included). If you hit 11:45 you're explaining too much; cut Act 5 first (saves 1:30 — the Closing line still ships standalone right after Act 4), then 4d Token Economics (saves 0:30), then trim 3a Planner intro to 30 seconds. Never cut Act 0 (the persistence question), Act 3b (Atlas), or the Closing — the persistence ledger beat.
2. **Solo with browser console open.** You should be able to recover a hung mentor turn in <10 seconds. If anything throws, soft-reload the drawer using the **Reset** button and continue from "Click **Move Earlier**" in Act 3.
3. **In front of one skeptical engineer.** Ask them to throw the hardest "but the LLM is just guessing" question. Practice the Q&A row that matches.

---

*Last updated: Cary vs Canvas clarified — career platform vs course-work embed; Canvas-first study loop, Cary as portfolio proof of named AI.*
