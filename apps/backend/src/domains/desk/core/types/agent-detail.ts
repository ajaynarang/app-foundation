import { z } from 'zod';
import { AgentKeySchema, LifecycleSchema, TrustLevelSchema } from './enums';

/**
 * DeskAgent wire shapes — roster + detail + update.
 */

// ─── Supervisor (tenant user) ───────────────────────────────────────────────

export const AgentSupervisorSchema = z.object({
  id: z.number().int().positive(),
  firstName: z.string(),
  lastName: z.string(),
  role: z.string(), // Prisma UserRole — narrow on backend join
});
export type AgentSupervisor = z.infer<typeof AgentSupervisorSchema>;

// ─── Responsibility held (joined for agent detail) ──────────────────────────

export const ResponsibilityHeldSchema = z.object({
  key: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  trustLevel: TrustLevelSchema,
  lifecycle: LifecycleSchema,
  enabled: z.boolean(),
});
export type ResponsibilityHeld = z.infer<typeof ResponsibilityHeldSchema>;

// ─── Crew-tab roster item — one per DeskAgent ───────────────────────────────

export const AgentRosterItemSchema = z.object({
  key: AgentKeySchema,
  name: z.string(),
  description: z.string().nullable(),
  isActive: z.boolean(),
  availableResponsibilityCount: z.number().int().min(0),
  comingSoonResponsibilityCount: z.number().int().min(0),
  openEpisodeCount: z.number().int().min(0),
  pendingApprovalCount: z.number().int().min(0),
  lastRunAt: z.string().datetime().nullable(),
  supervisor: AgentSupervisorSchema.nullable(),
});
export type AgentRosterItem = z.infer<typeof AgentRosterItemSchema>;

// ─── Full agent detail ──────────────────────────────────────────────────────

export const AgentDetailSchema = z.object({
  key: AgentKeySchema,
  name: z.string(),
  description: z.string().nullable(),
  isActive: z.boolean(),
  supervisor: AgentSupervisorSchema.nullable(),
  responsibilities: z.array(ResponsibilityHeldSchema),
});
export type AgentDetail = z.infer<typeof AgentDetailSchema>;

// ─── Windowed activity stats ─────────────────────────────────────────────────

export const AGENT_ACTIVITY_WINDOWS = ['24h', '7d', '30d'] as const;
export const AgentActivityWindowSchema = z.enum(AGENT_ACTIVITY_WINDOWS);
export type AgentActivityWindow = z.infer<typeof AgentActivityWindowSchema>;

export const AgentActivityStatsSchema = z.object({
  episodeCount: z.number().int().min(0),
  toolCallCount: z.number().int().min(0),
  approvalCount: z.number().int().min(0),
  lastActivityAt: z.string().datetime().nullable(),
  windowStart: z.string().datetime(),
  windowEnd: z.string().datetime(),
});
export type AgentActivityStats = z.infer<typeof AgentActivityStatsSchema>;

// ─── PATCH /desk/agents/:key — agent-level update ───────────────────────────

export const UpdateAgentRequestSchema = z
  .object({
    enabled: z.boolean().optional(),
    supervisorUserId: z.number().int().positive().nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: 'At least one field required',
  });
export type UpdateAgentRequest = z.infer<typeof UpdateAgentRequestSchema>;

// ─── Eligible supervisors ────────────────────────────────────────────────────

export const EligibleSupervisorSchema = z.object({
  id: z.number().int().positive(),
  firstName: z.string(),
  lastName: z.string(),
  role: z.string(),
});
export type EligibleSupervisor = z.infer<typeof EligibleSupervisorSchema>;
