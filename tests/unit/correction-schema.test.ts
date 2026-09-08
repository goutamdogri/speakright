import { describe, it, expect } from 'vitest';
import { correctionResultSchema } from '@speakright/shared';
import { parseCorrectionResult, buildCorrectionSchema, buildCorrectionResponseFormat } from '@speakright/correction';

/** Every object node must forbid additional props and require all its properties. */
function assertStrictCompliant(node: unknown): void {
  if (typeof node !== 'object' || node === null) return;
  if (Array.isArray(node)) {
    node.forEach(assertStrictCompliant);
    return;
  }
  const obj = node as Record<string, unknown>;
  if ('properties' in obj) {
    const props = Object.keys(obj.properties as Record<string, unknown>);
    expect(obj.additionalProperties).toBe(false);
    expect(obj.required).toEqual(expect.arrayContaining(props));
  }
  Object.values(obj).forEach(assertStrictCompliant);
}

/**
 * Regression test for the Groq 400: "additionalProperties:false must be set on
 * every object". Strict json_schema mode requires it recursively, incl. nested
 * objects such as issues.items.
 */
describe('correction JSON schema (strict mode)', () => {
  it('is strict-mode compliant at every nesting level', () => {
    expect(() => assertStrictCompliant(buildCorrectionSchema())).not.toThrow();
  });

  it('builds a strict json_schema response_format', () => {
    const fmt = buildCorrectionResponseFormat();
    expect(fmt.type).toBe('json_schema');
    expect((fmt.json_schema as { strict: boolean }).strict).toBe(true);
    expect(() => assertStrictCompliant((fmt.json_schema as { schema: unknown }).schema)).not.toThrow();
  });
});

describe('correctionResultSchema', () => {
  it('accepts a valid correction result', () => {
    const valid = {
      original: 'I have went there yesterday.',
      corrected: 'I went there yesterday.',
      has_correction: true,
      confidence: 0.97,
      issues: [
        {
          type: 'grammar',
          subtype: 'tense',
          original: 'have went',
          correction: 'went',
          explanation: "'Yesterday' refers to a finished past time, so simple past is appropriate.",
        },
      ],
      better_formation: 'I went there yesterday.',
      severity: 'medium',
    };

    const parsed = correctionResultSchema.parse(valid);
    expect(parsed.has_correction).toBe(true);
    expect(parsed.issues.length).toBe(1);
  });

  it('accepts a no-correction result', () => {
    const valid = {
      original: 'I went to the store.',
      corrected: 'I went to the store.',
      has_correction: false,
      confidence: 1.0,
      issues: [],
      severity: 'low',
    };

    const parsed = correctionResultSchema.parse(valid);
    expect(parsed.has_correction).toBe(false);
  });

  it('rejects invalid severity values', () => {
    const invalid = {
      original: 'test',
      corrected: 'test',
      has_correction: true,
      confidence: 0.5,
      issues: [],
      severity: 'critical',
    };

    expect(() => correctionResultSchema.parse(invalid)).toThrow();
  });

  it('rejects confidence out of range', () => {
    const invalid = {
      original: 'test',
      corrected: 'test',
      has_correction: true,
      confidence: 1.7,
      issues: [],
      severity: 'low',
    };

    expect(() => correctionResultSchema.parse(invalid)).toThrow();
  });
});

describe('parseCorrectionResult (tolerant fallback)', () => {
  it('normalizes uppercase severity and invalid issue types', () => {
    const raw = JSON.stringify({
      original: 'I have went there.',
      corrected: 'I went there.',
      has_correction: true,
      confidence: 1.4,
      issues: [
        {
          type: 'grammar',
          subtype: 'tense',
          original: 'have went',
          correction: 'went',
          explanation: 'Simple past is appropriate.',
        },
      ],
      severity: 'MEDIUM',
    });

    const parsed = parseCorrectionResult(raw);
    expect(parsed.severity).toBe('medium');
    expect(parsed.confidence).toBe(1);
    expect(parsed.has_correction).toBe(true);
  });

  it('clamps confidence to [0,1]', () => {
    const raw = JSON.stringify({
      original: 'test',
      corrected: 'test',
      has_correction: false,
      confidence: -0.3,
      issues: [],
      severity: 'low',
    });

    const parsed = parseCorrectionResult(raw);
    expect(parsed.confidence).toBe(0);
  });

  it('drops malformed issues', () => {
    const raw = JSON.stringify({
      original: 'test',
      corrected: 'test',
      has_correction: true,
      confidence: 0.6,
      issues: [
        { type: 'unknown', subtype: '', original: '', correction: '', explanation: '' },
        { type: 'grammar', subtype: 'article', original: 'a apple', correction: 'an apple', explanation: 'An before vowels.' },
      ],
      severity: 'high',
    });

    const parsed = parseCorrectionResult(raw);
    expect(parsed.issues).toHaveLength(1);
    expect(parsed.issues[0].type).toBe('grammar');
  });

  it('defaults invalid severity to medium', () => {
    const raw = JSON.stringify({
      original: 'test',
      corrected: 'test',
      has_correction: false,
      confidence: 1,
      issues: [],
      severity: 'critical',
    });

    const parsed = parseCorrectionResult(raw);
    expect(parsed.severity).toBe('medium');
  });
});