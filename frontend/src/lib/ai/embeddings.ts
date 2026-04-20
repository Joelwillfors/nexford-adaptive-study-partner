/**
 * OpenAI embedding generation.
 *
 * Uses text-embedding-3-small (1536 dims) — matches the vector(1536)
 * column in document_embeddings.
 */
import OpenAI from "openai";

const MODEL = "text-embedding-3-small";

let _client: OpenAI | null = null;
function getClient(): OpenAI {
  if (!_client) {
    _client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return _client;
}

/**
 * Embed a single text string. Returns a 1536-dimensional float array.
 */
export async function embedText(text: string): Promise<number[]> {
  const res = await getClient().embeddings.create({
    model: MODEL,
    input: text,
  });
  return res.data[0].embedding;
}

/**
 * Embed multiple texts in a single API call (batched).
 * OpenAI supports up to 2048 inputs per request.
 */
export async function embedBatch(
  texts: string[],
): Promise<number[][]> {
  if (texts.length === 0) return [];

  const BATCH_SIZE = 512;
  const results: number[][] = [];

  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE);
    const res = await getClient().embeddings.create({
      model: MODEL,
      input: batch,
    });
    for (const item of res.data) {
      results.push(item.embedding);
    }
  }

  return results;
}
