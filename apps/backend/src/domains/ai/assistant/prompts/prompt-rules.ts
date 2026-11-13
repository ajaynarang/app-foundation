import { AssistantPromptSchema, type AssistantPrompt } from '@app/shared-types';

/** `{{ name }}` placeholders in a template. */
export const PROMPT_PLACEHOLDER = /\{\{\s*(\w+)\s*\}\}/g;

const KEBAB_SLUG = /^[a-z][a-z0-9-]*$/;
const TOOLS_BLOCK = /<tools>([\s\S]*?)<\/tools>/g;

/**
 * Every way a prompt library breaks the authoring rules written in `prompt-registry.data.ts`, one line per breach.
 * Empty means the library is valid. `knownTools` is the set of registered tool names a template may suggest.
 */
export function promptLibraryViolations(
  library: readonly AssistantPrompt[],
  knownTools: ReadonlySet<string>,
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();

  for (const p of library) {
    const at = `prompt "${p.name}"`;
    const parsed = AssistantPromptSchema.safeParse(p);
    if (!parsed.success) {
      out.push(`${at}: does not match AssistantPromptSchema (${parsed.error.issues.map((i) => i.message).join('; ')})`);
      continue;
    }

    if (seen.has(p.name)) out.push(`${at}: name is used twice`);
    seen.add(p.name);
    if (!KEBAB_SLUG.test(p.name)) out.push(`${at}: name is not a kebab-case slug`);

    const declared = new Set<string>();
    for (const a of p.arguments) {
      if (declared.has(a.name)) out.push(`${at}: argument "${a.name}" is declared twice`);
      declared.add(a.name);
      if (/id$/i.test(a.name)) out.push(`${at}: argument "${a.name}" looks like an opaque id; use a human reference`);
      if (!a.description.trim()) out.push(`${at}: argument "${a.name}" has no description`);
      if (a.required && !usedPlaceholders(p.template).includes(a.name)) {
        out.push(`${at}: required argument "${a.name}" is not used in the template`);
      }
    }
    for (const used of usedPlaceholders(p.template)) {
      if (!declared.has(used)) out.push(`${at}: placeholder {{${used}}} has no declared argument`);
    }

    const blocks = [...p.template.matchAll(TOOLS_BLOCK)].map((m) => m[1]);
    const opens = (p.template.match(/<tools>/g) ?? []).length;
    const closes = (p.template.match(/<\/tools>/g) ?? []).length;
    if (p.suggestedTools.length === 0) {
      if (opens > 0 || closes > 0) out.push(`${at}: has a <tools> block but no suggestedTools`);
    } else {
      if (opens !== 1 || closes !== 1 || blocks.length !== 1) {
        out.push(`${at}: needs exactly one balanced <tools>...</tools> block`);
      }
      const block = blocks[0] ?? '';
      const outside = p.template.replace(TOOLS_BLOCK, '');
      for (const tool of p.suggestedTools) {
        if (!knownTools.has(tool)) out.push(`${at}: suggests "${tool}", which is not a registered tool`);
        if (!block.includes(tool)) out.push(`${at}: suggested tool "${tool}" is not named inside the <tools> block`);
        if (outside.includes(tool)) out.push(`${at}: tool "${tool}" is named outside the <tools> block`);
      }
    }
  }
  return out;
}

function usedPlaceholders(template: string): string[] {
  return [...template.matchAll(PROMPT_PLACEHOLDER)].map((m) => m[1]);
}
