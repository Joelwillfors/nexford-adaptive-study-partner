/**
 * Parts progress — sessionStorage-backed shared state for the strict
 * pass-to-unlock pagination flow.
 *
 * Two surfaces need to know which parts of a lesson are unlocked /
 * passed: the LessonReader (drives what's rendered + the per-part CTA)
 * and the LmsShell sidebar (renders the locked/active/passed dot per
 * Part). Wiring them through React context would require lifting state
 * above the shell, which means a server-component refactor. For a
 * client-only piece of demo state, a tiny sessionStorage broker plus a
 * `nx:parts-update` CustomEvent keeps both components in sync without
 * any plumbing through the page tree.
 *
 * Persistence is intentionally session-scoped: refreshing the tab
 * resets progress to "Part 1 only" so the demo is repeatable. Move to
 * localStorage if we ever want resume across sessions.
 */

export interface PartsProgress {
  /** 1-indexed count of how many parts are visible. Always >= 1. */
  unlockedParts: number;
  /** Concept tags of parts whose checkpoint quiz the student has passed. */
  partsPassed: string[];
}

export interface PartsUpdateDetail extends PartsProgress {
  lessonId: string;
}

const KEY_PREFIX = "nx.parts.";
const EVENT_NAME = "nx:parts-update";

const DEFAULT_STATE: PartsProgress = { unlockedParts: 1, partsPassed: [] };

export function readPartsProgress(lessonId: string): PartsProgress {
  if (typeof window === "undefined") return { ...DEFAULT_STATE };
  try {
    const raw = window.sessionStorage.getItem(KEY_PREFIX + lessonId);
    if (!raw) return { ...DEFAULT_STATE };
    const parsed = JSON.parse(raw) as Partial<PartsProgress>;
    return {
      unlockedParts:
        typeof parsed.unlockedParts === "number" && parsed.unlockedParts >= 1
          ? parsed.unlockedParts
          : 1,
      partsPassed: Array.isArray(parsed.partsPassed)
        ? parsed.partsPassed.filter((s): s is string => typeof s === "string")
        : [],
    };
  } catch {
    return { ...DEFAULT_STATE };
  }
}

export function writePartsProgress(
  lessonId: string,
  state: PartsProgress,
): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(
      KEY_PREFIX + lessonId,
      JSON.stringify(state),
    );
  } catch {
    // sessionStorage can fail in private mode; the event still fires
    // so live components stay in sync within the tab.
  }
  const detail: PartsUpdateDetail = { lessonId, ...state };
  window.dispatchEvent(new CustomEvent<PartsUpdateDetail>(EVENT_NAME, { detail }));
}

export const PARTS_UPDATE_EVENT = EVENT_NAME;
