/**
 * Model-catalog helpers for cloud providers.
 *
 * Lists are always resolved *in the main process* (never from the renderer)
 * using the configured API key. Live fetches degrade gracefully: any
 * transport/HTTP/parse failure falls back to the curated defaults so the UI
 * still works offline.
 */

/** Fetch an OpenAI-compatible `/models` catalog (Groq, OpenAI). */
export async function fetchOpenAiLikeModels(
  baseUrl: string,
  apiKey: string,
  predicate: (id: string) => boolean,
  fallback: string[],
): Promise<string[]> {
  if (!apiKey) return fallback;
  try {
    const res = await fetch(`${baseUrl}/models`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!res.ok) return fallback;
    const json = (await res.json()) as { data?: { id: string }[] };
    const ids = (json.data ?? []).map(m => m.id).filter(predicate);
    return ids.length ? [...ids].sort() : fallback;
  } catch {
    return fallback;
  }
}

/** Fetch the Gemini model catalog (STT and LLM use the same generateContent models). */
export async function fetchGeminiModels(apiKey: string, fallback: string[]): Promise<string[]> {
  if (!apiKey) return fallback;
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`,
    );
    if (!res.ok) return fallback;
    const json = (await res.json()) as {
      models?: { name: string; supportedGenerationMethods?: string[] }[];
    };
    const ids = (json.models ?? [])
      .map(m => m.name.replace(/^models\//, ''))
      .filter(id => !id.includes('embedding'));
    return ids.length ? [...ids].sort() : fallback;
  } catch {
    return fallback;
  }
}