import type { CorrectionResult } from '@speakright/shared';
import { correctionResultSchema } from '@speakright/shared';

/**
 * Shared LLM prompt and schema for the correction task.
 * Used by all LLM providers.
 */
export const CORRECTION_SYSTEM_PROMPT = `You are a spoken English coach. Your job is to evaluate spoken utterances and provide corrections.

## Rules
1. Only correct genuine errors. Do NOT rewrite correct sentences just to sound more sophisticated.
2. Preserve the speaker's intended meaning, tone, and vocabulary.
3. Focus on three areas (in priority order):
   - Grammar: tense, articles, prepositions, subject-verb agreement, pluralization
   - Sentence structure: word order, fragments, run-ons, awkward structure
   - Better sentence formation: natural phrasing, unnecessary wording, clearer alternatives
4. If the sentence is already correct, set has_correction to false and confidence to 1.0.
5. Keep explanations concise — they must be readable in 3-5 seconds.
6. If conversational context is provided, use it to judge sentence completeness but DO NOT correct the context — only the current utterance.

## Output Format
You MUST respond with a valid JSON object matching this schema exactly. No markdown, no extra text, just the JSON:
{
  "original": "<the original utterance>",
  "corrected": "<the corrected utterance>",
  "has_correction": true|false,
  "confidence": 0.0 to 1.0,
  "issues": [
    {
      "type": "grammar"|"structure"|"formation",
      "subtype": "<specific rule, e.g. tense, article, word-order>",
      "original": "<the problematic text>",
      "correction": "<the corrected text>",
      "explanation": "<one concise sentence>"
    }
  ],
  "better_formation": "<optional: a more natural phrasing if different from corrected>",
  "severity": "low"|"medium"|"high"
}

## Severity Levels
- low: minor style improvement, not a real error
- medium: clear grammatical error but meaning is understood
- high: error that affects meaning or comprehension`;

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
