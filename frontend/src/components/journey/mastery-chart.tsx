"use client";

import {
  Bar,
  BarChart,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { humanizeProfilerText } from "@/lib/journey/humanize";

export type ConceptLevel = "strong" | "moderate" | "weak";

export interface JourneyConcept {
  tag: string;
  name: string;
  level: ConceptLevel;
  levelScore: number;
  attempts: number;
  lastSeen: string | null;
  bottleneck: string | null;
  reasoningStepFailed: string | number | null;
  misconception: string | null;
}

const LEVEL_FILL: Record<ConceptLevel, string> = {
  strong: "#16a34a",
  moderate: "#f59e0b",
  weak: "#dc2626",
};

const LEVEL_LABEL: Record<ConceptLevel, string> = {
  strong: "Solid",
  moderate: "Building",
  weak: "Needs practice",
};

function formatRelative(iso: string | null): string {
  if (!iso) return "—";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "—";
  const diffMs = Date.now() - then;
  const days = Math.floor(diffMs / (24 * 60 * 60 * 1000));
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 4) return `${weeks} week${weeks === 1 ? "" : "s"} ago`;
  const months = Math.floor(days / 30);
  return `${months} month${months === 1 ? "" : "s"} ago`;
}

function TooltipContent({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: JourneyConcept }>;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const c = payload[0].payload;
  return (
    <div className="rounded-lg border border-[#e5e7eb] bg-white px-3 py-2 text-xs shadow-lg">
      <p className="font-semibold text-[#0f0f0f]">{c.name}</p>
      <p className="mt-0.5 text-[#6b7280]">
        {LEVEL_LABEL[c.level]} · {c.attempts} attempt
        {c.attempts === 1 ? "" : "s"} · Last seen {formatRelative(c.lastSeen)}
      </p>
      {c.bottleneck && (
        <p className="mt-1.5 max-w-xs text-[#0f0f0f]">
          <span className="font-semibold uppercase tracking-widest text-[9px] text-[#92400e]">
            What slowed you down
          </span>
          <br />
          {humanizeProfilerText("bottleneck", c.bottleneck)}
        </p>
      )}
      {c.reasoningStepFailed && (
        <p className="mt-1.5 max-w-xs text-[#0f0f0f]">
          <span className="font-semibold uppercase tracking-widest text-[9px] text-[#92400e]">
            Tricky step
          </span>
          <br />
          {humanizeProfilerText("reasoningStepFailed", c.reasoningStepFailed)}
        </p>
      )}
      {c.misconception && (
        <p className="mt-1.5 max-w-xs text-[#0f0f0f]">
          <span className="font-semibold uppercase tracking-widest text-[9px] text-[#92400e]">
            Mix-up to fix
          </span>
          <br />
          {humanizeProfilerText("misconception", c.misconception)}
        </p>
      )}
    </div>
  );
}

export function MasteryChart({
  concepts,
  onConceptClick,
}: {
  concepts: JourneyConcept[];
  onConceptClick?: (concept: JourneyConcept) => void;
}) {
  if (concepts.length === 0) return null;

  const height = Math.max(concepts.length * 44 + 40, 180);

  return (
    <div style={{ width: "100%", height, minWidth: 0 }}>
      <ResponsiveContainer minWidth={0} minHeight={0}>
        <BarChart
          layout="vertical"
          data={concepts}
          margin={{ top: 8, right: 24, left: 8, bottom: 8 }}
          barCategoryGap={8}
        >
          <XAxis
            type="number"
            domain={[0, 3]}
            ticks={[1, 2, 3]}
            tickFormatter={(v) =>
              v === 1 ? "Shaky" : v === 2 ? "Building" : "Solid"
            }
            tick={{ fontSize: 11, fill: "#6b7280" }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            type="category"
            dataKey="name"
            width={160}
            tick={{ fontSize: 12, fill: "#0f0f0f" }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            cursor={{ fill: "rgba(15, 15, 15, 0.04)" }}
            content={<TooltipContent />}
          />
          <Bar
            dataKey="levelScore"
            radius={[4, 4, 4, 4]}
            barSize={18}
            onClick={(data) => {
              if (!onConceptClick) return;
              // Recharts passes the data point as the first argument to onClick;
              // when a Cell is clicked the payload lives on the `payload` field.
              const payload = (data as { payload?: JourneyConcept })?.payload;
              if (payload?.tag) onConceptClick(payload);
            }}
            style={onConceptClick ? { cursor: "pointer" } : undefined}
          >
            {concepts.map((c) => (
              <Cell key={c.tag} fill={LEVEL_FILL[c.level]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
