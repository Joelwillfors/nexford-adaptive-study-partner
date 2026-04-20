/**
 * Dropout Risk Score — pure computation from a learner_profile row.
 *
 * Formula (per PLAN.md Phase 2):
 *   score =
 *     bottleneck_frequency    * 0.4 +
 *     session_length_trend    * 0.3 +
 *     days_since_last_session * 0.3
 *
 * Each factor is normalized to [0, 1]; `score` is therefore bounded [0, 1].
 * Bands: green < 0.34, yellow 0.34–0.66, red >= 0.67.
 *
 * Notes on proxies:
 *   - We do not persist per-session length, so session_length_trend is
 *     approximated as `clamp(1 - total_sessions / 10, 0, 1)` — low engagement
 *     over the course is treated as elevated risk. If/when we start logging
 *     per-session duration on chat_sessions, this can be swapped out without
 *     changing callers.
 */

export type RiskBand = "green" | "yellow" | "red";

export interface RiskFactors {
  bottleneckFrequency: number;
  sessionLengthTrend: number;
  daysSinceLastSession: number;
}

export interface RiskReason {
  text: string;
  tooltip: string;
}

export interface RiskResult {
  score: number;
  band: RiskBand;
  factors: RiskFactors;
  reasons: RiskReason[];
}

export interface RiskInput {
  knowledgeGraph: {
    concepts?: Record<string, { level?: string }>;
  } | null;
  totalSessions: number | null;
  lastActive: string | null;
  now?: Date;
}

function clamp01(v: number): number {
  if (v < 0) return 0;
  if (v > 1) return 1;
  return v;
}

function bandFor(score: number): RiskBand {
  if (score >= 0.67) return "red";
  if (score >= 0.34) return "yellow";
  return "green";
}

export function computeRiskScore(input: RiskInput): RiskResult {
  const concepts = input.knowledgeGraph?.concepts ?? {};
  const conceptKeys = Object.keys(concepts);
  const totalConceptCount = conceptKeys.length;
  const weakConceptCount = conceptKeys.filter(
    (k) => concepts[k]?.level === "weak",
  ).length;

  const bottleneckFrequency =
    totalConceptCount > 0
      ? clamp01(weakConceptCount / totalConceptCount)
      : 0;

  const totalSessions = input.totalSessions ?? 0;
  const sessionLengthTrend = clamp01(1 - totalSessions / 10);

  const now = (input.now ?? new Date()).getTime();
  let daysSinceLastSession = 1;
  if (input.lastActive) {
    const then = new Date(input.lastActive).getTime();
    if (!Number.isNaN(then)) {
      const days = Math.max(0, (now - then) / (24 * 60 * 60 * 1000));
      daysSinceLastSession = clamp01(days / 14);
    }
  }

  const score =
    bottleneckFrequency * 0.4 +
    sessionLengthTrend * 0.3 +
    daysSinceLastSession * 0.3;

  const reasons: RiskReason[] = [];
  if (bottleneckFrequency >= 0.3 && totalConceptCount > 0) {
    reasons.push({
      text: `${weakConceptCount} of ${totalConceptCount} concepts flagged weak`,
      tooltip:
        "A 'weak' concept is one the Profiler has logged as a bottleneck or repeated misconception. Counted across the student's full knowledge graph for this course.",
    });
  }
  if (sessionLengthTrend >= 0.3) {
    reasons.push({
      text:
        totalSessions === 0
          ? "No sessions recorded yet"
          : `Low engagement: ${totalSessions} session${totalSessions === 1 ? "" : "s"} total`,
      tooltip:
        "We don't yet log per-session duration, so engagement is proxied as 'sessions opened so far this course' — fewer than ten flags as elevated risk.",
    });
  }
  if (daysSinceLastSession >= 0.3) {
    if (!input.lastActive) {
      reasons.push({
        text: "Never active",
        tooltip:
          "No Mentor sessions on record at all. The recency factor maxes out the dropout signal.",
      });
    } else {
      const days = Math.floor(
        (now - new Date(input.lastActive).getTime()) /
          (24 * 60 * 60 * 1000),
      );
      reasons.push({
        text:
          days <= 0
            ? "Inactive recently"
            : `Last active ${days} day${days === 1 ? "" : "s"} ago`,
        tooltip:
          "Days since the student's most recent Mentor session. Recency is the heaviest single signal in the dropout score — see the Recency factor for the exact weight.",
      });
    }
  }

  return {
    score: Number(score.toFixed(3)),
    band: bandFor(score),
    factors: {
      bottleneckFrequency: Number(bottleneckFrequency.toFixed(3)),
      sessionLengthTrend: Number(sessionLengthTrend.toFixed(3)),
      daysSinceLastSession: Number(daysSinceLastSession.toFixed(3)),
    },
    reasons,
  };
}
