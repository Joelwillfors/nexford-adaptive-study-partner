import { moduleIdFor } from "@/lib/ai/concept-canon";
import { getModuleTitle } from "@/lib/lessons/registry";
import type { RiskBand, RiskFactors, RiskReason } from "@/lib/risk";

export interface WeakConcept {
  concept: string;
  attempts: number;
  evidence: string;
}

export interface ActionStudent {
  userId: string;
  totalSessions: number;
  lastActive: string | null;
  weakConcepts: WeakConcept[];
  profilerNotes: string | null;
}

export interface StudentRiskRow {
  userId: string;
  level: string;
  sessions: number;
  lastActive: string | null;
  conceptCount: number;
  /** Top 3 weak concept tags (by attempts desc) — surfaced as pills in
   *  the collapsed watchlist row so the failure mode is visible at a
   *  glance without the teacher having to expand the row. */
  topWeakConcepts: string[];
  risk: {
    score: number;
    band: RiskBand;
    factors: RiskFactors;
    reasons: RiskReason[];
  };
}

export interface HardEarnedRow {
  userId: string;
  concept: string;
  interventionCost: number;
  lastIntervention?: {
    type: "direct_mode" | "quiz_fail" | "topic_closed";
    at: string;
  };
  attempts: number;
  lastSeen: string;
}

export interface DashboardData {
  courseId: string;
  period: { since: string; until: string };
  summary: {
    totalStudents: number;
    activeRecently: number;
    strong: number;
    moderate: number;
    weak: number;
    atRiskCount: number;
    /** Count of unique (student, concept, day) interventions exported to the
     *  Canvas gradebook in the trailing 7 days for this course. Closes the
     *  loop on the "Send Review / Export to Gradebook" button — the metric
     *  proves the click writes a real row, not just lights a toast. */
    reviewsSent7d: number;
  };
  actionRequired: ActionStudent[];
  sharedMisconceptions: { concept: string; studentCount: number }[];
  allStudents: StudentRiskRow[];
  hardEarnedMastery: HardEarnedRow[];
}

export interface ConceptGroup {
  concept: string;
  students: { userId: string; bottleneck: string; attempts: number }[];
}

export function buildConceptGroups(
  actionRequired: ActionStudent[],
): ConceptGroup[] {
  const map = new Map<string, ConceptGroup>();
  for (const student of actionRequired) {
    for (const wc of student.weakConcepts) {
      const entry = map.get(wc.concept) ?? {
        concept: wc.concept,
        students: [],
      };
      entry.students.push({
        userId: student.userId,
        bottleneck: wc.evidence,
        attempts: wc.attempts,
      });
      map.set(wc.concept, entry);
    }
  }
  return [...map.values()].sort(
    (a, b) => b.students.length - a.students.length,
  );
}

export function formatConcept(slug: string): string {
  return slug.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * A bucket of concept groups that all map to the same lesson module.
 * Used by the teacher dashboard to roll up the flat Struggling Concepts
 * list into collapsible per-module sections, so the page stays scannable
 * as the curriculum grows past one module.
 */
export interface ConceptModuleBucket {
  moduleId: string;
  moduleTitle: string;
  groups: ConceptGroup[];
  /** Sum of `students.length` across every group in the bucket — i.e.
   *  total student-attempt rows feeding this module. */
  totalStuck: number;
}

export function groupConceptsByModule(
  groups: ConceptGroup[],
): ConceptModuleBucket[] {
  const map = new Map<string, ConceptModuleBucket>();
  for (const g of groups) {
    const moduleId = moduleIdFor(g.concept);
    const bucket = map.get(moduleId) ?? {
      moduleId,
      moduleTitle: getModuleTitle(moduleId),
      groups: [],
      totalStuck: 0,
    };
    bucket.groups.push(g);
    bucket.totalStuck += g.students.length;
    map.set(moduleId, bucket);
  }
  return [...map.values()].sort((a, b) => b.totalStuck - a.totalStuck);
}

export function getDominantBottleneck(group: ConceptGroup): string {
  const bottlenecks = group.students
    .map((s) => s.bottleneck)
    .filter((b): b is string => !!b);
  if (bottlenecks.length === 0) return "Multiple reasoning chain failures";
  const first = bottlenecks[0];
  return first.length > 110 ? first.slice(0, 107) + "…" : first;
}
