import { z } from "zod";

/**
 * Structured Assistant Message — discriminated union emitted by the Socratic
 * Mentor (and occasionally the Recap Agent). Renders inline in the drawer
 * as either chat text, a clickable quiz, or a recap card — all part of the
 * same conversation stream.
 */

export const TextMessageSchema = z.object({
  type: z.literal("text"),
  text: z.string(),
  concept_tag: z.string().optional(),
});

export const QuizMessageSchema = z.object({
  type: z.literal("quiz"),
  question: z.string(),
  options: z.array(z.string()).min(2).max(4),
  correct_index: z.number().int().min(0).max(3),
  concept_tag: z.string(),
  explanation: z.string().optional(),
  trigger: z.enum(["checkpoint", "confirmation", "spaced_review"]),
});

export const RecapMessageSchema = z.object({
  type: z.literal("recap"),
  mastered: z.array(z.string()),
  struggled: z.array(z.string()),
  next_focus: z.string(),
  principle: z.string().optional(),
  concept_tag: z.string().optional(),
  variant: z.enum(["mastered", "topic_closed"]).optional(),
});

export const AssistantMessageSchema = z.discriminatedUnion("type", [
  TextMessageSchema,
  QuizMessageSchema,
  RecapMessageSchema,
]);

export type TextMessage = z.infer<typeof TextMessageSchema>;
export type QuizMessage = z.infer<typeof QuizMessageSchema>;
export type RecapMessage = z.infer<typeof RecapMessageSchema>;
export type AssistantMessage = z.infer<typeof AssistantMessageSchema>;

/**
 * Prompt snippet describing the assistant-message envelope. We use
 * `response_format: { type: "json_object" }` (permissive) combined with this
 * explicit schema in the system prompt. Strict json_schema mode has issues
 * with discriminated unions that contain optional fields, and for demo
 * purposes the permissive mode is robust enough.
 */
export const ASSISTANT_MESSAGE_SCHEMA_PROMPT = `## OUTPUT ENVELOPE (STRICT JSON):
Return exactly one JSON object, no prose, matching one of three shapes:

TEXT response:
{
  "type": "text",
  "text": "<your 1-3 sentence Socratic response>",
  "concept_tag": "<snake_case concept identifier, e.g. matching_principle>"
}

QUIZ response (only when explicitly asked to generate a quiz):
{
  "type": "quiz",
  "question": "<scenario stem — concrete actor + concrete action + fresh numbers; NEVER a definition question>",
  "options": ["<concrete judgment or action>", "<concrete but wrong>", "<concrete but wrong>"],
  "correct_index": 0,
  "concept_tag": "<snake_case concept>",
  "explanation": "<one-sentence clarification shown after submission>",
  "trigger": "checkpoint"
}

Quiz stems are transfer probes. FORBIDDEN openings: "What is…", "Which of the following is the definition of…", "<Concept> is best defined as…". REQUIRED pattern: the stem names a concrete actor ("a founder", "a bakery", "you"), a concrete action with numbers ("just paid $6,000 for a 6-month warranty"), and asks for a judgment the student can only reach by reasoning through the concept.

RECAP response (end-of-session only):
{
  "type": "recap",
  "mastered": ["<concept>"],
  "struggled": ["<concept>"],
  "next_focus": "<what to study next>",
  "principle": "<one-sentence takeaway>",
  "concept_tag": "<snake_case concept identifier this recap closes>",
  "variant": "mastered" | "topic_closed"
}

Never mix shapes. Never include null fields. Emit only the fields for the chosen shape.`;

/**
 * Normalize a raw LLM output (with nulls for unused fields) into the
 * discriminated union our UI renders.
 */
export function normalizeAssistantMessage(raw: {
  type: string;
  text?: string | null;
  question?: string | null;
  options?: string[] | null;
  correct_index?: number | null;
  concept_tag?: string | null;
  explanation?: string | null;
  trigger?: string | null;
  mastered?: string[] | null;
  struggled?: string[] | null;
  next_focus?: string | null;
  principle?: string | null;
  variant?: string | null;
}): AssistantMessage {
  if (raw.type === "quiz") {
    return QuizMessageSchema.parse({
      type: "quiz",
      question: raw.question ?? "",
      options: raw.options ?? [],
      correct_index: raw.correct_index ?? 0,
      concept_tag: raw.concept_tag ?? "",
      explanation: raw.explanation ?? undefined,
      trigger: (raw.trigger as QuizMessage["trigger"]) ?? "checkpoint",
    });
  }
  if (raw.type === "recap") {
    const variant =
      raw.variant === "topic_closed" || raw.variant === "mastered"
        ? raw.variant
        : undefined;
    return RecapMessageSchema.parse({
      type: "recap",
      mastered: raw.mastered ?? [],
      struggled: raw.struggled ?? [],
      next_focus: raw.next_focus ?? "",
      principle: raw.principle ?? undefined,
      concept_tag: raw.concept_tag ?? undefined,
      variant,
    });
  }
  return TextMessageSchema.parse({
    type: "text",
    text: raw.text ?? "",
    concept_tag: raw.concept_tag ?? undefined,
  });
}
