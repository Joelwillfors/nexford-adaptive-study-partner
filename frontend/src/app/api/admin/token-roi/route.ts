import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/clients";
import { DEMO_MODE } from "@/lib/flags";

/**
 * GET /api/admin/token-roi
 *
 * Aggregates LLM token spend from chat_logs metadata. Each mentor
 * row carries `metadata.token_usage = { input, output, total }` plus
 * `metadata.model_used` (the OpenAI model). We compute:
 *
 *   - total tokens, total cost (USD), turn count, last 14d
 *   - per-model breakdown
 *   - per-day burn for the last 14 days
 *   - top concepts by tokens (which topics burn the most)
 *
 * Pricing is a hardcoded approximation — production should pull
 * pricing from a config table or the OpenAI billing API.
 *
 * Demo fallback: deterministic numbers so the slide always renders.
 */

const PRICE_PER_1K = {
  "gpt-4o": { input: 0.0025, output: 0.01 },
  "gpt-4o-mini": { input: 0.00015, output: 0.0006 },
  "gpt-4-turbo": { input: 0.01, output: 0.03 },
} as const;

const DAYS_WINDOW = 14;
const FALLBACK_RESPONSE = buildFallbackResponse();

interface MetricsRow {
  metadata: {
    token_usage?: { input?: number; output?: number; total?: number };
    model_used?: string;
    concept_tag?: string;
    kind?: string;
  } | null;
  created_at: string;
}

export async function GET() {
  if (DEMO_MODE) {
    return NextResponse.json(FALLBACK_RESPONSE);
  }

  try {
    const supabase = createServiceClient();
    const since = new Date();
    since.setUTCDate(since.getUTCDate() - DAYS_WINDOW);

    const { data, error } = await supabase
      .from("chat_logs")
      .select("metadata, created_at")
      .gte("created_at", since.toISOString())
      .eq("role", "mentor")
      .limit(5000);

    if (error) throw error;

    const rows: MetricsRow[] = data ?? [];

    let totalIn = 0;
    let totalOut = 0;
    let totalCost = 0;
    let turnCount = 0;
    const byModel: Record<
      string,
      { tokens: number; cost: number; turns: number }
    > = {};
    const byDay: Record<string, { tokens: number; cost: number }> = {};
    const byConcept: Record<string, { tokens: number; cost: number }> = {};

    for (const row of rows) {
      const usage = row.metadata?.token_usage;
      if (!usage || typeof usage.total !== "number") continue;
      const model = row.metadata?.model_used ?? "unknown";
      const inToks = usage.input ?? 0;
      const outToks = usage.output ?? 0;
      const cost = priceFor(model, inToks, outToks);

      totalIn += inToks;
      totalOut += outToks;
      totalCost += cost;
      turnCount += 1;

      byModel[model] = {
        tokens: (byModel[model]?.tokens ?? 0) + usage.total,
        cost: (byModel[model]?.cost ?? 0) + cost,
        turns: (byModel[model]?.turns ?? 0) + 1,
      };

      const day = row.created_at.slice(0, 10);
      byDay[day] = {
        tokens: (byDay[day]?.tokens ?? 0) + usage.total,
        cost: (byDay[day]?.cost ?? 0) + cost,
      };

      const concept = row.metadata?.concept_tag;
      if (concept) {
        byConcept[concept] = {
          tokens: (byConcept[concept]?.tokens ?? 0) + usage.total,
          cost: (byConcept[concept]?.cost ?? 0) + cost,
        };
      }
    }

    const days = lastNDates(DAYS_WINDOW).map((d) => ({
      day: d,
      tokens: byDay[d]?.tokens ?? 0,
      cost: round4(byDay[d]?.cost ?? 0),
    }));

    const models = Object.entries(byModel)
      .map(([model, v]) => ({
        model,
        tokens: v.tokens,
        cost: round4(v.cost),
        turns: v.turns,
        avgTokensPerTurn: Math.round(v.tokens / Math.max(v.turns, 1)),
      }))
      .sort((a, b) => b.tokens - a.tokens);

    const topConcepts = Object.entries(byConcept)
      .map(([concept, v]) => ({
        concept,
        tokens: v.tokens,
        cost: round4(v.cost),
      }))
      .sort((a, b) => b.cost - a.cost)
      .slice(0, 8);

    if (turnCount === 0) {
      // Live data exists but no token metadata yet — keep the slide
      // demoable.
      return NextResponse.json(FALLBACK_RESPONSE);
    }

    return NextResponse.json({
      windowDays: DAYS_WINDOW,
      totals: {
        tokens: totalIn + totalOut,
        inputTokens: totalIn,
        outputTokens: totalOut,
        cost: round4(totalCost),
        turns: turnCount,
        avgCostPerTurn: round4(totalCost / Math.max(turnCount, 1)),
      },
      models,
      days,
      topConcepts,
      source: "live" as const,
    });
  } catch (err) {
    console.error("[token-roi] failed, returning demo seed", err);
    return NextResponse.json(FALLBACK_RESPONSE);
  }
}

function priceFor(model: string, inTok: number, outTok: number): number {
  const p =
    PRICE_PER_1K[model as keyof typeof PRICE_PER_1K] ??
    PRICE_PER_1K["gpt-4o-mini"];
  return (inTok * p.input + outTok * p.output) / 1000;
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

function lastNDates(n: number): string[] {
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i -= 1) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

function buildFallbackResponse() {
  // Hand-tuned numbers that read believably for a small cohort:
  // ~120 turns/day across 30 students, dominated by gpt-4o-mini for
  // routing/profiler with gpt-4o on the user-facing socratic turns.
  const days = lastNDates(DAYS_WINDOW).map((d, i) => {
    const baseTokens = 38000 + Math.round(Math.sin(i * 0.7) * 9000) + i * 1200;
    const cost = round4(baseTokens * 0.0000095);
    return { day: d, tokens: baseTokens, cost };
  });
  const totalTokens = days.reduce((a, d) => a + d.tokens, 0);
  const totalCost = round4(days.reduce((a, d) => a + d.cost, 0));
  const turns = 1640;
  return {
    windowDays: DAYS_WINDOW,
    totals: {
      tokens: totalTokens,
      inputTokens: Math.round(totalTokens * 0.62),
      outputTokens: Math.round(totalTokens * 0.38),
      cost: totalCost,
      turns,
      avgCostPerTurn: round4(totalCost / turns),
    },
    models: [
      {
        model: "gpt-4o",
        tokens: Math.round(totalTokens * 0.58),
        cost: round4(totalCost * 0.78),
        turns: 940,
        avgTokensPerTurn: Math.round((totalTokens * 0.58) / 940),
      },
      {
        model: "gpt-4o-mini",
        tokens: Math.round(totalTokens * 0.42),
        cost: round4(totalCost * 0.22),
        turns: 700,
        avgTokensPerTurn: Math.round((totalTokens * 0.42) / 700),
      },
    ],
    days,
    topConcepts: [
      { concept: "depreciation", tokens: 78400, cost: 0.6932 },
      { concept: "accrual_vs_cash", tokens: 64200, cost: 0.5681 },
      { concept: "matching_principle", tokens: 51800, cost: 0.4583 },
      { concept: "revenue_recognition", tokens: 47100, cost: 0.4168 },
      { concept: "wacc", tokens: 33900, cost: 0.3001 },
      { concept: "prepaid_expenses", tokens: 28600, cost: 0.2531 },
    ],
    source: "demo_seed" as const,
  };
}
