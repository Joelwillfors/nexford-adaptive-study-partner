"use client";

import { useEffect, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Coins, Cpu, TrendingUp, Zap } from "lucide-react";
import { motion } from "framer-motion";
import { Nav } from "@/components/nav";
import { formatConcept } from "@/components/teacher/types";

interface RoiResponse {
  windowDays: number;
  totals: {
    tokens: number;
    inputTokens: number;
    outputTokens: number;
    cost: number;
    turns: number;
    avgCostPerTurn: number;
  };
  models: {
    model: string;
    tokens: number;
    cost: number;
    turns: number;
    avgTokensPerTurn: number;
  }[];
  days: { day: string; tokens: number; cost: number }[];
  topConcepts: { concept: string; tokens: number; cost: number }[];
  source: "live" | "demo_seed";
}

const MODEL_COLORS: Record<string, string> = {
  "gpt-4o": "#0f0f0f",
  "gpt-4o-mini": "#ffb300",
  "gpt-4-turbo": "#92400e",
};

export default function TokenRoiPage() {
  const [data, setData] = useState<RoiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/token-roi")
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(setData)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="flex min-h-screen flex-col">
      <Nav />
      <main className="flex-1 bg-[#f9fafb] px-6 py-12">
        <div className="mx-auto max-w-5xl">
          <div className="flex items-end justify-between">
            <div>
              <p className="text-xs font-medium uppercase tracking-widest text-[#6b7280]">
                Operations
              </p>
              <h1 className="mt-1 text-3xl font-bold tracking-tight text-[#0f0f0f]">
                Token Economics
              </h1>
              <p className="mt-1 text-sm text-[#6b7280]">
                LLM spend by model, day, and concept. Use this to find the
                topics where the mentor is most expensive — those are the
                first candidates for cached or local handling.
              </p>
            </div>
            {data && (
              <span
                className={`rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-widest ${
                  data.source === "live"
                    ? "border-green-200 bg-green-50 text-green-700"
                    : "border-[#fde047] bg-[#fefce8] text-[#92400e]"
                }`}
              >
                {data.source === "live" ? "Live" : "Demo seed"}
              </span>
            )}
          </div>

          {loading && (
            <div className="mt-16 flex justify-center">
              <div className="h-7 w-7 animate-spin rounded-full border-2 border-[#e5e7eb] border-t-[#0f0f0f]" />
            </div>
          )}

          {error && (
            <div className="mt-8 rounded-xl border border-[#fde047] bg-[#fefce8] px-5 py-4 text-sm text-[#0f0f0f]">
              {error}
            </div>
          )}

          {data && (
            <>
              <motion.div
                initial="hidden"
                animate="visible"
                variants={{
                  hidden: {},
                  visible: { transition: { staggerChildren: 0.07 } },
                }}
                className="mt-8 grid gap-4 sm:grid-cols-4"
              >
                <Stat
                  icon={<Coins className="h-4 w-4 text-[#92400e]" />}
                  label={`Spend (${data.windowDays}d)`}
                  value={`$${data.totals.cost.toFixed(2)}`}
                />
                <Stat
                  icon={<Zap className="h-4 w-4 text-[#ffb300]" />}
                  label="Tokens"
                  value={formatTokens(data.totals.tokens)}
                />
                <Stat
                  icon={<TrendingUp className="h-4 w-4 text-green-600" />}
                  label="Mentor turns"
                  value={data.totals.turns.toLocaleString()}
                />
                <Stat
                  icon={<Cpu className="h-4 w-4 text-[#0f0f0f]" />}
                  label="Avg / turn"
                  value={`$${data.totals.avgCostPerTurn.toFixed(4)}`}
                />
              </motion.div>

              <section className="mt-8 rounded-xl border border-[#e5e7eb] bg-white p-6">
                <h2 className="text-lg font-semibold text-[#0f0f0f]">
                  Daily token burn
                </h2>
                <p className="mt-0.5 text-sm text-[#6b7280]">
                  Last {data.windowDays} days. Cost shown in USD.
                </p>
                <div className="mt-4 h-56 w-full" style={{ minWidth: 0 }}>
                  <ResponsiveContainer
                    width="100%"
                    height="100%"
                    minWidth={0}
                    minHeight={0}
                  >
                    <AreaChart
                      data={data.days}
                      margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
                    >
                      <defs>
                        <linearGradient
                          id="costGradient"
                          x1="0"
                          y1="0"
                          x2="0"
                          y2="1"
                        >
                          <stop
                            offset="0%"
                            stopColor="#ffb300"
                            stopOpacity={0.55}
                          />
                          <stop
                            offset="100%"
                            stopColor="#ffb300"
                            stopOpacity={0.05}
                          />
                        </linearGradient>
                      </defs>
                      <CartesianGrid
                        strokeDasharray="3 3"
                        stroke="#f3f4f6"
                      />
                      <XAxis
                        dataKey="day"
                        tickFormatter={(v) => v.slice(5)}
                        tick={{ fontSize: 11, fill: "#6b7280" }}
                        axisLine={{ stroke: "#e5e7eb" }}
                        tickLine={false}
                      />
                      <YAxis
                        tickFormatter={(v) => `$${Number(v).toFixed(2)}`}
                        tick={{ fontSize: 11, fill: "#6b7280" }}
                        axisLine={{ stroke: "#e5e7eb" }}
                        tickLine={false}
                        width={60}
                      />
                      <Tooltip
                        contentStyle={{
                          borderRadius: 8,
                          border: "1px solid #e5e7eb",
                          fontSize: 12,
                        }}
                        formatter={
                          ((value: number, key: string) =>
                            key === "cost"
                              ? [`$${Number(value).toFixed(4)}`, "Cost"]
                              : [
                                  Number(value).toLocaleString(),
                                  "Tokens",
                                ]) as never
                        }
                        labelFormatter={((label: string) => label) as never}
                      />
                      <Area
                        type="monotone"
                        dataKey="cost"
                        stroke="#ffb300"
                        strokeWidth={2}
                        fill="url(#costGradient)"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </section>

              <div className="mt-8 grid gap-4 lg:grid-cols-2">
                <section className="rounded-xl border border-[#e5e7eb] bg-white p-6">
                  <h2 className="text-lg font-semibold text-[#0f0f0f]">
                    By model
                  </h2>
                  <p className="mt-0.5 text-sm text-[#6b7280]">
                    Where the budget lands. Smaller models route the boring
                    work; the big model only fires on Socratic turns.
                  </p>
                  <div className="mt-5 space-y-4">
                    {data.models.map((m) => {
                      const pct =
                        (m.cost / Math.max(data.totals.cost, 0.0001)) * 100;
                      return (
                        <div key={m.model}>
                          <div className="flex items-baseline justify-between text-sm">
                            <span className="font-medium text-[#0f0f0f]">
                              {m.model}
                            </span>
                            <span className="text-[#6b7280]">
                              ${m.cost.toFixed(2)} ·{" "}
                              {m.turns.toLocaleString()} turns
                            </span>
                          </div>
                          <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-[#f3f4f6]">
                            <div
                              className="h-full rounded-full"
                              style={{
                                width: `${pct.toFixed(1)}%`,
                                backgroundColor:
                                  MODEL_COLORS[m.model] ?? "#6b7280",
                              }}
                            />
                          </div>
                          <p className="mt-1 text-[11px] text-[#6b7280]">
                            {m.avgTokensPerTurn.toLocaleString()} avg tokens /
                            turn · {pct.toFixed(1)}% of spend
                          </p>
                        </div>
                      );
                    })}
                  </div>
                </section>

                <section className="rounded-xl border border-[#e5e7eb] bg-white p-6">
                  <h2 className="text-lg font-semibold text-[#0f0f0f]">
                    Most expensive concepts
                  </h2>
                  <p className="mt-0.5 text-sm text-[#6b7280]">
                    Topics where the mentor spends the most. These are the
                    best candidates for canned responses or smaller models.
                  </p>
                  <div className="mt-4 h-64 w-full" style={{ minWidth: 0 }}>
                    <ResponsiveContainer
                      width="100%"
                      height="100%"
                      minWidth={0}
                      minHeight={0}
                    >
                      <BarChart
                        data={data.topConcepts.map((c) => ({
                          name: formatConcept(c.concept),
                          cost: c.cost,
                          tokens: c.tokens,
                        }))}
                        layout="vertical"
                        margin={{ top: 0, right: 16, bottom: 0, left: 0 }}
                      >
                        <CartesianGrid
                          strokeDasharray="3 3"
                          stroke="#f3f4f6"
                        />
                        <XAxis
                          type="number"
                          tickFormatter={(v) => `$${Number(v).toFixed(2)}`}
                          tick={{ fontSize: 11, fill: "#6b7280" }}
                          axisLine={{ stroke: "#e5e7eb" }}
                          tickLine={false}
                        />
                        <YAxis
                          dataKey="name"
                          type="category"
                          tick={{ fontSize: 11, fill: "#0f0f0f" }}
                          axisLine={{ stroke: "#e5e7eb" }}
                          tickLine={false}
                          width={140}
                        />
                        <Tooltip
                          contentStyle={{
                            borderRadius: 8,
                            border: "1px solid #e5e7eb",
                            fontSize: 12,
                          }}
                          formatter={
                            ((value: number, key: string) =>
                              key === "cost"
                                ? [`$${Number(value).toFixed(4)}`, "Cost"]
                                : [
                                    Number(value).toLocaleString(),
                                    "Tokens",
                                  ]) as never
                          }
                        />
                        <Bar dataKey="cost" radius={[0, 6, 6, 0]}>
                          {data.topConcepts.map((_, i) => (
                            <Cell
                              key={i}
                              fill={i === 0 ? "#0f0f0f" : "#ffb300"}
                            />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </section>
              </div>

              <div className="mt-8 rounded-xl border border-[#fde047] bg-[#fefce8] p-5">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-[#92400e]">
                  CEO note
                </p>
                <p className="mt-1 text-sm leading-relaxed text-[#0f0f0f]">
                  At today&apos;s pace, the cohort runs at about{" "}
                  <strong>
                    ${(data.totals.cost / data.windowDays).toFixed(2)}/day
                  </strong>{" "}
                  in mentor inference. Upgrading the top three concepts to
                  cached responses would cut roughly{" "}
                  <strong>
                    $
                    {data.topConcepts
                      .slice(0, 3)
                      .reduce((a, c) => a + c.cost, 0)
                      .toFixed(2)}
                  </strong>{" "}
                  off the {data.windowDays}-day window before any cohort
                  growth.
                </p>
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}

function Stat({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <motion.div
      variants={{
        hidden: { opacity: 0, y: 8 },
        visible: { opacity: 1, y: 0 },
      }}
      className="rounded-xl border border-[#e5e7eb] bg-white px-5 py-5"
    >
      <div className="flex items-center gap-2">
        {icon}
        <p className="text-xs font-medium uppercase tracking-widest text-[#6b7280]">
          {label}
        </p>
      </div>
      <p className="mt-1.5 text-2xl font-bold text-[#0f0f0f]">{value}</p>
    </motion.div>
  );
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}
