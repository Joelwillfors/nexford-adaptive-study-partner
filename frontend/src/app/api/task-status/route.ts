import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/clients";

export async function GET(request: NextRequest) {
  const taskId = request.nextUrl.searchParams.get("taskId");
  if (!taskId) {
    return NextResponse.json({ error: "Missing taskId" }, { status: 400 });
  }

  try {
    const sb = createServiceClient();
    const { data, error } = await sb
      .from("grading_tasks")
      .select("id, status, result, error_message, updated_at")
      .eq("id", taskId)
      .single();

    if (error || !data) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
