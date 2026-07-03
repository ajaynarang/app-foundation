import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import matter from 'gray-matter';
import { Langfuse } from 'langfuse';
import * as path from 'path';

import { CACHE_TTL_COLD_30M } from '@appshore/kernel/constants/cache.constants';
import { buildKey } from '@appshore/kernel/infrastructure/cache/cache-key.constants';
import { AppCacheService } from '@appshore/platform/infrastructure/cache/app-cache.service';
import { PROMPT_NAMES, ParsedSkill, SkillMetadata } from './prompting.types';

const LANGFUSE_CACHE_TTL_SECONDS = 60;

/**
 * Unified prompt management: LangFuse-first with local code/Markdown fallbacks.
 *
 * Handles three kinds of content:
 * - Named prompts (LangFuse keyed by name, registered fallback string).
 * - Skills (LangFuse keyed `skill-{id}`, local Markdown fallback from prompts/skills/).
 * - Skill metadata parsed from local `.md` frontmatter for routing.
 */
@Injectable()
export class PromptingService implements OnModuleInit {
  private readonly logger = new Logger(PromptingService.name);
  private langfuse: Langfuse | null = null;
  private readonly promptLabel: string;
  private readonly fallbackPrompts: Record<string, string> = {};
  private readonly skillCache = new Map<string, ParsedSkill>();
  private readonly skillsDir: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly cache: AppCacheService,
  ) {
    this.promptLabel = this.configService.get('PROMPT_LABEL', 'production');

    // Resolve local skills directory. In `ts-node`/dev the `src/` layout wins;
    // in bundled/dist environments fall back to a sibling of the compiled service.
    const srcSkillsDir = path.join(process.cwd(), 'src', 'domains', 'prompting', 'prompts', 'skills');
    this.skillsDir = fs.existsSync(srcSkillsDir) ? srcSkillsDir : path.join(__dirname, 'prompts', 'skills');
  }

  async onModuleInit() {
    const secretKey = this.configService.get<string>('LANGFUSE_SECRET_KEY');
    const publicKey = this.configService.get<string>('LANGFUSE_PUBLIC_KEY');
    const baseUrl = this.configService.get<string>('LANGFUSE_BASE_URL');

    if (secretKey && publicKey) {
      this.langfuse = new Langfuse({ secretKey, publicKey, baseUrl });
      this.logger.log(`LangFuse prompt management enabled (label: ${this.promptLabel})`);
      await this.verifyPromptAvailability();
    } else {
      this.logger.warn('LangFuse prompt management disabled — using hardcoded fallbacks');
    }

    await this.preloadLocalSkills();
    this.logger.log(`Loaded ${this.skillCache.size} local skills`);
  }

  // ---------------------------------------------------------------------------
  // Named prompts (LangFuse → code fallback)
  // ---------------------------------------------------------------------------

  /**
   * Fetch a named prompt. LangFuse first (with Redis cache), then registered
   * fallback. Template variables compile the same way in both paths.
   */
  async getPrompt(name: string, variables?: Record<string, string>): Promise<string> {
    return this.cache.getOrSet(
      this.buildCacheKey(name, variables),
      () => this.resolvePrompt(name, variables),
      CACHE_TTL_COLD_30M,
    );
  }

  /** Fetch multiple named prompts, join with blank lines. */
  async getMany(names: string[], variables?: Record<string, string>): Promise<string> {
    const parts = await Promise.all(names.map((n) => this.getPrompt(n, variables)));
    return parts.filter(Boolean).join('\n\n');
  }

  /** Register a code fallback for a named prompt. Called by registrars on init. */
  registerFallback(name: string, content: string): void {
    this.fallbackPrompts[name] = content;
  }

  get isEnabled(): boolean {
    return this.langfuse !== null;
  }

  // ---------------------------------------------------------------------------
  // Skills (LangFuse `skill-{id}` → local Markdown fallback)
  // ---------------------------------------------------------------------------

  /**
   * Load a single skill by id. LangFuse (key `skill-{id}`) wins when available;
   * on miss or error, falls back to the preloaded local Markdown cache.
   */
  async getSkill(skillId: string): Promise<string> {
    try {
      const langfuseContent = await this.getPrompt(`skill-${skillId}`);
      if (langfuseContent) return langfuseContent;
    } catch {
      this.logger.debug(`LangFuse miss for skill-${skillId}, trying local fallback`);
    }

    const cached = this.skillCache.get(skillId);
    if (cached) return cached.content;

    this.logger.warn(`Skill "${skillId}" not found in LangFuse or local files`);
    return '';
  }

  /** Load multiple skills and join with blank lines. Empty/missing skills omitted. */
  async getSkills(skillIds: string[]): Promise<string> {
    const contents = await Promise.all(skillIds.map((id) => this.getSkill(id)));
    return contents.filter(Boolean).join('\n\n');
  }

  getSkillMetadata(skillId: string): SkillMetadata | undefined {
    return this.skillCache.get(skillId)?.metadata;
  }

  /** All locally-parsed skills with type `task` — used by the router for regex triggers. */
  getAllTaskSkills(): ParsedSkill[] {
    return Array.from(this.skillCache.values()).filter((skill) => skill.metadata.type === 'task');
  }

  // ---------------------------------------------------------------------------
  // Internals
  // ---------------------------------------------------------------------------

  private buildCacheKey(name: string, variables?: Record<string, string>): string {
    if (!variables) return buildKey('app:prompt', name);
    const varSuffix = Object.entries(variables)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join('&');
    return buildKey('app:prompt', `${name}:${varSuffix}`);
  }

  private async resolvePrompt(name: string, variables?: Record<string, string>): Promise<string> {
    if (!this.langfuse) return this.compileFallback(name, variables);
    try {
      const prompt = await this.langfuse.getPrompt(name, undefined, {
        label: this.promptLabel,
        cacheTtlSeconds: LANGFUSE_CACHE_TTL_SECONDS,
      });
      return prompt.compile(variables ?? {});
    } catch (error) {
      this.logger.warn(`LangFuse prompt fetch failed for "${name}", using fallback: ${error}`);
      return this.compileFallback(name, variables);
    }
  }

  private compileFallback(name: string, variables?: Record<string, string>): string {
    let text = this.fallbackPrompts[name] ?? '';
    if (variables) {
      for (const [key, value] of Object.entries(variables)) {
        text = text.replaceAll(`{{${key}}}`, value);
      }
    }
    return text;
  }

  /** Parse every `.md` under `prompts/skills/domain` + `prompts/skills/tasks`. */
  // Signature is async to preserve the lifecycle-hook contract; implementation is sync today.
  // eslint-disable-next-line @typescript-eslint/require-await
  private async preloadLocalSkills(): Promise<void> {
    for (const subdir of ['domain', 'tasks'] as const) {
      this.loadSkillDirectory(subdir);
    }
  }

  private loadSkillDirectory(subdir: 'domain' | 'tasks'): void {
    const dirPath = path.join(this.skillsDir, subdir);
    if (!fs.existsSync(dirPath)) {
      this.logger.debug(`Skills subdirectory not found: ${dirPath}`);
      return;
    }
    const files = fs.readdirSync(dirPath).filter((f) => f.endsWith('.md'));
    for (const file of files) {
      this.cacheSkillFile(path.join(dirPath, file), subdir);
    }
  }

  private cacheSkillFile(filePath: string, subdir: 'domain' | 'tasks'): void {
    const file = path.basename(filePath);
    try {
      const { data, content } = matter(fs.readFileSync(filePath, 'utf-8'));
      const skillId = path.basename(file, '.md');
      const metadata: SkillMetadata = {
        name: data.name ?? skillId,
        type: data.type ?? (subdir === 'domain' ? 'domain' : 'task'),
        description: data.description ?? '',
        primaryAgent: data.primaryAgent,
        triggers: data.triggers,
        requiresDomainSkills: data.requiresDomainSkills,
        crossDomainAgents: data.crossDomainAgents,
        maxSteps: data.maxSteps,
      };
      this.skillCache.set(skillId, { metadata, content: content.trim() });
    } catch (error) {
      this.logger.warn(`Failed to parse skill file ${subdir}/${file}: ${error}`);
    }
  }

  /** Startup health check — warns about LangFuse prompts that are missing. */
  private async verifyPromptAvailability() {
    if (!this.langfuse) return;
    const promptNames = Object.values(PROMPT_NAMES);
    const results = await Promise.allSettled(
      promptNames.map((name) => this.langfuse.getPrompt(name, undefined, { label: this.promptLabel })),
    );

    const missing = promptNames.filter((_, i) => results[i].status === 'rejected');

    if (missing.length > 0) {
      this.logger.warn(`LangFuse prompts missing (will use fallback): ${missing.join(', ')}`);
    } else {
      this.logger.log(`All ${promptNames.length} LangFuse prompts verified`);
    }
  }
}
