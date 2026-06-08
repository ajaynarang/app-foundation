/**
 * Seed LangFuse Prompt Management with the current code-level fallback content.
 *
 * Usage:
 *   LANGFUSE_SECRET_KEY=sk-lf-... LANGFUSE_PUBLIC_KEY=pk-lf-... \
 *   npx tsx scripts/seed-langfuse-prompts.ts
 *
 * This creates all persona + utility + skill prompts in LangFuse with the
 * `production` label. Safe to re-run — creates new versions if prompts already exist.
 *
 * Source of truth for prompt content is in `domains/prompting/prompts/`.
 * This script imports from there — never duplicate prompt strings here.
 */
import { Langfuse } from 'langfuse';
import * as fs from 'fs';
import * as path from 'path';
import matter from 'gray-matter';

import { BASE_ASSISTANT, BASE_SUPPORT } from '../src/domains/prompting/prompts/persona/base-prompts';
import { CATEGORIZER_FALLBACK, SKILL_CLASSIFIER_FALLBACK } from '../src/domains/prompting/prompts/fallbacks';

// Desk prompts: registered as in-memory fallbacks on module init, but also
// seeded to LangFuse here so PromptingService.verifyPromptAvailability() stops
// warning at boot and operators can edit them in the LangFuse UI. The starter
// ships only the generic memory-extract default; per-responsibility step
// prompts are seeded by each responsibility as it ships.
import { DESK_MEMORY_EXTRACT_PROMPT } from '../src/domains/desk/core/memory/prompts/memory-extract.prompt';
import { AGENT_SYSTEM_PROMPTS } from '../src/domains/desk/responsibilities/agent-system-prompts';
import { PROMPT_NAMES } from '../src/domains/prompting/prompting.types';

async function seed() {
  const secretKey = process.env.LANGFUSE_SECRET_KEY;
  const publicKey = process.env.LANGFUSE_PUBLIC_KEY;

  if (!secretKey || !publicKey) {
    console.error('Missing LANGFUSE_SECRET_KEY or LANGFUSE_PUBLIC_KEY environment variables');
    process.exit(1);
  }

  const langfuse = new Langfuse({
    secretKey,
    publicKey,
    baseUrl: process.env.LANGFUSE_BASE_URL,
  });

  // Generic chat personas. Names match PROMPT_NAMES.
  const personaPrompts: Record<string, string> = {
    [PROMPT_NAMES.ASSISTANT]: BASE_ASSISTANT,
    [PROMPT_NAMES.SUPPORT]: BASE_SUPPORT,
  };

  const utilityPrompts: Record<string, string> = {
    [PROMPT_NAMES.FEEDBACK_CATEGORIZER]: CATEGORIZER_FALLBACK,
    [PROMPT_NAMES.SKILL_CLASSIFIER]: SKILL_CLASSIFIER_FALLBACK,
  };

  for (const [name, prompt] of Object.entries(personaPrompts)) {
    await langfuse.createPrompt({
      name,
      prompt,
      labels: ['production', 'staging'],
      type: 'text',
    });
    console.log(`Created: ${name}`);
  }

  for (const [name, prompt] of Object.entries(utilityPrompts)) {
    await langfuse.createPrompt({
      name,
      prompt,
      labels: ['production', 'staging'],
      type: 'text',
    });
    console.log(`Created: ${name}`);
  }

  // Desk — memory-extract default + generic agent personas.
  // Per-responsibility step prompts are seeded by each responsibility as it ships.
  const deskPrompts: Record<string, string> = {
    [PROMPT_NAMES.DESK_MEMORY_EXTRACT]: DESK_MEMORY_EXTRACT_PROMPT,
    ...AGENT_SYSTEM_PROMPTS,
  };

  for (const [name, prompt] of Object.entries(deskPrompts)) {
    await langfuse.createPrompt({
      name,
      prompt,
      labels: ['production', 'staging'],
      type: 'text',
    });
    console.log(`Created: ${name}`);
  }

  // Seed skill prompts from local .md files
  const skillDirs = ['domain', 'tasks'];
  const skillsBasePath = path.join(__dirname, '..', 'src', 'platform', 'prompting', 'prompts', 'skills');
  let skillCount = 0;

  for (const subdir of skillDirs) {
    const dirPath = path.join(skillsBasePath, subdir);
    if (!fs.existsSync(dirPath)) continue;
    const files = fs.readdirSync(dirPath).filter((f: string) => f.endsWith('.md'));
    for (const file of files) {
      const raw = fs.readFileSync(path.join(dirPath, file), 'utf-8');
      const { content } = matter(raw);
      const skillId = path.basename(file, '.md');
      const name = `skill-${skillId}`;
      await langfuse.createPrompt({
        name,
        prompt: content.trim(),
        labels: ['production', 'staging'],
        type: 'text',
      });
      skillCount++;
      console.log(`Created: ${name}`);
    }
  }
  console.log(`\nSeeded ${skillCount} skill prompts.`);

  await langfuse.flushAsync();
  console.log('\nAll prompts seeded successfully.');
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
