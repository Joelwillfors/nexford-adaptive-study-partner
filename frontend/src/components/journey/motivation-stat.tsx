"use client";

/**
 * MotivationStat — a small data-anchored pill ("95% of students who reach
 * Strong on Depreciation pass the final"). Hand-seeded for the demo;
 * easily swappable for real cohort stats once we ship Phase 5.
 *
 * Anchored on a thin Recharts radial bar so the number feels measured,
 * not invented. Renders inline at the top of the Journey view and on
 * the lesson header. Quiet — never the loudest thing on the page.
 */
import { motion } from "framer-motion";
import { RadialBar, RadialBarChart, PolarAngleAxis } from "recharts";

const PILL_SIZE_PX = 56;

interface Props {
  percent: number;
  headline: string;
  subhead: string;
  accent?: "amber" | "green" | "blue";
}

const ACCENT: Record<NonNullable<Props["accent"]>, { fg: string; bg: string }> = {
  amber: { fg: "#f59e0b", bg: "#fef3c7" },
  green: { fg: "#10b981", bg: "#d1fae5" },
  blue: { fg: "#3b82f6", bg: "#dbeafe" },
};

export function MotivationStat({
  percent,
  headline,
  subhead,
  accent = "amber",
}: Props) {
  const colors = ACCENT[accent];
  const data = [{ name: "stat", value: percent, fill: colors.fg }];

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="flex items-center gap-4 rounded-xl border border-[#e5e7eb] bg-white px-4 py-3"
    >
      <div className="relative h-14 w-14 shrink-0">
        <RadialBarChart
          width={PILL_SIZE_PX}
          height={PILL_SIZE_PX}
          cx="50%"
          cy="50%"
          innerRadius="65%"
          outerRadius="100%"
          data={data}
          startAngle={90}
          endAngle={-270}
        >
          <PolarAngleAxis
            type="number"
            domain={[0, 100]}
            angleAxisId={0}
            tick={false}
          />
          <RadialBar
            background={{ fill: colors.bg }}
            dataKey="value"
            cornerRadius={6}
          />
        </RadialBarChart>
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-xs font-bold text-[#0f0f0f]">
          {percent}%
        </div>
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold leading-snug text-[#0f0f0f]">
          {headline}
        </p>
        <p className="mt-0.5 text-xs text-[#6b7280]">{subhead}</p>
      </div>
    </motion.div>
  );
}
