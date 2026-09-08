/**
 * Model-catalog helpers for LLM providers.
 *
 * Resolved in the main process using the configured key. Live fetches degrade
 * to curated defaults on any failure so the UI still works offline.
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

/** Fetch the Gemini model catalog (LLM uses the same generateContent models). */
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