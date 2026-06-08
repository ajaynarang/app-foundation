import { z } from 'zod';

export const ShieldAIResponseSchema = z.object({
  summary: z
    .string()
    .max(1000)
    .describe('Executive summary of fleet compliance status in 2-3 sentences, max 1000 characters'),
  findings: z
    .array(
      z.object({
        category: z.enum(['HOS', 'DRIVERS', 'VEHICLES', 'LOADS']),
        severity: z.enum(['CRITICAL', 'WARNING', 'INFO']),
        title: z.string().max(200).describe('Short finding title, max 200 characters'),
        description: z.string().max(1000).describe('Concise description of the compliance issue, max 1000 characters'),
        regulation: z.string().optional().describe('FMCSA regulation citation, e.g. "49 CFR § 391.45"'),
        impact: z.string().max(500).optional().describe('Business/safety impact if not addressed, max 500 characters'),
        recommendation: z.string().max(500).describe('Specific action to take, max 500 characters'),
        entityType: z.string().optional().describe('Entity type: driver, vehicle, or load'),
        entityId: z.string().optional().describe('Entity identifier'),
        entityName: z.string().optional().describe('Human-readable entity name'),
        isCustomRuleMatch: z.boolean().optional().describe('True if this finding matches a custom rule'),
        sourceRule: z.string().optional().describe('The custom rule text that triggered this finding'),
      }),
    )
    .max(15)
    .describe(
      'Compliance findings not already caught by the rule engine. Maximum 15 findings, focus on the most impactful.',
    ),
  insights: z
    .array(
      z.object({
        title: z.string().describe('Cross-entity insight title'),
        description: z.string().max(500).describe('Cross-entity insight explanation, max 500 characters'),
      }),
    )
    .max(5)
    .describe('Cross-entity insights that require looking across categories'),
  priorityActions: z
    .array(
      z.object({
        priority: z.number().min(1).max(3),
        action: z.string().max(300).describe('Concrete next step, max 300 characters'),
        dueDate: z.string().optional().describe('Suggested deadline if time-sensitive'),
      }),
    )
    .max(3)
    .describe('Top 3 priority actions ranked by urgency'),
  skippedRules: z
    .array(
      z.object({
        rule: z.string().describe('The original custom rule text that was skipped'),
        reason: z.string().describe('Brief explanation why this rule could not be evaluated'),
      }),
    )
    .optional()
    .describe('Custom rules that could not be evaluated — nonsensical, ambiguous, or unrelated to fleet compliance'),
});

export type ShieldAIResponse = z.infer<typeof ShieldAIResponseSchema>;
