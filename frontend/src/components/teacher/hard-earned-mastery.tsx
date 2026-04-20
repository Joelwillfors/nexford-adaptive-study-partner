"use client";

/**
 * HardEarnedMastery — the dual-scoring receipts panel.
 *
 * Shows (student, concept) tuples where the student now reads STRONG
 * but only after ≥3 interventions (Direct-mode hand-holding, quiz fail,
 * topic_closed). Story to the teacher: "they understand it now, but
 * here's how hard the road there was — keep an eye on retention."
 *
 * Surfaced under Class Intelligence so the teacher can spot fragile
 * mastery before the student themselves does. Student-side surfaces
 * (Journey view) deliberately hide this number — the student should
 * see their progress, not their effort cost.
 */
import Link from "next/link";
import { formatConcept, type HardEarnedRow } from "./types";

const INTERVENTION_LABEL: Record<HardEarnedRow["lastIntervention"] extends infer T
  ? T extends { type: infer K }
    ? K extends string
      ? K
      : never
    : never
  : never, string> = {
  direct_mode: "Direct-mode handoff",
  quiz_fail: "Quiz miss",
  topic_closed: "Topic closed",
};

export function HardEarnedMastery({ rows }: { rows: HardEarnedRow[] }) {
  if (rows.length === 0) return null;

  const visible = rows.slice(0, 6);

  return (
    <section className="mt-12">
      <div className="mb-4 flex items-end justify-between">
        <div>
          <h2 className="text-lg font-semibold text-[#0f0f0f]">
            Hard-Earned Mastery
          </h2>
          <p className="mt-0.5 text-sm text-[#6b7280]">
            Students now strong on these concepts — but the road there was
            costly. Watch for retention dips.
          </p>
        </div>
        <span className="text-xs text-[#6b7280]">
          {rows.length} flagged
        </span>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {visible.map((row) => (
          <Link
            key={`${row.userId}::${row.concept}`}
            href={`/teacher/concept/${row.concept}`}
            className="rounded-xl border border-[#e5e7eb] bg-white px-5 py-4 transition hover:border-[#ffb300] hover:shadow-sm"
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-semibold text-[#0f0f0f]">
                  {formatConcept(row.concept)}
                </p>
                <p className="mt-0.5 text-xs font-mono text-[#6b7280]">
                  {row.userId.slice(0, 12)}…
                </p>
              </div>
              <div className="flex flex-col items-end">
                <span className="rounded-full bg-[#fef3c7] px-2.5 py-0.5 text-xs font-bold text-[#92400e]">
                  {row.interventionCost}× help
                </span>
                <span className="mt-1 text-[10px] uppercase tracking-wider text-[#10b981]">
                  Now strong
                </span>
              </div>
            </div>
            {row.lastIntervention && (
              <p className="mt-3 text-xs text-[#6b7280]">
                Last intervention:{" "}
                <span className="text-[#0f0f0f]">
                  {INTERVENTION_LABEL[row.lastIntervention.type] ??
                    row.lastIntervention.type}
                </span>
              </p>
            )}
          </Link>
        ))}
      </div>
    </section>
  );
}
