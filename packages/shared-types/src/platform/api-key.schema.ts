import { z } from 'zod';
import { AgentScopeSchema } from '../ai/agent-scopes.schema';

/**
 * CIDR notation: either a bare IPv4 (a.b.c.d) or IPv4/bits (a.b.c.d/0..32).
 * Kept deliberately narrow — IPv6 deferred to Phase D if a customer demands it.
 */
const CIDR_RE = /^\d{1,3}(\.\d{1,3}){3}(\/\d{1,2})?$/;

export const CreateApiKeySchema = z.object({
  name: z.string().min(1).max(255),
  scopes: z.array(AgentScopeSchema).min(1).max(10),
  ipAllowlist: z.array(z.string().regex(CIDR_RE)).max(20).optional().default([]),
  rateLimitPerMinute: z.number().int().min(1).max(6000).optional(),
  expiresAt: z.string().datetime().optional(),
});
export type CreateApiKeyInput = z.infer<typeof CreateApiKeySchema>;

export const ApiKeyResponseSchema = z.object({
  id: z.number().int(),
  key: z.string().optional(),
  name: z.string(),
  scopes: z.array(AgentScopeSchema),
  ipAllowlist: z.array(z.string()),
  rateLimitPerMinute: z.number(),
  isWriteEnabled: z.boolean(),
  requestCount: z.number(),
  lastUsedAt: z.string().nullable(),
  isActive: z.boolean(),
  createdAt: z.string(),
  expiresAt: z.string().nullable(),
});
export type ApiKeyResponse = z.infer<typeof ApiKeyResponseSchema>;
