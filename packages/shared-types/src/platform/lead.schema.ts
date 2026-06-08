import { z } from 'zod';

/**
 * Marketing-lead lifecycle. Persisted to Lead.status as String @db.VarChar.
 * Currently set on insert by the AI lead-capture MCP tool; UI transitions
 * (CONTACTED, QUALIFIED, etc.) are TODO and may extend this enum.
 */
export const LeadStatusSchema = z.enum(['NEW', 'CONTACTED', 'QUALIFIED', 'CONVERTED', 'DECLINED']);
export type LeadStatus = z.infer<typeof LeadStatusSchema>;
