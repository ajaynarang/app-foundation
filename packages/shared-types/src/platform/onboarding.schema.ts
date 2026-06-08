import { z } from 'zod';

export const OnboardingItemSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  complete: z.boolean(),
  statusText: z.string(),
  actionLink: z.string(),
  actionType: z.enum(['link', 'chat', 'sheet', 'console']),
});

export const LoadPathSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  actionLink: z.string(),
  actionType: z.enum(['link', 'sheet', 'dialog', 'console']),
});

export const MilestoneStatusSchema = z.object({
  id: z.string(),
  title: z.string(),
  subtitle: z.string(),
  status: z.enum(['complete', 'in_progress', 'available']),
  unlockMessage: z.string(),
  items: z.array(OnboardingItemSchema),
  loadPaths: z.array(LoadPathSchema).optional(),
});

export const OnboardingStatusResponseSchema = z.object({
  overallProgress: z.number(),
  completedItems: z.number(),
  totalItems: z.number(),
  milestones: z.array(MilestoneStatusSchema),
});

// Inferred types
export type OnboardingItem = z.infer<typeof OnboardingItemSchema>;
export type LoadPath = z.infer<typeof LoadPathSchema>;
export type MilestoneStatus = z.infer<typeof MilestoneStatusSchema>;
export type OnboardingStatusResponse = z.infer<typeof OnboardingStatusResponseSchema>;
