# Nexford Adaptive Study Partner — Demo Script

**Length:** ~9 minutes live (7:45 of walkthrough + ~1:15 of panel breathing room) · **Audience:** CPO / CEO panel
**Promise:** "We turned a static syllabus into a self-improving study partner that increases student persistence — Cary's **pedagogy sibling** in the portfolio sense: Cary owns **career-time**; this owns **study-time** (Canvas-first for course work)."

### Act timing summary

| Act | Target | Notes |
|---|---|---|
| Act 0 — Cold open (the persistence question) | 0:45 | **Frames every act that follows; do not cut** |
| Act 1 — Socrates: struggle → Direct → calibrated probe → mastery | 2:30 | The moment-of-struggle proof |
| Act 2 — Atlas + the Proactive Nudge: the system noticed her | 2:30 | **AI Fluency moment** |
| Act 3 — Watchlist: from silent middle to instructor inbox | 1:30 | **Strongest "real product" surface** |
| Act 4 — Vision & close (Canvas embed, Automated Remediation, Meta-Agent) | 1:30 | The sell, not another demo |
| Closing — the persistence ledger | 0:15 | **Always say, never cut** |
| **Total** | **~9:00** | Leaves margin for panel questions |

---

## Setup checklist (5 min before going live)

- [ ] Browser at `http://localhost:3000` with the role toggle on **Student** (Sara Patel).
- [ ] Sign-in not required — demo identity is hardcoded.
- [ ] Open these tabs in order so they're cached:
  1. `/` (home portal)
  2. `/learn/module-3`
  3. `/plan` *(open the Atlas FAB once to warm the chat handler; confirm the Proactive Nudge banner renders at the top of the plan)*
  4. `/teacher` (after switching role)
  5. `/teacher/watchlist` *(expand one student row + click Bottlenecks once to warm the lazy-fetch)*
  6. `/teacher/student/sara-patel`
  7. `/teacher/concept/accrual_vs_cash`
- [ ] DevTools network panel visible on a side monitor — you'll glance at it once, during Atlas.
- [ ] The Proactive Nudge banner is deterministic on reload (the nudge reappears every page load, no demo flag required). Refresh `/plan` once at T-1 to confirm.
- [ ] Backup video recorded and ready on a tablet (see *Backup video* below).
- [ ] Sound off, notifications off, tabs unrelated to the demo closed, second monitor mirroring set up.

---

## Act 0 — Cold open (45 sec, do not cut)

**You say, before clicking anything:**
> "One question before I click anything, because everything else flows from it: **how does this solution increase student persistence?** Today Nexford sees dropout three weeks late — login frequency, final quiz score. The student has been stuck on a single concept the whole time and no one knew. Every retained student is a recovered lifetime tuition; persistence isn't a metric, it's the unit-economics machine."

> "What you're about to see is the standalone proof of the contract. In production these agents ship inside the Canvas Nexford already runs — next to the lecture text, next to the calendar, inside the instructor dashboard. **One Adaptive Study Partner, four cognitive functions** — Cary's pedagogy sibling. Where Cary chose the program, this gets the student through it. You'll see three of the four functions live; the fourth is the sensing layer underneath everything else."

If you are tight on time, cut into Act 4 early; do not cut this.

---

## Act 1 — Socrates: struggle → Direct → calibrated probe → mastery (2 min 30 sec)

### 1a. The moment of struggle (60 sec)

- Click **Module 3 — Accrual vs Cash**.
- Scroll the first paragraph. Hover and click **Explain this** on a sentence about when revenue counts.
- The mentor drawer slides in with a framed prompt and submits automatically.

**You say:**
> "She didn't click 'I need help' — almost no adult student ever does. She selected a sentence, the mentor opens against that exact anchor. Fewer than three of our pilot students last cohort ever clicked the help button. They'll all hover a sentence."

### 1b. Productive struggle → Direct mode → calibrated probe (90 sec)

- Type:
  > "I own a gym and a customer paid me $1,200 today for a year of membership. Isn't that my January revenue?"
- The mentor asks a Socratic counter. Reply *"I don't know"* twice.
- The mentor switches to **Direct mode** (the mode badge changes in the drawer).
- It explains: $1,200 ÷ 12 = $100 January revenue.
- Reply *"That makes sense, can we move on"*.
- **The mentor doesn't celebrate** — it issues a *verification probe* (a fresh scenario: "A tenant pays you 6 months rent upfront…").
- Answer it correctly; the probe also asks *"how confident are you?"*
- Now the **Topic Recap card** fires.

**You say, while the probe is on screen:**
> "Three things just happened. First — we let her struggle for two turns. That's the productive-struggle window; the research calls it *desirable difficulty* and the short version is *persistence goes up when students earn the insight*. Second — we offered Direct mode only when she was actually stuck, not because she sounded stuck. Third, and this is the new beat: when she said *'got it'*, we didn't believe her. We tested her on a fresh scenario, **and** we asked how confident she was, before we marked the concept mastered."

> "This is the calibration gate. The research on dropout — Dunlosky — says the predictable dropout isn't the student who fails loudly; it's the *confidently wrong* student who says mastery and hasn't earned it. Mastery here is gated on probe-correct **and** confidence ≠ guessing. She got both. That conversation just wrote a structured diagnostic — *cash-basis confusion blocking accrual recognition* — into her profile, and every concept tile on her journey has the same one-click remediation CTA underneath."

*(Jargon one-liner, in the flow: **RAG** — retrieval-augmented generation — just means the mentor is grounded in the actual course PDFs before it opens its mouth. If retrieval returns nothing, we fall back to a named analogy — gym membership — rather than hallucinate.)*

---

## Act 2 — Atlas + the Proactive Nudge: the system noticed her (2 min 30 sec)

### 2a. The nudge lands first (45 sec)

- Click **My Week** to land on `/plan`.
- The **Proactive Nudge banner** sits at the top: *"Accrual vs Cash was challenging today — want me to slot a review Monday so it stays warm?"*

**You say:**
> "She lands on her plan and the system has already noticed her. That's the relatedness lever — the part of Self-Determination Theory that says students persist when something remembers them by name. The nudge isn't a notification — it's the system reading her profile the moment she arrives and offering the next concrete step."

- Click **Schedule it**. The Accounting Equation review pulls forward from Friday to Monday — one block, not two.

**You say:**
> "One click. Spaced review, on the forgetting curve, inside the 12–15 weekly study hours Nexford's own materials say successful students sustain. No second calendar, no new tab. The research here is Ebbinghaus on forgetting and Bjork on interleaving — but the persistence point is simpler: *the #1 qualitative dropout reason is 'I don't know how to schedule this.'* A plan students trust is a plan they follow."

### 2b. Atlas — planning by conversation (90 sec)  *— this is the AI Fluency moment*

- Open the **Atlas** chat FAB (bottom right of `/plan`).
- Type, *exactly*:
  > "I have soccer Tuesdays from 1 to 3 and I work all day Wednesday."
- The reasoning indicator shows **"Atlas is reasoning…"** while the tool calls stream.
- Click **Show reasoning** under the reply to expand the tool-call panel.

**You point at the panel and say:**
> "Two tool calls fired. Tuesday 1–3 marked busy; Wednesday all-day marked busy. Both with the right arguments, both persisted. The planner then re-ran around the new constraints, and the rationale string on each slot explains the redistribution in plain English: *'You added an availability rule; I redistributed those slots into earlier days while preserving spaced review.'*"

> "This is what AI Fluency looks like for us, and the pattern has a name: **asymmetry of friction**. Chat-in, `.ics`-out. The LLM negotiates intent in natural language; a deterministic scheduler stays in charge of where slots actually go; every accepted slot exports as a universal calendar file — Google, Apple, Outlook, Canvas. She talks once. We never asked her to maintain a second calendar, and we never put a live sign-in handshake on a stage."

- Briefly point at the per-slot **Add to calendar (.ics)** button.

*(Jargon one-liner, when the tool-call panel opens: **function calling** — the LLM doesn't free-form answer; it picks a named tool, fills in the arguments, and we execute it. That's why the schedule can't drift into fiction.)*

### 2c. Wrap (15 sec)

> "So: Canvas read in via the provider contract, personal life read in via chat, plan written out as a universal calendar file. Three different integration patterns, none depending on a live sign-in handshake."

---

## Act 3 — Watchlist: from silent middle to instructor inbox (1 min 30 sec)

- Click the **Teacher** toggle. Land on `/teacher/watchlist`.

**You say:**
> "The same profile data, inverted. The student saw *her* struggle; the instructor sees *which student, which concept, what intervention* this week."

- Click **Sara Patel** to expand the row. Factor breakdown appears (Bottlenecks · Engagement · Recency).
- Click **Bottlenecks**. The inline sub-panel lazy-fetches her weak concepts, including *Accrual vs Cash*.

**You say:**
> "Four levels deep — row, factor, weak-concepts, full student profile. And that top concept is the one she got stuck on thirty seconds ago in our demo. From silent middle to instructor inbox in the same student-session. That's the loop closing."

- Click the *Accrual vs Cash* concept → lands on `/teacher/concept/accrual_vs_cash`.

**You say:**
> "And every concept pivots to the cohort view: every other student stuck on the same idea, the dominant failed reasoning step, the chat sentences where each got stuck. This is what makes the 'silent middle' visible before the gradebook catches up — the instructor has a worklist, not a heatmap."

*(Jargon one-liner, once: everything the profiler writes lives in a **JSONB** knowledge graph — one row per student, structured enough to query, flexible enough to grow. **pgvector** is the retrieval index sitting next to it.)*

---

## Act 4 — Vision & close (1 min 30 sec)

**You say, calmly, no more clicking:**
> "Three things ship next — none of them on the surface you just saw."

> "**One: Socrates, Atlas, and Watchlist embed inside Nexford's Canvas.** The standalone you just watched is the architectural proof of the provider contract. Production is an intelligence layer on the page the student already opens — Socrates next to the lecture text, Atlas next to the calendar, Watchlist inside the instructor dashboard. **Cary in the career platform already proved Nexford ships named AI**; this is the pedagogy sibling on the syllabus side of the house."

> "**Two: Automated Remediation auto-triggers** off the profiler. When the sensing layer flags the same bottleneck three times, Atlas's remediation tool injects a catch-up slot into next week's plan without the instructor in the loop. Two API calls and a cron job from being the first *compounding* persistence loop in the system."

> "**Three — the next data layer nobody else has: calibration and transfer.** A per-student, per-concept *Confidently-Wrong* score — how often Sara says mastery and fails the next probe — is the Watchlist column the predictable-dropout research says is the leading indicator. **Dual-scoring — one number for the student's motivation, one for the instructor's staffing — already lives under the hood; the dashboard on top is the next ship.** The holy-grail is LLM-generated *far-transfer* probes that restate a concept in a novel domain — because the degree only pays if knowledge survives the context switch from classroom to job. That's where the moat lives: longitudinal data no one else has."

> "**Completion is the wrong metric — we measure calibration and load.**"

---

## Closing — the persistence ledger (15 sec, always say)

**You say:**
> "This is how a cohort that loses 25% becomes a cohort that loses 15% — and how an online degree becomes a *graduating* degree at scale. Architecture is product judgment, and product judgment is the persistence promise made structural."

The **25% / 15%** are *directional* anchors — the order-of-magnitude framing from the one-pager's opening. The audited cohort numbers belong to Nexford; if anyone in the room presses, say *"directional, not audited"* and offer to walk the math live. Never cut this beat — it's the line that makes the panel remember why every act before it mattered.

---

## Q&A cheat sheet

| Question | Answer |
|---|---|
| **What's actually live vs. hand-seeded?** | The Socratic mentor, the profiler that builds the knowledge graph, retrieval against the course PDFs, the verification probe with the confidence gate, the proactive nudge (live read from the profile; falls back to a seeded concept only when the profile is empty), and the dual-scoring on the teacher side are all live. The planner falls back to a seed when a brand-new student has no knowledge graph yet — correct behavior, not a fudge. |
| **What about hallucinations?** | Every mentor turn is grounded against the source PDFs before it speaks. The retrieval similarity is logged on every turn — we can show false-positive rates by concept on demand. The threshold was recalibrated from 0.72 to 0.50 after a live silent-retrieval failure; the recalibration log is the honest receipt. |
| **What's the research behind this?** | Three citations, one line each. **Dunlosky (2013) on calibrated confidence** — the predictable dropout is the *confidently wrong* student; our probe-gate is that check. **Ebbinghaus / Sweller / Bjork on spacing, load, interleaving** — the planner is deterministic, forgetting-curve-weighted, load-budgeted at 3 units per day, deliberately interleaved. **Barnett & Ceci on transfer** — far-transfer probing is the roadmap item that makes the degree value defensible to employers, not just course completion. |
| **What's the next data layer nobody else has?** | Calibration and transfer. Per-student Brier score, per-concept *Confidently-Wrong* list, LLM-generated far-transfer probes, and a `near_mastery` / `far_mastery` split on the concept record. The moat is longitudinal data no competitor has because they're still measuring completion. |
| **What would you delete?** | The standalone *Import from Canvas* button, the moment the real Canvas embed ships — it exists today only to prove the provider contract works end-to-end; once the student is inside Canvas, there's nothing to import. Same disposition for the entire management surface as a destination page — institutional analytics belong inside Canvas, not alongside it. |
| **Unit economics?** | Token usage is instrumented on every mentor turn — about $X per student per week, the small model handling 60% of turns at 22% of the cost. I have the dashboard; happy to walk it after this if relevant. The cohort growth ceiling is visible before procurement has to ask for it. |
| **Privacy?** | Student PII never leaves our database. Only concept tags and quiz outcomes go to the LLM context. Can walk the data model FERPA-compliance-first on request. |
| **Why not just use Khanmigo / Coursera coach?** | Those are answer engines. Ours is a *metacognitive* engine — it tracks reasoning steps that fail, not topics that get clicked. The dual-scoring is the proof: Khanmigo can't show you the difference between a student who understands and one who needed Direct mode four times to fake it. |
| **What breaks first at 10x cohort size?** | Token spend on the big model. The economics instrumentation will see it before procurement does. The architectural escape hatch is the canonical-concept dictionary — about 70% of mentor turns can be served from cached responses keyed on concept and scenario archetype. |

---

## Pre-show readiness (T-5 minutes)

Run these in order. Each step has a single verifiable success signal.

### 1. Environment sanity

```bash
cd frontend && npm run dev
```

**Success signal:** the home portal loads without errors. The Proactive Nudge banner renders at the top of `/plan` on a cold reload — that's the demo's most-watched widget, and it should be there without a demo flag.

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
- Throttle test: open DevTools → Network tab → throttle to "Fast 3G" → confirm Mentor turn still completes in <8 seconds.

### 5. Tab pre-warm verification

Walk the tab list under *Setup checklist* once, in order. Click into the Watchlist row → expand → click Bottlenecks → confirm the inline sub-panel renders without a spinner on the second click. That's the lazy-fetch warm.

---

## Backup video

Record a 9-minute walkthrough of the script above using `/`, `/learn/module-3`, `/plan` (with the Proactive Nudge visible and one Atlas exchange), `/teacher/watchlist` (with the four-level drilldown), and `/teacher/concept/accrual_vs_cash` in that order. Include the Direct → calibrated probe → Topic Recap loop in full, the Proactive Nudge accept, and the Atlas reasoning panel + Watchlist drilldown — those are the three unique moments.

Settings:
- 1920x1080, 30fps, no audio (you'll narrate live).
- Save as `nexford-demo-fallback.mp4` next to the laptop.
- If the laptop dies mid-demo, hand the panel an iPad with the video on loop and keep talking.

### Backup video — 3-minute submission cut

A second, tighter recording for the *async* failure mode: the panel is busy and the live-demo slot is cancelled. Same product, compressed to one continuous take that hits the persistence loop end-to-end. Save alongside the 9-minute fallback as `nexford-demo-3min.mp4`.

The route is **Mentor → Nudge → Atlas → Watchlist** in one breath, no setup commentary.

| Beat | Target | What you say (verbatim, tight) |
|---|---|---|
| Cold open | 0:15 | *"One question, because everything else flows from it: how does this product increase student persistence? Watch the loop."* |
| Mentor moment | 0:45 | On `/learn/accrual_vs_cash`: hover the gym sentence → drawer opens → ask *"isn't $1,200 paid today my January revenue?"* → mode switches to Direct after 2 wrong → verification probe with confidence gate → mastery flips. Narrate one line: *"It refused the answer until she earned it, and confirmed she wasn't guessing."* |
| Nudge + Atlas | 1:15 | Cut to `/plan`. The Proactive Nudge banner is already there: *"Accrual vs Cash was challenging today — want me to slot a review Monday so it stays warm?"* Click accept. Then Atlas: *"I have soccer Tuesdays 1–3 and I work all day Wednesday."* Function calls fire, planner replans inside the 12–15h band. *"The system noticed her, and then it respected her life."* |
| Watchlist close | 0:30 | Cut to `/teacher/watchlist`. Click Sara → Bottlenecks → the same *Accrual vs Cash* row from 45 seconds ago. *"From silent middle to instructor inbox in one student-session. That's the persistence loop."* |
| Closing | 0:15 | *"One Adaptive Study Partner, four cognitive functions, embedded in the Canvas the student already opens. Completion is the wrong metric — we measure calibration and load."* |

Total: ~3:00. Every receipt visible; every jargon term dropped at most once.

### Recording checklist (5 steps, ~10 minutes)

1. **Resolution** — record at 1920×1080 at 30fps. QuickTime Player → File → New Screen Recording → select the Chrome window only (do not record the whole desktop; menu bars dilute the frame).
2. **Audio** — mic *off* in QuickTime; you narrate live in the meeting or over the file separately.
3. **Browser zoom** — Chrome at 110% zoom (Cmd-+ once from the default) so panel readers see the type at a distance. Hide the bookmarks bar (Cmd-Shift-B). Close every other tab.
4. **Nudge-visibility check** — reload `/plan` at the top of the recording and confirm the Proactive Nudge banner renders; the demo's core relatedness beat lives there.
5. **Save path** — save both files next to the laptop and re-upload the 3-minute cut to the submission folder: `~/Desktop/nexford-demo-3min.mp4` and `~/Desktop/nexford-demo-fallback.mp4`. Name them exactly so the Pre-show readiness checklist above (T-5 minutes step 3) finds them automatically.

---

## Rehearsal sheet

Three full-length rehearsals before showtime:

1. **Solo with stopwatch.** Target 7:45 of walkthrough — 9:00 ceiling with the Closing. If you hit 9:30 you're explaining too much; trim Act 4 first (the vision close survives at 60 seconds), then cut the jargon one-liners (they're in the Q&A already). Never cut Act 0 (the persistence question), Act 2a (the nudge lands), or the Closing.
2. **Solo with browser console open.** You should be able to recover a hung mentor turn in <10 seconds. If anything throws, soft-reload the drawer using the **Reset** button and continue from the Atlas tool-call beat in Act 2b.
3. **In front of one non-technical listener (CPO tone, not skeptical engineer).** Ask them to stop you every time you drop a term they don't understand on first hearing — *retrieval-grounded*, *function-calling*, *forgetting curve*, *Brier score*, *cognitive load*. Fold every stop into the narration as a plain-English one-liner. The goal isn't to avoid the term; it's to have earned the right to use it once.

---

*Last updated: CPO-walk revision — four acts, Proactive Nudge as the "system noticed her" beat, vision-close replaces the token-economics walk, jargon-pass against a non-technical third rehearsal.*
