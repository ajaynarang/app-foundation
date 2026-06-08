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

import {
  BASE_DISPATCH,
  BASE_BILLING,
  BASE_COMPLIANCE,
  BASE_SAFETY,
  BASE_ROUTE,
  BASE_PAYROLL,
  BASE_MAINTENANCE,
  BASE_FUEL,
  BASE_DRIVER,
  BASE_CUSTOMER,
  BASE_SUPPORT,
  BASE_PROSPECT,
} from '../src/domains/prompting/prompts/persona/base-prompts';
import {
  ALERT_BRIEFING_FALLBACK,
  CATCH_ME_UP_FALLBACK,
  CATEGORIZER_FALLBACK,
  FUEL_RECEIPT_EXTRACTION_FALLBACK,
  LOAD_BOARD_SEARCH_PARSER_FALLBACK,
  RATECON_EXTRACTION_FALLBACK,
  SHIELD_ANALYST_FALLBACK,
  SKILL_CLASSIFIER_FALLBACK,
} from '../src/domains/prompting/prompts/fallbacks';

// Desk (v3) prompts: registered as in-memory fallbacks on module init, but
// also seeded to LangFuse here so PromptingService.verifyPromptAvailability()
// stops warning at boot and operators can edit them in the LangFuse UI.
import { AR_FOLLOWUP_PERCEIVE_PROMPT } from '../src/domains/desk/responsibilities/ar-followup/prompts/perceive.prompt';
import { AR_FOLLOWUP_DECIDE_PROMPT } from '../src/domains/desk/responsibilities/ar-followup/prompts/decide.prompt';
import { AR_FOLLOWUP_DRAFT_PROMPT } from '../src/domains/desk/responsibilities/ar-followup/prompts/draft.prompt';
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

  const personaPrompts: Record<string, string> = {
    dispatcher: BASE_DISPATCH,
    billing: BASE_BILLING,
    compliance: BASE_COMPLIANCE,
    safety: BASE_SAFETY,
    route: BASE_ROUTE,
    payroll: BASE_PAYROLL,
    maintenance: BASE_MAINTENANCE,
    fuel: BASE_FUEL,
    driver: BASE_DRIVER,
    customer: BASE_CUSTOMER,
    support: BASE_SUPPORT,
    prospect: BASE_PROSPECT,
    owner: BASE_DISPATCH,
    admin: BASE_DISPATCH,
    super_admin: BASE_DISPATCH,
  };

  const utilityPrompts: Record<string, string> = {
    'sally-ratecon-parser': RATECON_EXTRACTION_FALLBACK,
    'sally-shield-analyst': SHIELD_ANALYST_FALLBACK,
    'sally-alert-briefing': ALERT_BRIEFING_FALLBACK,
    'sally-briefing': CATCH_ME_UP_FALLBACK,
    'sally-fuel-receipt-parser': FUEL_RECEIPT_EXTRACTION_FALLBACK,
    'sally-feedback-categorizer': CATEGORIZER_FALLBACK,
    'sally-skill-classifier': SKILL_CLASSIFIER_FALLBACK,
    'sally-load-board-search-parser': LOAD_BOARD_SEARCH_PARSER_FALLBACK,
  };

  for (const [mode, prompt] of Object.entries(personaPrompts)) {
    const name = `sally-${mode}`;
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

  // Desk (v3) — AR Follow-up step prompts + memory-extract default + 12 agent personas.
  // Names match PROMPT_NAMES + AGENT_SYSTEM_PROMPTS keys (desk.agent.<role>.v1).
  const deskPrompts: Record<string, string> = {
    [PROMPT_NAMES.DESK_AR_FOLLOWUP_PERCEIVE]: AR_FOLLOWUP_PERCEIVE_PROMPT,
    [PROMPT_NAMES.DESK_AR_FOLLOWUP_DECIDE]: AR_FOLLOWUP_DECIDE_PROMPT,
    [PROMPT_NAMES.DESK_AR_FOLLOWUP_DRAFT]: AR_FOLLOWUP_DRAFT_PROMPT,
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
