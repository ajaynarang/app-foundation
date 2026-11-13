import type { AssistantPrompt } from '@app/shared-types';

/**
 * The prompt library: curated, parameterised prompt templates served to external MCP clients through `prompts/list`
 * and `prompts/get`, filtered by the caller's role in the workspace. It ships EMPTY: add your product's prompts here.
 *
 * Authoring rules (held by `prompt-rules.ts` and `__tests__/prompt-registry.data.spec.ts`, which bind the first prompt
 * you add):
 * - Names are stable kebab-case slugs. They are the MCP prompt name; renaming one breaks a client that saved it.
 * - Templates are portable natural language. They may name the tools the model should reach for, but never say how
 *   to call them: the model resolves tool names against its own registry.
 * - Tools a template names go in `suggestedTools` and inside one `<tools>...</tools>` block, and nowhere else in the
 *   template. Every name is a registered tool (`ToolNames`). The tags are stripped when the prompt is rendered.
 * - Arguments are human references (a ticket subject, a person's name), never opaque ids. Each has a description.
 * - Every `{{placeholder}}` has a declared argument; every required argument appears in the template.
 * - Optional arguments degrade: the template reads correctly when the slot resolves empty.
 * - `roles` lists the workspace roles that may see the prompt. A prompt is a suggestion, not a permission: every tool
 *   it leads to still runs through the tool pipeline (scope, role, plan, confirmation).
 *
 * Example entry:
 *
 *   {
 *     name: 'open-support-tickets',
 *     title: 'Open support tickets',
 *     description: 'What is still waiting on support in this workspace',
 *     category: 'Support',
 *     arguments: [{ name: 'topic', description: 'Only tickets about this, e.g. "billing"', required: false }],
 *     template:
 *       'List the open support tickets in this workspace about {{topic}} (all of them if no topic is given). ' +
 *       '<tools>Use list-support-tickets.</tools> Lead with the oldest.',
 *     roles: ['OWNER', 'ADMIN', 'MEMBER'],
 *     suggestedTools: ['list-support-tickets'],
 *   }
 */
export const PROMPT_LIBRARY: readonly AssistantPrompt[] = [];
