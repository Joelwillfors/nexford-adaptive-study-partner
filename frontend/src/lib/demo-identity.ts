/**
 * Demo identity — stable UUIDs for the canonical demo student (Sara Patel),
 * plus a helper that generates a per-tab chat session id in the browser.
 *
 * In production these come from an auth provider. For the demo we hardcode
 * them so the Profiler + Teacher Dashboard show coherent cross-session data.
 */

export const DEMO_COURSE_ID = "00000000-0000-0000-0000-000000000001";

export const DEMO_STUDENT = {
  id: "11111111-1111-1111-1111-111111111111",
  name: "Sara Patel",
  email: "sara.patel@demo.nexford.org",
} as const;

const SESSION_KEY = "nx.sessionId";

export function getOrCreateSessionId(): string {
  if (typeof window === "undefined") return "";
  const existing = window.sessionStorage.getItem(SESSION_KEY);
  if (existing) return existing;
  const next = crypto.randomUUID();
  window.sessionStorage.setItem(SESSION_KEY, next);
  return next;
}

/**
 * Rotate the chat session id. Old chat_logs rows for the previous session
 * stay in the database (useful as Profiler training signal) but the new
 * sessionId means the backend stops loading them, giving the LLM a clean
 * history window.
 */
export function resetSessionId(): string {
  if (typeof window === "undefined") return "";
  const next = crypto.randomUUID();
  window.sessionStorage.setItem(SESSION_KEY, next);
  return next;
}
