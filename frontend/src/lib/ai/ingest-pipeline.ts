/**
 * Document Ingestion Pipeline — the "Setup" flow from PRODUCT_SPEC.md.
 *
 * Orchestrated sequence (mirrors AlphaDesk's runListingAnalysis):
 *   1. Extract text from uploaded document (PDF → text)
 *   2. Chunk text into overlapping segments
 *   3. Batch-embed all chunks via OpenAI
 *   4. Store chunks + embeddings in document_embeddings
 *
 * Called from the grading_tasks worker after a document_ingestion task
 * is claimed. The task payload contains { courseId, fileName, fileBuffer }.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { chunkText } from "./chunker";
import { embedBatch } from "./embeddings";

// ── Types ───────────────────────────────────────────────────────────

interface IngestionResult {
  chunksCreated: number;
  sourceFile: string;
  courseId: string;
}

type LogFn = (...args: unknown[]) => void;

// ── Stage runner (port of AlphaDesk's runStage pattern) ─────────────

async function runStage<T>(
  name: string,
  fn: () => Promise<T>,
  log: LogFn,
  t0: number,
): Promise<T> {
  log(`start: ${name} (+${Date.now() - t0}ms)`);
  try {
    return await fn();
  } finally {
    log(`done: ${name} (+${Date.now() - t0}ms)`);
  }
}

// ── PDF text extraction ─────────────────────────────────────────────

async function extractTextFromPdf(buffer: Buffer): Promise<string> {
  // Require the inner module directly to bypass index.js's self-test
  // (index.js reads a non-existent test PDF when module.parent is falsy)
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const pdfParse = require("pdf-parse/lib/pdf-parse.js") as (
    buf: Buffer,
  ) => Promise<{ text: string }>;
  const result = await pdfParse(buffer);
  return result.text;
}

function detectSourceType(fileName: string): string {
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "pdf") return "pdf";
  if (["doc", "docx"].includes(ext)) return "docx";
  if (["txt", "md"].includes(ext)) return "text";
  return "text";
}

// ── Public API ──────────────────────────────────────────────────────

/**
 * Ingest a document into the RAG vector store.
 *
 * Accepts raw file bytes + metadata, runs the full pipeline, returns
 * a summary of what was created.
 */
export async function runIngestionPipeline(
  sb: SupabaseClient,
  opts: {
    courseId: string;
    fileName: string;
    fileBuffer: Buffer;
    log?: LogFn;
  },
): Promise<IngestionResult> {
  const L: LogFn = opts.log ?? ((...args) => console.log("[Ingest]", ...args));
  const t0 = Date.now();
  const sourceType = detectSourceType(opts.fileName);

  // Stage 1: Extract text
  const rawText = await runStage(
    "Text extraction",
    async () => {
      if (sourceType === "pdf") {
        return extractTextFromPdf(opts.fileBuffer);
      }
      return opts.fileBuffer.toString("utf-8");
    },
    L,
    t0,
  );

  if (!rawText.trim()) {
    throw new Error("Document produced no extractable text.");
  }
  L(`Extracted ${rawText.length} characters from ${opts.fileName}`);

  // Stage 2: Chunk
  const chunks = await runStage(
    "Chunking",
    async () => chunkText(rawText),
    L,
    t0,
  );
  L(`Created ${chunks.length} chunks`);

  // Stage 3: Embed (batched)
  const embeddings = await runStage(
    "Embedding",
    async () => embedBatch(chunks.map((c) => c.content)),
    L,
    t0,
  );
  L(`Generated ${embeddings.length} embeddings`);

  // Stage 4: Store in Supabase
  await runStage(
    "Supabase insert",
    async () => {
      const rows = chunks.map((chunk, i) => ({
        course_id: opts.courseId,
        source_file: opts.fileName,
        source_type: sourceType,
        chunk_index: chunk.index,
        content: chunk.content,
        metadata: chunk.metadata,
        embedding: embeddings[i],
      }));

      // Insert in batches of 100 to avoid payload limits
      const BATCH = 100;
      for (let i = 0; i < rows.length; i += BATCH) {
        const batch = rows.slice(i, i + BATCH);
        const { error } = await sb
          .from("document_embeddings")
          .insert(batch);
        if (error) {
          throw new Error(`Supabase insert failed at batch ${i}: ${error.message}`);
        }
      }
    },
    L,
    t0,
  );

  L(`Pipeline complete: ${chunks.length} chunks stored for "${opts.fileName}" (+${Date.now() - t0}ms)`);

  return {
    chunksCreated: chunks.length,
    sourceFile: opts.fileName,
    courseId: opts.courseId,
  };
}
