"use client";

import { useState } from "react";
import { CheckCircle2, Loader2, Send } from "lucide-react";

interface ExportResult {
  id: string;
  status: "created" | "already_sent_today";
  exportedForDay: string;
  provider: string;
}

/**
 * Per-student "Export to Gradebook" action on the concept drill-down.
 * Idempotent on the server: re-clicks on the same student/concept/day
 * resolve to the existing row and the button switches to "Sent today".
 *
 * The visual states here are deliberately three (idle / loading / sent)
 * rather than two — the demo benefits from a brief "Exporting…" beat
 * that proves we hit a real backend.
 */
export function ExportToGradebookButton({
  studentId,
  conceptTag,
}: {
  studentId: string;
  conceptTag: string;
}) {
  const [state, setState] = useState<"idle" | "loading" | "sent" | "error">(
    "idle",
  );
  const [message, setMessage] = useState<string | null>(null);

  async function onClick() {
    if (state === "loading") return;
    setState("loading");
    setMessage(null);
    try {
      const res = await fetch("/api/teacher/gradebook-export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studentId,
          conceptTag,
          interventionKind: "review_nudge",
          exportedBy: "teacher",
          payload: { source: "concept_drill_down" },
        }),
      });
      const body = (await res.json()) as ExportResult | { error?: string };
      if (!res.ok || "error" in body) {
        const errMsg = "error" in body ? body.error : "Unknown error";
        throw new Error(errMsg ?? "Unknown error");
      }
      const result = body as ExportResult;
      setState("sent");
      setMessage(
        result.status === "already_sent_today"
          ? "Already sent today — Canvas row left untouched"
          : "Sent to Canvas Gradebook",
      );
    } catch (err) {
      setState("error");
      setMessage(err instanceof Error ? err.message : "Export failed");
    }
  }

  const disabled = state === "loading";
  const sent = state === "sent";

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
          sent
            ? "border-[#bbf7d0] bg-[#f0fdf4] text-[#166534]"
            : state === "error"
              ? "border-[#fecaca] bg-[#fef2f2] text-[#991b1b] hover:bg-[#fee2e2]"
              : "border-[#0f0f0f] bg-[#0f0f0f] text-white hover:bg-[#1f2937] disabled:opacity-60"
        }`}
      >
        {state === "loading" ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : sent ? (
          <CheckCircle2 className="h-3 w-3" />
        ) : (
          <Send className="h-3 w-3" />
        )}
        {state === "loading"
          ? "Exporting…"
          : sent
            ? "Sent"
            : state === "error"
              ? "Retry export"
              : "Export to Gradebook"}
      </button>
      {message && (
        <p
          className={`text-[10px] ${state === "error" ? "text-[#991b1b]" : "text-[#6b7280]"}`}
        >
          {message}
        </p>
      )}
    </div>
  );
}
