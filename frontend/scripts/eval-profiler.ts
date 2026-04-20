/**
 * Profiler eval harness — n=20 labeled examples.
 *
 * Calls the Profiler's LLM extraction in isolation (no Supabase) and
 * scores it against hand-labeled ground truth. Three precision metrics:
 *   1. Concept-tag precision    — did it attach the right canonical tag?
 *   2. Misconception precision  — does the named misconception line up
 *                                  with the labeled type (substring match,
 *                                  case-insensitive)?
 *   3. Reasoning-step capture   — did it pinpoint a failed step at all
 *                                  (or correctly mark the concept strong)?
 *
 * Run:
 *   cd frontend
 *   OPENAI_API_KEY=sk-... npx tsx scripts/eval-profiler.ts
 *
 * The result table is the receipt the Product Brief's "Honest gaps"
 * section is waiting on — paste the printed numbers into the table and
 * the "no eval harness" gap becomes a measured number.
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { runProfilerLLMOnly } from "../src/lib/ai/profiler";
import { canonicalConceptTag } from "../src/lib/ai/concept-canon";

interface Example {
  id: string;
  studentQuestion: string;
  mentorResponse: string;
  /** Strict single-tag form (legacy). Mutually exclusive with expectedConceptTags. */
  expectedConceptTag?: string;
  /** Multi-tag form for legitimately ambiguous examples (canonical-sibling pairs).
   * Scorer counts a hit when ANY listed tag matches the Profiler output. */
  expectedConceptTags?: string[];
  expectedMisconceptionType?: string;
  expectedReasoningStep?: number;
  expectedLevel?: "strong" | "moderate" | "weak";
}

function expectedTagsFor(example: Example): string[] {
  if (example.expectedConceptTags && example.expectedConceptTags.length > 0) {
    return example.expectedConceptTags;
  }
  if (example.expectedConceptTag) return [example.expectedConceptTag];
  return [];
}

/** Tokens we consider "content" for misconception overlap scoring: lowercased,
 * hyphens collapsed to spaces, length >= 4, deduped. Stop-ish words (length <4)
 * are filtered out implicitly by the length floor. */
function contentTokens(phrase: string): string[] {
  const cleaned = phrase.toLowerCase().replace(/[-_/]+/g, " ");
  const raw = cleaned.split(/[^a-z0-9]+/).filter((t) => t.length >= 4);
  return Array.from(new Set(raw));
}

interface RowResult {
  id: string;
  expectedConcept: string;
  conceptHit: boolean;
  misconceptionHit: boolean | null;
  stepHit: boolean | null;
}

function loadEvalSet(): Example[] {
  const here = dirname(fileURLToPath(import.meta.url));
  const path = resolve(here, "profiler-eval-set.json");
  const raw = JSON.parse(readFileSync(path, "utf-8")) as {
    examples: Example[];
  };
  return raw.examples;
}

type ProfilerOutput = Awaited<ReturnType<typeof runProfilerLLMOnly>>;
type EnrichedConcept = ProfilerOutput["concepts"][number] & {
  canonical: string | null;
};

function dumpMiss(
  example: Example,
  enriched: EnrichedConcept[],
  expectedDisplay: string,
): void {
  console.log(`    [verbose] ${example.id} expected ${expectedDisplay}`);
  if (enriched.length === 0) {
    console.log("      Profiler returned NO concepts");
    return;
  }
  for (const c of enriched) {
    console.log(`      raw="${c.concept}"  canonical=${c.canonical}  level=${c.level}  step=${c.reasoning_step_failed}`);
    if (c.misconception) console.log(`        misconception: ${c.misconception}`);
    if (c.bottleneck) console.log(`        bottleneck:    ${c.bottleneck}`);
  }
}

function scoreExample(
  example: Example,
  output: ProfilerOutput,
): { row: RowResult; enriched: EnrichedConcept[]; expectedDisplay: string } {
  const expectedRaw = expectedTagsFor(example);
  const expectedCanonicals = expectedRaw
    .map((t) => canonicalConceptTag(t))
    .filter((t): t is string => Boolean(t));
  const expectedDisplay = expectedCanonicals.join(" | ") || expectedRaw.join(" | ");

  const enriched: EnrichedConcept[] = (output.concepts ?? []).map((c) => ({
    ...c,
    canonical: canonicalConceptTag(c.concept),
  }));
  const matched = enriched.find(
    (c) => c.canonical !== null && expectedCanonicals.includes(c.canonical),
  );

  const conceptHit = Boolean(matched);

  let misconceptionHit: boolean | null = null;
  if (example.expectedMisconceptionType) {
    if (!matched) {
      misconceptionHit = false;
    } else {
      const haystack = `${matched.misconception ?? ""} ${
        matched.bottleneck ?? ""
      }`.toLowerCase();
      const needleTokens = contentTokens(example.expectedMisconceptionType);
      const overlap = needleTokens.filter((tok) => haystack.includes(tok)).length;
      misconceptionHit = overlap >= 2;
    }
  }

  let stepHit: boolean | null = null;
  if (example.expectedLevel === "strong") {
    stepHit = matched?.level === "strong";
  } else if (example.expectedReasoningStep !== undefined) {
    stepHit = Boolean(matched && matched.reasoning_step_failed !== null);
  }

  return {
    row: {
      id: example.id,
      expectedConcept: expectedDisplay,
      conceptHit,
      misconceptionHit,
      stepHit,
    },
    enriched,
    expectedDisplay,
  };
}

function precision(values: Array<boolean | null>): {
  count: number;
  hits: number;
  pct: string;
} {
  const scored = values.filter((v): v is boolean => v !== null);
  const hits = scored.filter(Boolean).length;
  const pct = scored.length === 0 ? "n/a" : `${Math.round((hits / scored.length) * 100)}%`;
  return { count: scored.length, hits, pct };
}

async function main() {
  if (!process.env.OPENAI_API_KEY) {
    console.error("OPENAI_API_KEY is not set. Aborting.");
    process.exitCode = 1;
    return;
  }

  const verbose = process.argv.slice(2).some(
    (arg) => arg === "--verbose" || arg === "-v",
  );

  const examples = loadEvalSet();
  console.log(
    `Running Profiler eval against n=${examples.length} examples${verbose ? " (verbose)" : ""}...\n`,
  );

  const rows: RowResult[] = [];
  for (const example of examples) {
    process.stdout.write(`  ${example.id.padEnd(16)} ... `);
    try {
      const output = await runProfilerLLMOnly({
        studentQuestion: example.studentQuestion,
        mentorResponse: example.mentorResponse,
      });
      const { row, enriched, expectedDisplay } = scoreExample(example, output);
      rows.push(row);
      const flag = row.conceptHit ? "ok" : "MISS";
      console.log(flag);
      if (verbose && !row.conceptHit) {
        dumpMiss(example, enriched, expectedDisplay);
      }
    } catch (err) {
      console.log("ERROR", err instanceof Error ? err.message : err);
      rows.push({
        id: example.id,
        expectedConcept: expectedTagsFor(example).join(" | ") || "(unknown)",
        conceptHit: false,
        misconceptionHit: false,
        stepHit: false,
      });
    }
  }

  const concept = precision(rows.map((r) => r.conceptHit));
  const misconception = precision(rows.map((r) => r.misconceptionHit));
  const step = precision(rows.map((r) => r.stepHit));

  console.log("\nResults — Profiler eval (n = " + rows.length + ")");
  console.log("─".repeat(60));
  console.log(`  Concept-tag precision        ${concept.hits}/${concept.count}  (${concept.pct})`);
  console.log(`  Misconception-type precision ${misconception.hits}/${misconception.count}  (${misconception.pct})`);
  console.log(`  Reasoning-step capture       ${step.hits}/${step.count}  (${step.pct})`);
  console.log("─".repeat(60));
  console.log("\nPaste these numbers into Docs/PRODUCT_BRIEF.md → Honest gaps → Profiler eval table.\n");

  const misses = rows.filter((r) => !r.conceptHit);
  if (misses.length) {
    console.log("Concept-tag misses (worth inspecting):");
    for (const m of misses) {
      console.log(`  - ${m.id} (expected ${m.expectedConcept})`);
    }
  }
}

main().catch((err) => {
  console.error("Eval failed:", err);
  process.exitCode = 1;
});
