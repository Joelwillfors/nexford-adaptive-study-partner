/**
 * Tier 3 frustration classifier — called only when the deterministic Tier 1
 * rules haven't fired and the Tier 2 accumulated score sits in the ambiguous
 * band (25-49). Uses `gpt-4o-mini` for low latency.
 *
 * We memoize per process by a hash of the recent student-turn window so the
 * same borderline exchange isn't reclassified on every user interaction. This
 * is a best-effort cache — a single instance is fine for the demo; behind a
 * load balancer we'd move it to Redis.
 */
import OpenAI from "openai";

const CLASSIFIER_MODEL = "gpt-4o-mini";
const CACHE_MAX = 128;

type State = "cooperative" | "struggling" | "frustrated" | "giving_up";

export interface FrustrationClassification {
  state: State;
  confidence: number;
}

const cache = new Map<string, FrustrationClassification>();

function cacheKey(turns: string[]): string {
  // Normalize so trivial whitespace doesn't bust the cache.
  return turns
    .map((t) => t.trim().toLowerCase().replace(/\s+/g, " "))
    .join(" || ");
}

function rememberInCache(
  key: string,
  value: FrustrationClassification,
): void {
  if (cache.size >= CACHE_MAX) {
    const oldest = cache.keys().next().value;
    if (oldest) cache.delete(oldest);
  }
  cache.set(key, value);
}

const SYSTEM_PROMPT = `You are a learning-science classifier. Given the last few messages a student typed to their tutor, label the student's current emotional/motivational state.

LABELS (choose exactly one):
- "cooperative": actively reasoning, asking follow-ups, attempting answers
- "struggling": confused but still trying; shows effort even if wrong
- "frustrated": visibly irritated, complaining about the method or material, pushing back hard
- "giving_up": demanding the answer, refusing to engage, signaling they're done trying

Respond with JSON only: { "state": "...", "confidence": 0.0-1.0 }
Confidence reflects how clear the signal is (0.5 = toss-up, 0.9+ = unambiguous).`;

/**
 * Classify the student's state from the last few turns.
 *
 * Returns null on any error or when the API key is missing (fail-open so
 * the mode-switch logic degrades gracefully to Tier 1/2 only).
 */
export async function classifyFrustration(
  turns: string[],
): Promise<FrustrationClassification | null> {
  if (!turns.length) return null;
  if (!process.env.OPENAI_API_KEY) return null;

  const key = cacheKey(turns);
  const cached = cache.get(key);
  if (cached) return cached;

  try {
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const joined = turns
      .slice(-3)
      .map((t, i) => `Turn ${i + 1}: ${t}`)
      .join("\n");

    const completion = await client.chat.completions.create({
      model: CLASSIFIER_MODEL,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: joined },
      ],
      temperature: 0.1,
      max_tokens: 64,
      response_format: { type: "json_object" },
    });

    const raw = completion.choices[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(raw) as Partial<FrustrationClassification>;

    const state = parsed.state as State | undefined;
    const confidence =
      typeof parsed.confidence === "number"
        ? Math.max(0, Math.min(1, parsed.confidence))
        : 0;

    if (
      state === "cooperative" ||
      state === "struggling" ||
      state === "frustrated" ||
      state === "giving_up"
    ) {
      const result: FrustrationClassification = { state, confidence };
      rememberInCache(key, result);
      return result;
    }
    return null;
  } catch (err) {
    console.error("[FrustrationClassifier] error:", err);
    return null;
  }
}
