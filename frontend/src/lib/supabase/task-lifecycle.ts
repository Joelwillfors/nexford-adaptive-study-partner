/**
 * Task lifecycle helpers — direct port of AlphaDesk's scrapeTaskLifecycle.js.
 *
 * Same contract: claim with worker ID (atomic), then mark completed or failed.
 * The service-role client bypasses RLS so only server workers call these.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

const TABLE = "grading_tasks";

/**
 * Atomically claim a pending task. Returns true if this worker won the race.
 */
export async function claimTask(
  sb: SupabaseClient,
  taskId: string,
  workerId: string,
): Promise<boolean> {
  const { data, error } = await sb
    .from(TABLE)
    .update({
      status: "processing",
      claimed_by: workerId,
      claimed_at: new Date().toISOString(),
    })
    .eq("id", taskId)
    .eq("status", "pending")
    .select("id")
    .maybeSingle();

  if (error) {
    console.error("[TaskLifecycle] claimTask error:", error.message);
    return false;
  }
  return data !== null;
}

/**
 * Mark a task as completed with an optional result payload.
 */
export async function markCompleted(
  sb: SupabaseClient,
  taskId: string,
  result?: Record<string, unknown>,
): Promise<void> {
  const { error } = await sb
    .from(TABLE)
    .update({ status: "completed", result: result ?? null })
    .eq("id", taskId);

  if (error) {
    console.error("[TaskLifecycle] markCompleted error:", error.message);
  }
}

/**
 * Mark a task as failed with an error message.
 */
export async function markFailed(
  sb: SupabaseClient,
  taskId: string,
  errorMessage: string,
): Promise<void> {
  const { error } = await sb
    .from(TABLE)
    .update({ status: "failed", error_message: errorMessage })
    .eq("id", taskId);

  if (error) {
    console.error("[TaskLifecycle] markFailed error:", error.message);
  }
}

/**
 * Insert a new task into the queue. Returns the task ID.
 */
export async function enqueueTask(
  sb: SupabaseClient,
  taskType: "document_ingestion" | "profiler_run" | "digest_generation",
  payload: Record<string, unknown>,
): Promise<string> {
  const { data, error } = await sb
    .from(TABLE)
    .insert({ task_type: taskType, payload })
    .select("id")
    .single();

  if (error || !data) {
    throw new Error(`Failed to enqueue task: ${error?.message ?? "no data"}`);
  }
  return data.id;
}
