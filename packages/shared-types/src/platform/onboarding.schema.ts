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

export const OnboardingPathSchema = z.object({
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
  paths: z.array(OnboardingPathSchema).optional(),
});

export const OnboardingStatusResponseSchema = z.object({
  overallProgress: z.number(),
  completedItems: z.number(),
  totalItems: z.number(),
  milestones: z.array(MilestoneStatusSchema),
});

/**
 * Generic onboarding step identifiers. The backend maps each milestone/item to
 * one of these steps; the frontend renders progress against the same vocabulary.
 */
export const OnboardingStepSchema = z.enum(['profile', 'team', 'integrations', 'done']);
export type OnboardingStep = z.infer<typeof OnboardingStepSchema>;

// Inferred types
export type OnboardingItem = z.infer<typeof OnboardingItemSchema>;
export type OnboardingPath = z.infer<typeof OnboardingPathSchema>;
export type MilestoneStatus = z.infer<typeof MilestoneStatusSchema>;
export type OnboardingStatusResponse = z.infer<typeof OnboardingStatusResponseSchema>;
