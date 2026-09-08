import type { CorrectionResult } from '@speakright/shared';
import { correctionResultSchema } from '@speakright/shared';
import { DEFAULT_CORRECTION_PROMPT } from '@speakright/shared';

/**
 * Default system prompt for the correction task. Canonical value lives in
 * `@speakright/shared`; re-exported here for backward compatibility.
 */
export const CORRECTION_SYSTEM_PROMPT = DEFAULT_CORRECTION_PROMPT;

/**
 * Shared LLM prompt and schema for the correction task.
 * Used by all LLM providers.
 */

export function buildCorrectionPrompt(transcript: string, context?: string[]): string {
  let prompt = '';

  if (context && context.length > 0) {
    prompt += '## Recent conversation context (for reference only)\n';
    context.forEach((line, i) => {
      prompt += `${i + 1}. "${line}"\n`;
    });
    prompt += '\n';
  }

  prompt += `## Utterance to evaluate\n"${transcript}"\n\n`;
  prompt += 'Respond with the JSON correction result.';

  return prompt;
}

/**
 * Strict-mode JSON schema for the correction result (OpenAI / Groq
 * `json_schema` response_format). Strict mode requires `additionalProperties:
 * false` on every object and every property listed in `required` — Groq rejects
 * schemas that omit these on nested objects (e.g. `issues.items`).
 */
export function buildCorrectionSchema(): Record<string, unknown> {
  return {
    type: 'object',
    additionalProperties: false,
    properties: {
      original: { type: 'string' },
      corrected: { type: 'string' },
      has_correction: { type: 'boolean' },
      confidence: { type: 'number' },
      issues: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            type: { type: 'string' },
            subtype: { type: 'string' },
            original: { type: 'string' },
            correction: { type: 'string' },
            explanation: { type: 'string' },
          },
          required: ['type', 'subtype', 'original', 'correction', 'explanation'],
        },
      },
      better_formation: { type: 'string' },
      severity: { type: 'string' },
    },
    required: ['original', 'corrected', 'has_correction', 'confidence', 'issues', 'better_formation', 'severity'],
  };
}

/** Ready-to-send `response_format` for structured output (OpenAI / Groq). */
export function buildCorrectionResponseFormat(): Record<string, unknown> {
  return {
    type: 'json_schema',
    json_schema: {
      name: 'correction_result',
      strict: true,
      schema: buildCorrectionSchema(),
    },
  };
}

export function parseCorrectionResult(raw: string): CorrectionResult {
  // Strip markdown fences if present
  let cleaned = raw.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
  }

  const parsed = JSON.parse(cleaned);
  if (correctionResultSchema.safeParse(parsed).success) {
    return parsed as CorrectionResult;
  }

  // Tolerant fallback: LLMs commonly drift from the schema (uppercase enums,
  // confidence outside [0,1], malformed issues). Normalize instead of failing.
  const issueList: Array<Record<string, unknown>> = Array.isArray(parsed.issues) ? parsed.issues : [];
  const severity = String(parsed.severity ?? '').toLowerCase();
  const confidence = Math.min(1, Math.max(0, Number(parsed.confidence)));

  const issues: CorrectionResult['issues'] = issueList
      .map((issue): CorrectionResult['issues'][number] | null => {
        if (!issue || typeof issue !== 'object') return null;
        const type = String(issue.type ?? '').toLowerCase();
        const subtype = String(issue.subtype ?? '');
        const original = String(issue.original ?? '');
        const correction = String(issue.correction ?? '');
        const explanation = String(issue.explanation ?? '');
        if (!type && !original && !correction) return null;
        if (!subtype || !original || !correction || !explanation) return null;
        return {
          type: ['grammar', 'structure', 'formation'].includes(type) ? (type as 'grammar' | 'structure' | 'formation') : 'grammar',
          subtype,
          original,
          correction,
          explanation,
        };
      })
      .filter((x): x is CorrectionResult['issues'][number] => x !== null);

  const result: CorrectionResult = {
    original: String(parsed.original ?? ''),
    corrected: String(parsed.corrected ?? ''),
    has_correction: Boolean(parsed.has_correction),
    confidence: Number.isFinite(confidence) ? confidence : 0,
    issues,
    severity: ['low', 'medium', 'high'].includes(severity) ? (severity as 'low' | 'medium' | 'high') : 'medium',
  };

  if (typeof parsed.better_formation === 'string' && parsed.better_formation.length > 0) {
    result.better_formation = parsed.better_formation;
  }
  return result;
}

/**
 * If the LLM returns a correct sentence (has_correction = false),
 * suppress it from the correction pipeline to avoid unnecessary display.
 */
export function shouldDisplayCorrection(result: CorrectionResult): boolean {
  return result.has_correction && result.confidence >= 0.5;
}
