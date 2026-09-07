import { z } from 'zod';

export const issueSchema = z.object({
  type: z.enum(['grammar', 'structure', 'formation']),
  subtype: z.string(),
  original: z.string(),
  correction: z.string(),
  explanation: z.string(),
});

export const correctionResultSchema = z.object({
  original: z.string(),
  corrected: z.string(),
  has_correction: z.boolean(),
  confidence: z.number().min(0).max(1),
  issues: z.array(issueSchema),
  better_formation: z.string().optional(),
  severity: z.enum(['low', 'medium', 'high']),
});
