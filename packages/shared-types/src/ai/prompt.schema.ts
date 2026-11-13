import { z } from 'zod';
import { UserRoleSchema } from '../generated/prisma-enums';

/**
 * One fillable slot in a prompt template. `name` maps to a `{{name}}` placeholder. Values are human references (a
 * ticket subject, a person's name) the model resolves through tools, never opaque ids.
 */
export const AssistantPromptArgumentSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  required: z.boolean().default(false),
});
export type AssistantPromptArgument = z.infer<typeof AssistantPromptArgumentSchema>;

/**
 * A curated, portable prompt template: static parameterised text, no execution logic. Served to external MCP clients
 * through `prompts/list` and `prompts/get`, filtered by the caller's role in the workspace. `suggestedTools` is
 * advisory metadata, never enforced: a tool still runs only through the tool pipeline.
 */
export const AssistantPromptSchema = z.object({
  name: z.string().min(1),
  title: z.string().min(1),
  description: z.string().min(1),
  category: z.string().min(1),
  arguments: z.array(AssistantPromptArgumentSchema).default([]),
  template: z.string().min(1),
  /** Workspace roles that may see and render this prompt. */
  roles: z.array(UserRoleSchema).min(1),
  suggestedTools: z.array(z.string()).default([]),
});
export type AssistantPrompt = z.infer<typeof AssistantPromptSchema>;
