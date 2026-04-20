/**
 * Hidden Profiler Agent v2 — "See the questions they never voiced."
 *
 * Triggered after every Socratic Mentor interaction. Decomposes the
 * student's reasoning into a logical chain, identifies exactly where
 * thinking breaks down, names the misconception, and writes a precise
 * diagnostic to the knowledge graph in learner_profiles.
 *
 * Fermi.ai philosophy: instead of "Struggles with CAC", the profiler
 * outputs "Understands CAC as a ratio but consistently fails to include
 * overhead costs (Step 3 in reasoning). Misconception: equates
 * 'acquisition cost' with 'ad spend' only."
 *
 * Architecture: mirrors the AlphaDesk Auditor agent pattern —
 * a bounded LLM call with structured JSON output that writes to a
 * canonical Supabase row (learner_profiles instead of listing_runs).
 */
import OpenAI from "openai";
import type { SupabaseClient } from "@supabase/supabase-js";
import { canonicalConceptTag } from "./concept-canon";

const PROFILER_MODEL = "gpt-4o-mini";
const PROFILER_VERSION = "v2.2";

// ── Types ───────────────────────────────────────────────────────────

interface ConceptAssessment {
  concept: string;
  level: "strong" | "moderate" | "weak";
  bottleneck: string;
  reasoning_step_failed: number | null;
  misconception: string | null;
}

interface ProfilerOutput {
  concepts: ConceptAssessment[];
  overallLevel: "strong" | "moderate" | "weak";
  notes: string;
}

interface KnowledgeGraphConcept {
  level: "strong" | "moderate" | "weak";
  attempts: number;
  // Dual-scoring: `level` is the OUTCOME (what the student sees in the
  // Journey view); `intervention_cost` is the historical EFFORT spent
  // teaching this concept (what the teacher sees in "Hard-Earned
  // Mastery"). It only ever increments — it is a permanent ledger of
  // "how hard was the road to that yes". See plan: Phase 3 + 4 Demo Build.
  intervention_cost?: number;
  last_intervention?: {
    type: "direct_mode" | "quiz_fail" | "topic_closed";
    at: string;
  };
  last_seen: string;
  evidence: string;
  bottleneck: string;
  reasoning_step_failed: number | null;
  misconception: string | null;
}

interface KnowledgeGraph {
  concepts: Record<string, KnowledgeGraphConcept>;
}

export interface InterventionEvent {
  concept_tag: string;
  type: "direct_mode" | "quiz_fail" | "topic_closed";
}

// ── Profiler system prompt ──────────────────────────────────────────

const PROFILER_SYSTEM_PROMPT = `You are an invisible diagnostic agent embedded in an educational system. Your purpose: see the questions students never voiced and pinpoint where thinking breaks down.

## YOUR TASK:
For each concept the student engages with in this interaction:
1. DECOMPOSE the concept into its reasoning chain — the sequential logical steps required to arrive at the correct answer.
2. IDENTIFY which step the student's thinking breaks at. If their reasoning is sound, mark it as strong.
3. NAME the specific misconception — the false belief or flawed mental model driving the error. If none, set to null.
4. WRITE a precise bottleneck diagnostic that a teacher can immediately act on.

## ASSESSMENT LEVELS:
- "strong": Student correctly executes the reasoning chain or asks questions that demonstrate they have already internalized the logic. No misconception present.
- "moderate": Student follows part of the chain but stalls or takes a wrong turn at a specific step. Misconception may be partial or contextual.
- "weak": Student cannot begin the chain, holds a fundamental misconception, or conflates the concept with something else entirely.

## OUTPUT FORMAT (strict JSON):
{
  "concepts": [
    {
      "concept": "customer_acquisition_cost",
      "level": "weak",
      "bottleneck": "Understands CAC as a ratio but consistently excludes overhead costs (salary, tooling) from the numerator — fails at Step 3 of the cost aggregation sequence.",
      "reasoning_step_failed": 3,
      "misconception": "Equates 'acquisition cost' with 'ad spend' only."
    },
    {
      "concept": "lifetime_value",
      "level": "strong",
      "bottleneck": "Correctly decomposes LTV into average revenue, gross margin, and retention period. No gap identified.",
      "reasoning_step_failed": null,
      "misconception": null
    }
  ],
  "overallLevel": "weak",
  "notes": "Primary blocker: cost categorization in unit economics. Student's mental model treats 'cost' as synonymous with 'ad spend', missing personnel and tooling overhead. Recommend targeted intervention on cost classification before advancing to CAC optimization."
}

## RULES:
- Use snake_case for concept names (lowercase, underscores).
- Identify 1-5 concepts per interaction.
- bottleneck must be a specific, actionable sentence — never vague ("struggles with concept").
- reasoning_step_failed is the 1-indexed step number in the reasoning chain where the student fails. Null if they succeed or if the concept has no clear chain.
- misconception is the specific false belief. Null if the student is correct or if the gap is knowledge absence rather than wrong belief.
- overallLevel = the weakest level among the concepts identified.
- notes must be a 1-2 sentence teacher-facing summary that names the root cause and suggests an intervention direction.

## TONE FOR STUDENT-FACING FIELDS:
The bottleneck, reasoning_step_failed (when expressed as text), and misconception fields are surfaced verbatim to the student in their Learning Journey under "What tripped you up". Phrase these in second person, encouraging tone. Never reference "the student", "the subject", or "the user" — speak directly to the learner. Do not include internal labels like "TRICKY STEP 2:" or "Student acknowledges...". Keep the diagnostic precision teachers need, just in a voice the student can hear without flinching.`;

// ── Core profiler logic ─────────────────────────────────────────────

/**
 * Pure LLM-only Profiler call. Same prompt + parsing as `runProfiler`,
 * but no Supabase read/write. Exported so the eval harness in
 * `frontend/scripts/eval-profiler.ts` can score the LLM extraction
 * without standing up a database.
 */
export async function runProfilerLLMOnly(opts: {
  studentQuestion: string;
  mentorResponse: string;
  recentHistory?: { role: string; content: string }[];
}): Promise<ProfilerOutput> {
  return analyzeInteraction(
    opts.studentQuestion,
    opts.mentorResponse,
    opts.recentHistory ?? [],
  );
}

async function analyzeInteraction(
  studentQuestion: string,
  mentorResponse: string,
  recentHistory: { role: string; content: string }[],
): Promise<ProfilerOutput> {
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const conversationSummary = recentHistory
    .slice(-6)
    .map((m) => `${m.role}: ${m.content}`)
    .join("\n");

  const completion = await client.chat.completions.create({
    model: PROFILER_MODEL,
    messages: [
      { role: "system", content: PROFILER_SYSTEM_PROMPT },
      {
        role: "user",
        content: `## Recent conversation context:\n${conversationSummary}\n\n## Latest interaction:\nStudent: ${studentQuestion}\nMentor: ${mentorResponse}\n\nDecompose the student's reasoning, identify the break point, and output JSON.`,
      },
    ],
    temperature: 0.2,
    response_format: { type: "json_object" },
    max_tokens: 768,
  });

  const raw = completion.choices[0]?.message?.content ?? "{}";
  const parsed = JSON.parse(raw) as ProfilerOutput;

  if (!parsed.concepts || !Array.isArray(parsed.concepts)) {
    return { concepts: [], overallLevel: "weak", notes: "Parse error" };
  }

  return parsed;
}

// ── Knowledge graph merge (idempotent upsert) ───────────────────────

const LEVEL_RANK: Record<"strong" | "moderate" | "weak", number> = {
  weak: 0,
  moderate: 1,
  strong: 2,
};

function maxLevel(
  a: "strong" | "moderate" | "weak",
  b: "strong" | "moderate" | "weak",
): "strong" | "moderate" | "weak" {
  return LEVEL_RANK[a] >= LEVEL_RANK[b] ? a : b;
}

function mergeKnowledgeGraph(
  existing: KnowledgeGraph,
  newAssessments: ConceptAssessment[],
  interventions: InterventionEvent[] = [],
): KnowledgeGraph {
  const concepts = { ...existing.concepts };
  const now = new Date().toISOString();

  for (const assessment of newAssessments) {
    const canonical = canonicalConceptTag(assessment.concept);
    if (!canonical) continue;
    const prev = concepts[canonical];

    // Merge rules (per polish sprint Track A):
    // - attempts: sum (total times engaged)
    // - level: ratchet upward (weak < moderate < strong) so one wobble
    //   does not erase prior mastery; a regression will still accumulate
    //   attempts which the teacher dashboard can surface separately.
    // - last_seen: always bump to now (freshest evidence wins).
    // - bottleneck/misconception/reasoning_step_failed: prefer the new
    //   non-empty value, fall back to the previous one. Keeps diagnostics
    //   from disappearing when a later turn produces a null field.
    // - intervention_cost / last_intervention: never set by assessments,
    //   only by the interventions loop below. Carry prior value forward.
    concepts[canonical] = {
      level: prev ? maxLevel(prev.level, assessment.level) : assessment.level,
      attempts: (prev?.attempts ?? 0) + 1,
      intervention_cost: prev?.intervention_cost ?? 0,
      last_intervention: prev?.last_intervention,
      last_seen: now,
      evidence: assessment.bottleneck || prev?.evidence || "",
      bottleneck: assessment.bottleneck || prev?.bottleneck || "",
      reasoning_step_failed:
        assessment.reasoning_step_failed ??
        prev?.reasoning_step_failed ??
        null,
      misconception:
        assessment.misconception ?? prev?.misconception ?? null,
    };
  }

  // Apply interventions AFTER assessments so an "I just got help on this"
  // event always lands on the latest level/bottleneck snapshot. We can
  // increment a concept the assessment loop never touched (e.g. a quiz
  // fail on a concept the LLM didn't surface this turn) — initialize with
  // a "weak" placeholder so downstream readers don't crash on missing
  // fields.
  for (const ev of interventions) {
    const canonical = canonicalConceptTag(ev.concept_tag);
    if (!canonical) continue;
    const prev = concepts[canonical];
    concepts[canonical] = prev
      ? {
          ...prev,
          intervention_cost: (prev.intervention_cost ?? 0) + 1,
          last_intervention: { type: ev.type, at: now },
        }
      : {
          level: "weak",
          attempts: 0,
          intervention_cost: 1,
          last_intervention: { type: ev.type, at: now },
          last_seen: now,
          evidence: "",
          bottleneck: "",
          reasoning_step_failed: null,
          misconception: null,
        };
  }

  return { concepts };
}

function computeOverallLevel(
  graph: KnowledgeGraph,
): "strong" | "moderate" | "weak" | "unknown" {
  const entries = Object.values(graph.concepts);
  if (entries.length === 0) return "unknown";

  const weakCount = entries.filter((e) => e.level === "weak").length;
  const strongCount = entries.filter((e) => e.level === "strong").length;

  if (weakCount > entries.length * 0.4) return "weak";
  if (strongCount > entries.length * 0.6) return "strong";
  return "moderate";
}

// ── Public API ──────────────────────────────────────────────────────

/**
 * Run the Profiler Agent. Fire-and-forget from the chat endpoint.
 *
 * Reads existing learner_profile → analyzes latest interaction →
 * merges into knowledge graph → upserts back to Supabase.
 */
export async function runProfiler(
  sb: SupabaseClient,
  opts: {
    userId: string;
    courseId: string;
    studentQuestion: string;
    mentorResponse: string;
    recentHistory?: { role: string; content: string }[];
    interventions?: InterventionEvent[];
    log?: (...args: unknown[]) => void;
  },
): Promise<void> {
  const L = opts.log ?? ((...args: unknown[]) => console.log("[Profiler]", ...args));

  try {
    L("Analyzing interaction...");
    const assessment = await analyzeInteraction(
      opts.studentQuestion,
      opts.mentorResponse,
      opts.recentHistory ?? [],
    );
    L(`Identified ${assessment.concepts.length} concept(s). Overall: ${assessment.overallLevel}`);

    // Fetch existing profile (or default empty)
    const { data: existing } = await sb
      .from("learner_profiles")
      .select("knowledge_graph, total_sessions")
      .eq("user_id", opts.userId)
      .eq("course_id", opts.courseId)
      .maybeSingle();

    const currentGraph: KnowledgeGraph = existing?.knowledge_graph ?? {
      concepts: {},
    };
    const currentSessions: number = existing?.total_sessions ?? 0;

    const mergedGraph = mergeKnowledgeGraph(
      currentGraph,
      assessment.concepts,
      opts.interventions ?? [],
    );
    if (opts.interventions?.length) {
      L(`Recorded ${opts.interventions.length} intervention(s).`);
    }
    const overallLevel = computeOverallLevel(mergedGraph);

    // Upsert — same idempotent pattern as AlphaDesk's upsertListingRun
    const { error } = await sb.from("learner_profiles").upsert(
      {
        user_id: opts.userId,
        course_id: opts.courseId,
        knowledge_graph: mergedGraph,
        overall_level: overallLevel,
        total_sessions: currentSessions + 1,
        last_active_at: new Date().toISOString(),
        profiler_version: PROFILER_VERSION,
        profiler_notes: assessment.notes,
      },
      { onConflict: "user_id,course_id" },
    );

    if (error) {
      L("Upsert error:", error.message);
    } else {
      L(`Profile updated. Concepts tracked: ${Object.keys(mergedGraph.concepts).length}, overall: ${overallLevel}`);
    }
  } catch (err) {
    L("Profiler error (non-fatal):", err instanceof Error ? err.message : err);
  }
}

/**
 * Record one or more InterventionEvents WITHOUT running the LLM-based
 * assessment. Used by the quiz_response handler — a wrong answer is a
 * structured signal we already trust, no need to spend a profiler call
 * to learn what we already know. Atomic read-modify-write on
 * learner_profiles.knowledge_graph; idempotency at the row level only
 * (a duplicate POST would double-count, which is acceptable for the
 * effort-ledger semantics here).
 */
export async function recordInterventions(
  sb: SupabaseClient,
  opts: {
    userId: string;
    courseId: string;
    interventions: InterventionEvent[];
    log?: (...args: unknown[]) => void;
  },
): Promise<void> {
  const L =
    opts.log ?? ((...args: unknown[]) => console.log("[Interventions]", ...args));

  if (opts.interventions.length === 0) return;

  try {
    const { data: existing } = await sb
      .from("learner_profiles")
      .select("knowledge_graph, total_sessions")
      .eq("user_id", opts.userId)
      .eq("course_id", opts.courseId)
      .maybeSingle();

    const currentGraph: KnowledgeGraph = existing?.knowledge_graph ?? {
      concepts: {},
    };
    const currentSessions: number = existing?.total_sessions ?? 0;

    const mergedGraph = mergeKnowledgeGraph(currentGraph, [], opts.interventions);
    const overallLevel = computeOverallLevel(mergedGraph);

    const { error } = await sb.from("learner_profiles").upsert(
      {
        user_id: opts.userId,
        course_id: opts.courseId,
        knowledge_graph: mergedGraph,
        overall_level: overallLevel,
        total_sessions: currentSessions,
        last_active_at: new Date().toISOString(),
        profiler_version: PROFILER_VERSION,
      },
      { onConflict: "user_id,course_id" },
    );

    if (error) {
      L("Upsert error:", error.message);
    } else {
      L(`Recorded ${opts.interventions.length} intervention(s).`);
    }
  } catch (err) {
    L(
      "recordInterventions error (non-fatal):",
      err instanceof Error ? err.message : err,
    );
  }
}
