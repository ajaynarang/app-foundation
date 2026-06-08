import { z } from 'zod';

export const DocBundleDocTypeSchema = z.enum(['RATE_CON', 'BOL', 'POD', 'INVOICE']);
export type DocBundleDocType = z.infer<typeof DocBundleDocTypeSchema>;

export const DocBundleDocSchema = z.object({
  type: DocBundleDocTypeSchema,
  label: z.string(),
  available: z.boolean(),
  /** Present when available=true; signed S3 URL or app URL. */
  viewUrl: z.string().nullable().optional(),
  /** Present when available=false; deep link into the load detail sheet docs tab. */
  uploadUrl: z.string().nullable().optional(),
});
export type DocBundleDoc = z.infer<typeof DocBundleDocSchema>;

export const DocBundleInfoSchema = z.object({
  invoiceNumber: z.string(),
  loadId: z.number().int(),
  ready: z.boolean(),
  docs: z.array(DocBundleDocSchema),
  missing: z.array(z.string()),
});
export type DocBundleInfo = z.infer<typeof DocBundleInfoSchema>;
