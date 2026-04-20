/**
 * POST /api/ingest — Document ingestion endpoint.
 *
 * Accepts a file upload + courseId, inserts a grading_task, and
 * processes the document async (returns 202 immediately).
 *
 * This is the Nexford equivalent of AlphaDesk's POST /snipe:
 * "accept fast, process slow."
 */
import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/clients";
import { enqueueTask, claimTask, markCompleted, markFailed } from "@/lib/supabase/task-lifecycle";
import { runIngestionPipeline } from "@/lib/ai/ingest-pipeline";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const courseId = formData.get("courseId") as string | null;
    const courseTitle = (formData.get("courseTitle") as string | null) ?? "Untitled Course";
    const moduleName = (formData.get("moduleName") as string | null) ?? "";

    if (!file || !courseId) {
      return NextResponse.json(
        { error: "Missing required fields: file, courseId" },
        { status: 400 },
      );
    }

    const sb = createServiceClient();
    const workerId = `ingest-api:${Date.now()}`;
    const fileBuffer = Buffer.from(await file.arrayBuffer());
    const fileName = file.name;

    // Ensure the course row exists (MVP: auto-create if missing)
    await sb
      .from("courses")
      .upsert(
        { id: courseId, title: courseTitle },
        { onConflict: "id", ignoreDuplicates: true },
      );

    // Enqueue the task (visible in grading_tasks for observability)
    const taskId = await enqueueTask(sb, "document_ingestion", {
      courseId,
      fileName,
      fileSize: fileBuffer.length,
      moduleName: moduleName || undefined,
    });

    // Return 202 immediately — same pattern as AlphaDesk's POST /snipe
    const response = NextResponse.json(
      { taskId, status: "accepted", message: `Processing "${fileName}"...` },
      { status: 202 },
    );

    // Process async after response (fire-and-forget)
    (async () => {
      const claimed = await claimTask(sb, taskId, workerId);
      if (!claimed) return;

      try {
        const result = await runIngestionPipeline(sb, {
          courseId,
          fileName,
          fileBuffer,
          log: (...args: unknown[]) => console.log(`[Ingest:${taskId.slice(0, 8)}]`, ...args),
        });

        await markCompleted(sb, taskId, {
          chunksCreated: result.chunksCreated,
          sourceFile: result.sourceFile,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`[Ingest:${taskId.slice(0, 8)}] Failed:`, message);
        await markFailed(sb, taskId, message);
      }
    })();

    return response;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    console.error("[Ingest] Route error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
