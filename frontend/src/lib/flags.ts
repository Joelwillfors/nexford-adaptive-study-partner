/**
 * Feature flag allowlist — prevents half-built surfaces from leaking into the demo.
 *
 * Usage: <FlagGate flag="planner"><PlannerPage /></FlagGate>
 */

export const FEATURE_FLAGS = {
  unifiedSurface: true,
  modeSwitching: true,
  inlineQuizzes: true,
  confidenceCalibration: true,
  planner: true,
  journey: true,
  dropoutRisk: true,
  recap: true,
  moduleHealth: true,
  // Tier 3 frustration classifier — adds ~400-600ms on ambiguous turns.
  // Disable if live-demo latency becomes a risk.
  llmClassifier: true,
} as const;

export type FeatureFlag = keyof typeof FEATURE_FLAGS;

export function isEnabled(flag: FeatureFlag): boolean {
  return FEATURE_FLAGS[flag] === true;
}

/**
 * Demo mode — when true, generator endpoints return deterministic fixtures.
 * Read both server-side (process.env) and client-side (NEXT_PUBLIC_).
 */
export const DEMO_MODE =
  process.env.NEXT_PUBLIC_DEMO_MODE === "true" ||
  process.env.DEMO_MODE === "true";
