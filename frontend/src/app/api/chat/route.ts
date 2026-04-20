/**
 * POST /api/chat — Unified chat endpoint for the mentor drawer.
 *
 * Request `kind` determines the behaviour:
 *   - "message":       student asked a question → Socratic/Direct pipeline
 *   - "checkpoint":    student reached end of lesson section → generate quiz
 *   - "quiz_response": student answered a quiz → log + (on wrong) trigger mentor
 *
 * All three produce a structured AssistantMessage (text | quiz | recap).
 * Mode (socratic | direct) is computed deterministically from history.
 */
import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/clients";
import {
  runSocraticMentor,
  generateCheckpointQuiz,
  decideMode,
  generateVictoryLapRecap,
  type ChatTurn,
  type LmsContext,
  type MentorMode,
  type QuizConfidence,
} from "@/lib/ai/socratic-mentor";
import { classifyFrustration } from "@/lib/ai/frustration-classifier";
import {
  runProfiler,
  recordInterventions,
  type InterventionEvent,
} from "@/lib/ai/profiler";
import {
  canonicalConceptTag,
  isKnownCanonicalConcept,
} from "@/lib/ai/concept-canon";
import { DEMO_MODE, FEATURE_FLAGS } from "@/lib/flags";
import type { AssistantMessage } from "@/lib/ai/schemas";

// Track drift per-process (not per-request) — we only want to log each
// unseen tag once to avoid spamming stress-test output.
const driftWarned = new Set<string>();
function warnOnDrift(raw: string | null | undefined, where: string) {
  if (!raw) return;
  const canonical = canonicalConceptTag(raw);
  if (!canonical) return;
  if (isKnownCanonicalConcept(raw)) return;
  if (driftWarned.has(canonical)) return;
  driftWarned.add(canonical);
  console.warn(
    `[ConceptCanon] drift at ${where}: received "${raw}" → normalized "${canonical}" is not in the alias table. Add it to concept-canon.ts.`,
  );
}

interface MessageRequest {
  kind: "message";
  question: string;
  courseId: string;
  userId: string;
  sessionId: string;
  lms?: LmsContext;
  // Turn-level intent (distinct from the top-level router `kind`). When
  // "explain_passage", the student clicked "Explain this" on a lesson
  // paragraph and the mentor must treat the quoted text as reference
  // material, not the student's scenario. Paired with `focusConcept`, we
  // also scope history to the matching concept so prior concepts' nouns
  // cannot bleed into the reply.
  turnKind?: "explain_passage";
  focusConcept?: string;
}

interface CheckpointRequest {
  kind: "checkpoint";
  concept: string;
  courseId: string;
  userId: string;
  sessionId: string;
  lms?: LmsContext;
}

interface QuizResponseRequest {
  kind: "quiz_response";
  courseId: string;
  userId: string;
  sessionId: string;
  concept_tag: string;
  selected_index: number;
  correct: boolean;
  confidence?: "guessing" | "fairly_sure" | "certain";
  lms?: LmsContext;
}

type ChatRequest = MessageRequest | CheckpointRequest | QuizResponseRequest;

interface ChatResponse {
  message: AssistantMessage;
  mode: MentorMode;
  sources?: { name: string; similarity: number }[];
}

// ── Demo fixtures (used when DEMO_MODE is on or live call fails) ───

function demoMessage(question: string): AssistantMessage {
  const q = question.toLowerCase();
  if (q.includes("van") || q.includes("loan") || q.includes("asset")) {
    return {
      type: "text",
      text: "Not quite. The van was not paid for in cash — it was financed. When you bring the van onto the books, you record its full value as an asset. What do you record on the other side to show that the business now owes $50,000?",
    };
  }
  if (q.includes("insurance") || q.includes("prepaid") || q.includes("expense")) {
    return {
      type: "text",
      text: "Not quite. Your policy covers 12 months. On January 1st, how many months of coverage has the business actually consumed?",
    };
  }
  if (q.includes("don't know") || q.includes("idk") || q.includes("not sure")) {
    return {
      type: "text",
      text: "Let us step back. On January 1st, you paid $12,000 cash for 12 months of coverage. How much of that coverage has the business actually used by January 31st?",
    };
  }
  return {
    type: "text",
    text: "Before we answer that — walk me through what you know so far about the scenario. What changed on the balance sheet when the transaction occurred?",
  };
}

function demoCheckpointQuiz(concept: string): AssistantMessage {
  return {
    type: "quiz",
    question:
      "Your business pays $12,000 on January 1st for a 12-month insurance policy. On January 31st, your accountant records the January expense. What amount is expensed in January?",
    options: ["$12,000 (the full payment)", "$1,000 (one month's coverage)", "$0 (no expense until the policy ends)"],
    correct_index: 1,
    concept_tag: concept || "accrual_vs_cash",
    explanation:
      "Only the portion of the policy consumed in January is expensed. The remaining $11,000 stays on the balance sheet as prepaid insurance — a classic matching-principle application.",
    trigger: "checkpoint",
  };
}

// ── Request handlers ──────────────────────────────────────────────

async function handleMessage(
  req: MessageRequest,
): Promise<NextResponse<ChatResponse | { error: string }>> {
  const { question, courseId, userId, sessionId, lms, turnKind, focusConcept } = req;
  if (!question?.trim()) {
    return NextResponse.json(
      { error: "question required" },
      { status: 400 },
    );
  }
  const sb = createServiceClient();

  async function fetchHistory() {
    // Fetch the NEWEST 20 rows for this session, then reverse to chronological
    // order so downstream `history.slice(-N)` keeps its "last N turns" meaning.
    // Ascending + limit returns the OLDEST 20 rows, which on a long-lived
    // sessionId leaves the current conversation out of the window entirely.
    const withMeta = await sb
      .from("chat_logs")
      .select("role, content, metadata")
      .eq("session_id", sessionId)
      .order("created_at", { ascending: false })
      .limit(20);
    if (withMeta.error?.message?.includes("metadata")) {
      const basic = await sb
        .from("chat_logs")
        .select("role, content")
        .eq("session_id", sessionId)
        .order("created_at", { ascending: false })
        .limit(20);
      return (basic.data ?? []).reverse();
    }
    return (withMeta.data ?? []).reverse();
  }
  const historyRows = await fetchHistory();

  type MetaRow = {
    role: string;
    content: string;
    metadata?: {
      mode?: MentorMode;
      kind?: string;
      correct?: boolean;
      confidence?: QuizConfidence;
      concept_tag?: string;
    };
  };

  const history: ChatTurn[] = historyRows.map((r) => {
    const row = r as MetaRow;
    return {
      role: row.role as "student" | "mentor",
      content: row.content,
      mode: row.metadata?.mode,
      concept_tag: row.metadata?.concept_tag,
      kind: row.metadata?.kind,
    };
  });

  const lastMentorMode = [...history]
    .reverse()
    .find((t) => t.role === "mentor")?.mode ?? "socratic";

  // Explain-this history scope. On a passage-explain turn, a concept from a
  // prior topic ("the $10,000 server") should not bleed into the new reply.
  // We drop turns whose concept_tag differs from the paragraph's concept;
  // untagged turns (often the student's opener) are kept. Non-passage turns
  // use the full history unchanged.
  const scopedFocusConcept = canonicalConceptTag(focusConcept) ?? focusConcept ?? null;
  const scopedHistory: ChatTurn[] =
    turnKind === "explain_passage" && scopedFocusConcept
      ? history.filter(
          (t) => !t.concept_tag || t.concept_tag === scopedFocusConcept,
        )
      : history;
  if (turnKind === "explain_passage" && scopedFocusConcept) {
    console.log(
      `[Chat:${sessionId.slice(0, 8)}] explain_passage — history scoped to "${scopedFocusConcept}": ${history.length} -> ${scopedHistory.length} turns`,
    );
  }

  // Active concept = concept_tag of the most recent mentor turn. Used to
  // scope mode/quiz-fail decisions: unrelated quizzes on other concepts must
  // never dictate mode on the current concept.
  const activeConcept: string | null = [...history]
    .reverse()
    .find((t) => t.role === "mentor" && t.concept_tag)?.concept_tag ?? null;

  // Walk back through history for the most recent quiz_response entry.
  // Guard: ANY mentor reply between quiz_response and now means we've already
  // processed that failure — do not re-trigger tier1_quiz_fail on an
  // unrelated subsequent student turn (this was the "Fix 2 was broken" bug —
  // the prior guard only broke on mode === "direct", allowing a
  // socratic-mode mentor reply to slip past).
  // Additional scope: only trust the quiz result if it matches the active
  // concept; a failed quiz on concept A should never flip mode on concept B.
  let latestQuizResult: { correct: boolean; confidence?: QuizConfidence } | null = null;
  for (let i = historyRows.length - 1; i >= 0; i--) {
    const row = historyRows[i] as MetaRow;
    if (row.metadata?.kind === "quiz_response") {
      const quizConcept = row.metadata.concept_tag ?? null;
      const conceptsMatch =
        !activeConcept || !quizConcept || quizConcept === activeConcept;
      if (typeof row.metadata.correct === "boolean" && conceptsMatch) {
        latestQuizResult = {
          correct: row.metadata.correct,
          confidence: row.metadata.confidence,
        };
      }
      break;
    }
    if (row.role === "mentor") {
      break;
    }
  }

  if (DEMO_MODE) {
    const decision = await decideMode({
      currentMode: lastMentorMode,
      history: scopedHistory,
      currentTurn: question,
      latestQuizResult,
    });
    const msg = demoMessage(question);
    return NextResponse.json({ message: msg, mode: decision.mode });
  }

  try {
    const result = await runSocraticMentor(sb, {
      question: question.trim(),
      courseId,
      history: scopedHistory,
      currentMode: lastMentorMode,
      lms,
      latestQuizResult,
      classifier: FEATURE_FLAGS.llmClassifier ? classifyFrustration : undefined,
      log: (...a) =>
        console.log(`[Chat:${sessionId.slice(0, 8)}]`, ...a),
    });

    const chunkIds = result.retrievedChunks.map((c) => c.id);
    const mentorText =
      result.message.type === "text"
        ? result.message.text
        : JSON.stringify(result.message);

    // Best-effort: log both turns, retrying without metadata if the column is missing
    async function logTurns(withMetadata: boolean) {
      const studentRow: Record<string, unknown> = {
        user_id: userId,
        course_id: courseId,
        session_id: sessionId,
        role: "student",
        content: question.trim(),
      };
      const mentorRow: Record<string, unknown> = {
        user_id: userId,
        course_id: courseId,
        session_id: sessionId,
        role: "mentor",
        content: mentorText,
        retrieved_chunks: chunkIds,
        model_used: result.model,
        token_usage: result.tokenUsage,
        latency_ms: result.latencyMs,
      };
      if (withMetadata) {
        const rawMentorTag = result.conceptTag ?? activeConcept ?? null;
        warnOnDrift(rawMentorTag, "mentor_turn");
        const mentorConceptTag = canonicalConceptTag(rawMentorTag);
        const studentActiveTag = canonicalConceptTag(activeConcept);
        studentRow.metadata = {
          kind: "message",
          ...(studentActiveTag ? { concept_tag: studentActiveTag } : {}),
        };
        const mentorMeta: Record<string, unknown> = {
          mode: result.mode,
          structured: result.message,
        };
        if (mentorConceptTag) {
          mentorMeta.concept_tag = mentorConceptTag;
        }
        if (result.victoryLap) {
          mentorMeta.kind = "victory_lap";
        }
        if (lastMentorMode !== result.mode) {
          mentorMeta.mode_transition = `${lastMentorMode}->${result.mode}`;
          mentorMeta.reason = result.modeDecision.reason;
          if (result.modeDecision.score != null) {
            mentorMeta.frustration_score = result.modeDecision.score;
          }
          if (result.modeDecision.classifierState) {
            mentorMeta.classifier_state = result.modeDecision.classifierState;
          }
        }
        mentorRow.metadata = mentorMeta;
      }
      const rows: Record<string, unknown>[] = [studentRow, mentorRow];
      // Persist recap (if any) as its own mentor row so server-side seal
      // enforcement (handleQuizResponse) can detect closed concepts by
      // walking chat_logs alone.
      if (result.recap) {
        const recapRow: Record<string, unknown> = {
          user_id: userId,
          course_id: courseId,
          session_id: sessionId,
          role: "mentor",
          content:
            result.recap.type === "recap"
              ? result.recap.principle ?? "Topic recap"
              : JSON.stringify(result.recap),
        };
        if (withMetadata) {
          const rawRecapTag =
            (result.recap.type === "recap" && result.recap.concept_tag) ||
            result.conceptTag ||
            activeConcept ||
            null;
          warnOnDrift(rawRecapTag, "recap_row");
          const recapConceptTag = canonicalConceptTag(rawRecapTag);
          recapRow.metadata = {
            kind: "recap",
            structured: result.recap,
            ...(recapConceptTag ? { concept_tag: recapConceptTag } : {}),
          };
        }
        rows.push(recapRow);
      }
      return sb.from("chat_logs").insert(rows);
    }
    const insertResult = await logTurns(true);
    if (insertResult.error?.message?.includes("metadata")) {
      await logTurns(false);
    }

    // Dual-scoring intervention signals (Phase 3 Block A): record
    // historical effort even when the student NOW looks "strong". The
    // teacher dashboard reads `intervention_cost` to surface concepts
    // that needed heavy support to reach mastery.
    const interventions: InterventionEvent[] = [];
    const intoDirect =
      lastMentorMode !== "direct" && result.mode === "direct";
    if (intoDirect) {
      const tag =
        canonicalConceptTag(result.conceptTag ?? activeConcept) ?? null;
      if (tag) interventions.push({ concept_tag: tag, type: "direct_mode" });
    }
    if (
      result.recap?.type === "recap" &&
      result.recap.variant === "topic_closed"
    ) {
      const tag =
        canonicalConceptTag(
          result.recap.concept_tag ?? result.conceptTag ?? activeConcept,
        ) ?? null;
      if (tag) interventions.push({ concept_tag: tag, type: "topic_closed" });
    }

    runProfiler(sb, {
      userId,
      courseId,
      studentQuestion: question.trim(),
      mentorResponse: mentorText,
      recentHistory: history.map((h) => ({ role: h.role, content: h.content })),
      interventions,
      log: (...a) =>
        console.log(`[Profiler:${userId.slice(0, 8)}]`, ...a),
    }).catch((err) =>
      console.error("[Profiler] background error:", err),
    );

    return NextResponse.json({
      message: result.message,
      mode: result.mode,
      isVictoryLap: result.victoryLap,
      recap: result.recap ?? null,
      conceptTag: result.conceptTag ?? null,
      modeDecisionReason: result.modeDecision.reason,
      sources: result.retrievedChunks.map((c) => ({
        name: c.source_file,
        similarity: c.similarity,
      })),
    });
  } catch (err) {
    console.error("[Chat] live call failed, falling back to demo:", err);
    return NextResponse.json({
      message: demoMessage(question),
      mode: "socratic",
    });
  }
}

async function handleCheckpoint(
  req: CheckpointRequest,
): Promise<NextResponse<ChatResponse | { error: string }>> {
  const { concept, courseId, userId, sessionId, lms } = req;
  const sb = createServiceClient();

  if (DEMO_MODE) {
    return NextResponse.json({
      message: demoCheckpointQuiz(concept),
      mode: "socratic",
    });
  }

  try {
    const { message, chunks } = await generateCheckpointQuiz(sb, {
      concept,
      courseId,
      lms,
    });

    async function logCheckpoint(withMetadata: boolean) {
      const row: Record<string, unknown> = {
        user_id: userId,
        course_id: courseId,
        session_id: sessionId,
        role: "mentor",
        content: message.type === "quiz" ? message.question : "checkpoint",
      };
      if (withMetadata) {
        warnOnDrift(concept, "checkpoint_row");
        const canonical = canonicalConceptTag(concept);
        row.metadata = {
          kind: "checkpoint",
          structured: message,
          concept,
          ...(canonical ? { concept_tag: canonical } : {}),
        };
      }
      return sb.from("chat_logs").insert(row);
    }
    const cpInsert = await logCheckpoint(true);
    if (cpInsert.error?.message?.includes("metadata")) {
      await logCheckpoint(false);
    }

    return NextResponse.json({
      message,
      mode: "socratic",
      sources: chunks.map((c) => ({
        name: c.source_file,
        similarity: c.similarity,
      })),
    });
  } catch (err) {
    console.error("[Checkpoint] failed, falling back:", err);
    return NextResponse.json({
      message: demoCheckpointQuiz(concept),
      mode: "socratic",
    });
  }
}

async function handleQuizResponse(
  req: QuizResponseRequest,
): Promise<NextResponse<ChatResponse | { error: string }>> {
  const {
    courseId,
    userId,
    sessionId,
    concept_tag: rawConceptTag,
    selected_index,
    correct,
    confidence,
  } = req;
  warnOnDrift(rawConceptTag, "quiz_response");
  const concept_tag = canonicalConceptTag(rawConceptTag) ?? rawConceptTag;
  const sb = createServiceClient();

  // Server-side seal enforcement: if a prior mentor turn in this session
  // already closed this concept (victory_lap or recap), refuse to re-enter
  // the Socratic evaluation loop. Defense in depth — the frontend also
  // seals, but if that flag is lost in transit the server still refuses.
  // We ALSO use this lookup to spot a "confirmation"-trigger probe in
  // flight: if the most recent mentor quiz on this concept was a
  // verification probe, a correct answer here releases the held-back
  // Victory Lap recap.
  let sealed = false;
  let isConfirmationProbe = false;
  let recentHistoryForRecap: ChatTurn[] = [];
  if (!DEMO_MODE) {
    try {
      const sealCheck = await sb
        .from("chat_logs")
        .select("role, content, metadata")
        .eq("session_id", sessionId)
        .order("created_at", { ascending: false })
        .limit(40);
      type SealRow = {
        role: string;
        content: string;
        metadata?: {
          kind?: string;
          concept_tag?: string;
          structured?: { type?: string; trigger?: string; concept_tag?: string };
        };
      };
      const rows = (sealCheck.data ?? []) as SealRow[];
      sealed = rows.some(
        (r) =>
          (r.metadata?.kind === "recap" || r.metadata?.kind === "victory_lap") &&
          r.metadata?.concept_tag === concept_tag,
      );
      // Walk newest-first looking for the most recent mentor quiz row on
      // this concept; if it's a confirmation-trigger probe, mark it.
      for (const r of rows) {
        if (r.role !== "mentor") continue;
        const s = r.metadata?.structured;
        if (s?.type !== "quiz") continue;
        const quizConcept = s.concept_tag ?? r.metadata?.concept_tag ?? null;
        if (quizConcept !== concept_tag) continue;
        if (s.trigger === "confirmation") {
          isConfirmationProbe = true;
        }
        break;
      }
      // Reverse rows for chronological order (oldest -> newest), needed
      // by generateVictoryLapRecap so the conversation summary makes
      // sense to the LLM.
      recentHistoryForRecap = [...rows].reverse().map((r) => ({
        role: (r.role === "mentor" ? "mentor" : "student") as
          | "student"
          | "mentor",
        content: r.content,
        concept_tag: r.metadata?.concept_tag,
        kind: r.metadata?.kind,
      }));
    } catch (err) {
      console.error("[QuizResponse] seal lookup error:", err);
    }
  }

  if (!DEMO_MODE) {
    try {
      const row: Record<string, unknown> = {
        user_id: userId,
        course_id: courseId,
        session_id: sessionId,
        role: "student",
        content: `quiz_response: ${concept_tag} selected=${selected_index} correct=${correct}${confidence ? ` conf=${confidence}` : ""}`,
      };
      const res = await sb
        .from("chat_logs")
        .insert({
          ...row,
          metadata: {
            kind: "quiz_response",
            concept_tag,
            selected_index,
            correct,
            confidence,
          },
        });
      if (res.error?.message?.includes("metadata")) {
        await sb.from("chat_logs").insert(row);
      }
    } catch (err) {
      console.error("[QuizResponse] log error:", err);
    }
  }

  // Verification probe success path: a correct answer (with non-guessing
  // confidence) on a confirmation-trigger quiz IS the moment of arrival.
  // Reply text shifts from "would you like another" to a celebratory
  // "you applied it" line, and the held-back recap fires below.
  const probePassed =
    isConfirmationProbe &&
    !sealed &&
    correct &&
    confidence !== "guessing";

  const replyText = sealed
    ? correct
      ? "Right — we've already closed this topic, no need to unpack it again."
      : "The other option was the correct read, but we've wrapped this topic — we won't reopen it here."
    : probePassed
      ? "That's it — you didn't just remember it, you applied it to a brand-new scenario. That's the real check."
      : correct
        ? confidence === "guessing"
          ? "Correct — but you flagged that you were guessing. Can you explain in one sentence why that option is right, in your own words?"
          : "That is correct. The principle here is that expense recognition follows consumption, not cash outflow. Would you like to try another scenario, or explore a different concept?"
        : "Not quite. Walk me through how you chose that option — what step in your reasoning led you there?";

  // Log the mentor's reply to chat_logs so that on the student's NEXT text
  // turn, the history walk (route.ts line ~174) finds a mentor row between
  // the failed quiz_response and the new message — that stops tier1_quiz_fail
  // from re-firing as "direct" on an otherwise-unrelated question. Before
  // this write was added a single missed quiz effectively poisoned the next
  // text turn into Direct mode.
  if (!DEMO_MODE) {
    try {
      const mentorRow: Record<string, unknown> = {
        user_id: userId,
        course_id: courseId,
        session_id: sessionId,
        role: "mentor",
        content: replyText,
      };
      const mres = await sb.from("chat_logs").insert({
        ...mentorRow,
        metadata: {
          mode: "socratic",
          kind: sealed ? "sealed_reply" : "quiz_response_reply",
          concept_tag,
        },
      });
      if (mres.error?.message?.includes("metadata")) {
        await sb.from("chat_logs").insert(mentorRow);
      }
    } catch (err) {
      console.error("[QuizResponse] mentor log error:", err);
    }

    // Quiz-fail intervention: increments effort ledger so a concept
    // they ultimately master after a wrong answer still flags as
    // "hard-earned" on the teacher dashboard. Skip when sealed (the
    // topic is closed and we never re-enter learning loop) and skip
    // on correct answers.
    if (!correct && !sealed) {
      recordInterventions(sb, {
        userId,
        courseId,
        interventions: [{ concept_tag, type: "quiz_fail" }],
        log: (...a) =>
          console.log(`[Interventions:${userId.slice(0, 8)}]`, ...a),
      }).catch((err) =>
        console.error("[QuizResponse] intervention error:", err),
      );
    }
  }

  // On a passed probe, generate the held-back Victory Lap recap and
  // persist it as a mentor row so server-side seal enforcement on the
  // next turn detects the closure. The recap is included in the response
  // so the drawer renders the card alongside the celebratory reply text.
  let probeRecap: AssistantMessage | null = null;
  if (probePassed && !DEMO_MODE) {
    try {
      probeRecap = await generateVictoryLapRecap({
        scenarioAnchor: null,
        history: recentHistoryForRecap,
        activeConcept: concept_tag,
        variant: "mastered",
        log: (...a) =>
          console.log(`[ProbeRecap:${sessionId.slice(0, 8)}]`, ...a),
      });
      if (probeRecap?.type === "recap") {
        const recapRow: Record<string, unknown> = {
          user_id: userId,
          course_id: courseId,
          session_id: sessionId,
          role: "mentor",
          content: probeRecap.principle ?? "Topic recap",
        };
        const rres = await sb.from("chat_logs").insert({
          ...recapRow,
          metadata: {
            kind: "recap",
            structured: probeRecap,
            concept_tag,
          },
        });
        if (rres.error?.message?.includes("metadata")) {
          await sb.from("chat_logs").insert(recapRow);
        }
      }
    } catch (err) {
      console.error("[QuizResponse] probe recap error:", err);
    }
  }

  return NextResponse.json({
    message: { type: "text", text: replyText },
    mode: "socratic",
    isVictoryLap: probePassed,
    recap: probeRecap,
  });
}

// ── Router ────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as ChatRequest;
    if (!body.courseId || !body.userId || !body.sessionId) {
      return NextResponse.json(
        { error: "courseId, userId, sessionId required" },
        { status: 400 },
      );
    }

    switch (body.kind) {
      case "message":
        return handleMessage(body);
      case "checkpoint":
        return handleCheckpoint(body);
      case "quiz_response":
        return handleQuizResponse(body);
      default: {
        const legacy = body as unknown as MessageRequest & { question?: string };
        if (legacy.question) {
          return handleMessage({ ...legacy, kind: "message" });
        }
        return NextResponse.json({ error: "unknown kind" }, { status: 400 });
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "internal error";
    console.error("[Chat] route error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
