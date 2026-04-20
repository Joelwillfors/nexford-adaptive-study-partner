/**
 * Recursive character text splitter for RAG ingestion.
 *
 * Splits document text into overlapping chunks suitable for embedding.
 * Target: ~500 tokens per chunk ≈ ~2000 chars for English text.
 */

export interface Chunk {
  content: string;
  index: number;
  metadata: {
    charStart: number;
    charEnd: number;
    pageHint?: number;
  };
}

const DEFAULT_CHUNK_SIZE = 1500;
const DEFAULT_OVERLAP = 200;
const SEPARATORS = ["\n\n", "\n", ". ", " "];

/**
 * Split text into overlapping chunks, preferring natural boundaries.
 */
export function chunkText(
  text: string,
  opts?: { chunkSize?: number; overlap?: number },
): Chunk[] {
  const chunkSize = opts?.chunkSize ?? DEFAULT_CHUNK_SIZE;
  const overlap = opts?.overlap ?? DEFAULT_OVERLAP;
  const cleaned = text.replace(/\r\n/g, "\n").trim();

  if (!cleaned) return [];
  if (cleaned.length <= chunkSize) {
    return [
      {
        content: cleaned,
        index: 0,
        metadata: { charStart: 0, charEnd: cleaned.length },
      },
    ];
  }

  const chunks: Chunk[] = [];
  let start = 0;

  while (start < cleaned.length) {
    let end = Math.min(start + chunkSize, cleaned.length);

    if (end < cleaned.length) {
      const window = cleaned.slice(start, end);
      let bestBreak = -1;

      for (const sep of SEPARATORS) {
        const idx = window.lastIndexOf(sep);
        if (idx > chunkSize * 0.3) {
          bestBreak = idx + sep.length;
          break;
        }
      }

      if (bestBreak > 0) {
        end = start + bestBreak;
      }
    }

    const content = cleaned.slice(start, end).trim();
    if (content.length > 0) {
      chunks.push({
        content,
        index: chunks.length,
        metadata: {
          charStart: start,
          charEnd: end,
          pageHint: guessPageNumber(cleaned, start),
        },
      });
    }

    start = end - overlap;
    if (start >= cleaned.length) break;
    if (end >= cleaned.length) break;
  }

  return chunks;
}

/** Rough page estimate based on form-feed characters or ~3000 chars/page. */
function guessPageNumber(fullText: string, offset: number): number {
  const before = fullText.slice(0, offset);
  const formFeeds = (before.match(/\f/g) ?? []).length;
  if (formFeeds > 0) return formFeeds + 1;
  return Math.floor(offset / 3000) + 1;
}
