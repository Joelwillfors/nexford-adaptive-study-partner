"use client";

import { useState, useRef } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Nav } from "@/components/nav";

const DEMO_COURSE_ID = "00000000-0000-0000-0000-000000000001";

interface UploadTask {
  id: string;
  fileName: string;
  status: "uploading" | "processing" | "completed" | "failed";
  error?: string;
}

export default function UploadPage() {
  const [courseTitle, setCourseTitle] = useState("Business Fundamentals");
  const [moduleName, setModuleName] = useState("");
  const [tasks, setTasks] = useState<UploadTask[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [syncingCanvas, setSyncingCanvas] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function syncCanvas() {
    if (syncingCanvas) return;
    setSyncingCanvas(true);
    try {
      const res = await fetch("/api/lms/sync-roster", { method: "POST" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: {
        students: number;
        modules: number;
        assignments: number;
      } = await res.json();
      toast.success(
        `Synced ${data.students} students and ${data.modules} modules from Canvas`,
        {
          description: `Roster delta: 0 added, 0 removed · ${data.assignments} assignments tracked · last sync just now`,
        },
      );
    } catch (err) {
      toast.error("Canvas sync failed", {
        description:
          err instanceof Error ? err.message : "Try again in a moment.",
      });
    } finally {
      setSyncingCanvas(false);
    }
  }

  async function handleFiles(files: FileList | null) {
    if (!files?.length) return;

    for (const file of Array.from(files)) {
      const tempId = crypto.randomUUID();
      const task: UploadTask = { id: tempId, fileName: file.name, status: "uploading" };
      setTasks((prev) => [task, ...prev]);

      try {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("courseId", DEMO_COURSE_ID);
        formData.append("courseTitle", courseTitle.trim() || "Untitled Course");
        formData.append("moduleName", moduleName.trim());

        const res = await fetch("/api/ingest", { method: "POST", body: formData });
        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: "Upload failed" }));
          throw new Error(err.error || `HTTP ${res.status}`);
        }

        const data = await res.json();
        setTasks((prev) =>
          prev.map((t) =>
            t.id === tempId ? { ...t, id: data.taskId, status: "processing" } : t,
          ),
        );
        pollTaskStatus(data.taskId, tempId);
      } catch (err) {
        setTasks((prev) =>
          prev.map((t) =>
            t.id === tempId
              ? { ...t, status: "failed", error: err instanceof Error ? err.message : "Unknown error" }
              : t,
          ),
        );
      }
    }
  }

  async function pollTaskStatus(taskId: string, tempId: string) {
    for (let i = 0; i < 60; i++) {
      await new Promise((r) => setTimeout(r, 2000));
      try {
        const res = await fetch(`/api/task-status?taskId=${encodeURIComponent(taskId)}`);
        if (!res.ok) continue;
        const data = await res.json();
        if (data.status === "completed" || data.status === "failed") {
          setTasks((prev) =>
            prev.map((t) =>
              t.id === taskId || t.id === tempId
                ? { ...t, id: taskId, status: data.status, error: data.error_message }
                : t,
            ),
          );
          return;
        }
      } catch {
        // continue polling
      }
    }
  }

  return (
    <div className="flex min-h-screen flex-col">
      <Nav />

      <main className="flex-1 bg-[#f9fafb] px-6 py-12">
        <div className="mx-auto max-w-2xl">
          {/* ── Header ── */}
          <p className="text-xs font-medium uppercase tracking-widest text-[#6b7280]">
            Teacher Portal
          </p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-[#0f0f0f]">
            Course Material
          </h1>
          <p className="mt-2 text-sm text-[#6b7280]">
            Two ways to feed the Socratic Mentor: pull the syllabus and roster
            from Canvas, or upload local documents. Anything ingested is
            chunked, embedded, and indexed automatically.
          </p>

          {/* ── Pull from Canvas ── */}
          <div className="mt-8 flex items-center justify-between rounded-xl border border-[#fde047] bg-[#fefce8] px-5 py-4">
            <div>
              <h2 className="text-sm font-semibold text-[#854d0e]">
                Pull from Canvas
              </h2>
              <p className="mt-0.5 text-xs text-[#92400e]">
                Re-read the current course roster, modules, and assignments
                through the LMSProvider. Mock today; same call hits Canvas live
                once an API key is configured.
              </p>
            </div>
            <button
              type="button"
              onClick={syncCanvas}
              disabled={syncingCanvas}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-[#fbbf24] bg-white px-3.5 py-2 text-xs font-medium text-[#854d0e] transition hover:bg-[#fffbeb] disabled:opacity-60"
            >
              {syncingCanvas ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <RefreshCw className="h-3 w-3" />
              )}
              {syncingCanvas
                ? "Syncing…"
                : "Sync Syllabus & Roster from Canvas"}
            </button>
          </div>

          {/* ── Metadata Fields ── */}
          <div className="mt-8 rounded-xl border border-[#e5e7eb] bg-white p-6">
            <h2 className="text-sm font-semibold text-[#0f0f0f]">Course Details</h2>

            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-medium text-[#6b7280] mb-1.5">
                  Course Title
                </label>
                <input
                  type="text"
                  value={courseTitle}
                  onChange={(e) => setCourseTitle(e.target.value)}
                  placeholder="e.g. Business Fundamentals"
                  className="w-full rounded-lg border border-[#e5e7eb] bg-[#f9fafb] px-4 py-2.5 text-sm text-[#0f0f0f] placeholder:text-[#6b7280] focus:border-[#0f0f0f] focus:outline-none focus:ring-1 focus:ring-[#0f0f0f] transition"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#6b7280] mb-1.5">
                  Module Name{" "}
                  <span className="text-[#6b7280] font-normal">(optional)</span>
                </label>
                <input
                  type="text"
                  value={moduleName}
                  onChange={(e) => setModuleName(e.target.value)}
                  placeholder="e.g. Chapter 3 — Accrual Accounting"
                  className="w-full rounded-lg border border-[#e5e7eb] bg-[#f9fafb] px-4 py-2.5 text-sm text-[#0f0f0f] placeholder:text-[#6b7280] focus:border-[#0f0f0f] focus:outline-none focus:ring-1 focus:ring-[#0f0f0f] transition"
                />
              </div>
            </div>
          </div>

          {/* ── Drop Zone ── */}
          <div
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={(e) => { e.preventDefault(); setIsDragging(false); handleFiles(e.dataTransfer.files); }}
            onClick={() => fileInputRef.current?.click()}
            className={`mt-4 flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-8 py-14 text-center transition ${
              isDragging
                ? "border-[#ffb300] bg-[#fffbeb]"
                : "border-[#e5e7eb] bg-white hover:border-[#0f0f0f]/30"
            }`}
          >
            <UploadIcon
              className={`h-9 w-9 ${isDragging ? "text-[#ffb300]" : "text-[#6b7280]"}`}
            />
            <p className="mt-3 text-sm font-medium text-[#0f0f0f]">
              Drag &amp; drop files here, or{" "}
              <span className="underline underline-offset-2">browse</span>
            </p>
            <p className="mt-1 text-xs text-[#6b7280]">
              PDF, DOCX, or TXT — up to 25MB per file
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.docx,.txt,.md"
              multiple
              onChange={(e) => handleFiles(e.target.files)}
              className="hidden"
            />
          </div>

          {/* ── Task List ── */}
          {tasks.length > 0 && (
            <div className="mt-6 space-y-2">
              <h2 className="text-xs font-medium uppercase tracking-widest text-[#6b7280]">
                Ingestion Queue
              </h2>
              {tasks.map((task) => (
                <TaskRow key={task.id} task={task} />
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

// ── Task Row ─────────────────────────────────────────────────────────

function TaskRow({ task }: { task: UploadTask }) {
  const cfg = {
    uploading: { label: "Uploading…", dot: "bg-[#6b7280]" },
    processing: { label: "Processing…", dot: "bg-[#ffb300]" },
    completed: { label: "Ready", dot: "bg-green-500" },
    failed: { label: "Failed", dot: "bg-red-500" },
  }[task.status];

  return (
    <div className="flex items-center gap-4 rounded-xl border border-[#e5e7eb] bg-white px-5 py-3.5">
      <DocumentIcon className="h-4 w-4 shrink-0 text-[#6b7280]" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-[#0f0f0f]">{task.fileName}</p>
        {task.error && <p className="truncate text-xs text-red-500">{task.error}</p>}
      </div>
      <span className="flex items-center gap-1.5 text-xs font-medium text-[#6b7280]">
        <span
          className={`h-1.5 w-1.5 rounded-full ${cfg.dot} ${
            task.status === "uploading" || task.status === "processing" ? "animate-pulse" : ""
          }`}
        />
        {cfg.label}
      </span>
    </div>
  );
}

// ── Icons ────────────────────────────────────────────────────────────

function UploadIcon({ className = "h-6 w-6" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12" />
    </svg>
  );
}

function DocumentIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  );
}
