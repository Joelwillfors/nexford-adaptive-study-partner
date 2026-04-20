import { NextResponse } from "next/server";
import { z } from "zod";
import { lmsProvider } from "@/lib/lms";

/**
 * POST /api/teacher/gradebook-export
 *
 * Idempotent: re-clicking on the same student/concept/day returns the
 * existing row. The response distinguishes "created" vs "already_sent_today"
 * so the toast can say something honest instead of pretending every click
 * was a fresh write.
 */
const BodySchema = z.object({
  studentId: z.string().min(1),
  conceptTag: z.string().min(1),
  interventionKind: z
    .enum(["review_nudge", "remediation_module", "direct_message"])
    .optional(),
  exportedBy: z.string().optional(),
  payload: z.record(z.string(), z.unknown()).optional(),
});

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payload", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  try {
    const result = await lmsProvider.exportToGradebook(parsed.data);
    return NextResponse.json(result, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET() {
  try {
    const health = await lmsProvider.getHealth();
    return NextResponse.json(health, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
