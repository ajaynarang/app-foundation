import { z } from 'zod';

export const LoadShareLinkSchema = z.object({
  id: z.number().int(),
  loadId: z.number().int(),
  tenantId: z.number().int(),
  token: z.string(),
  recipient: z.string().nullable().optional(),
  expiresAt: z.string().nullable().optional(),
  revokedAt: z.string().nullable().optional(),
  revokedBy: z.number().int().nullable().optional(),
  lastViewedAt: z.string().nullable().optional(),
  viewCount: z.number().int(),
  createdBy: z.number().int(),
  createdAt: z.string(),
});
export type LoadShareLink = z.infer<typeof LoadShareLinkSchema>;

export const IssueLoadShareLinkSchema = z.object({
  expiresAt: z.string().datetime().optional(),
  recipient: z.string().max(200).optional(),
});
export type IssueLoadShareLinkInput = z.infer<typeof IssueLoadShareLinkSchema>;
