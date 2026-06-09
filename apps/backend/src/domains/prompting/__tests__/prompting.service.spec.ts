jest.mock('langfuse', () => ({
  Langfuse: jest.fn().mockImplementation(() => ({
    getPrompt: jest.fn(),
  })),
}));
jest.mock('fs', () => ({
  existsSync: jest.fn().mockReturnValue(false),
  readdirSync: jest.fn().mockReturnValue([]),
  readFileSync: jest.fn().mockReturnValue(''),
}));
jest.mock('gray-matter', () => jest.fn().mockReturnValue({ data: {}, content: 'skill content' }));
jest.mock('@mastra/core', () => ({}));
jest.mock('@mastra/core/agent', () => ({}));
jest.mock('@mastra/pg', () => ({ PostgresStore: jest.fn() }));
jest.mock('@mastra/memory', () => ({ Memory: jest.fn() }));
jest.mock('@mastra/observability', () => ({ Observability: jest.fn() }));
jest.mock('@mastra/langfuse', () => ({ LangfuseExporter: jest.fn() }));

import * as fs from 'fs';
import matter from 'gray-matter';

import { PromptingService } from '../prompting.service';

describe('PromptingService', () => {
  let service: PromptingService;
  let mockConfig: any;
  let mockCache: any;

  beforeEach(() => {
    mockConfig = {
      get: jest.fn((key: string, defaultVal?: string) => {
        if (key === 'PROMPT_LABEL') return defaultVal ?? 'production';
        return undefined;
      }),
    };
    mockCache = {
      getOrSet: jest.fn((_key: string, factory: () => Promise<string>) => factory()),
    };
    jest.mocked(fs.existsSync).mockReturnValue(false);
    jest.mocked(fs.readdirSync).mockReturnValue([]);

    service = new PromptingService(mockConfig, mockCache);
  });

  describe('named prompts (no LangFuse)', () => {
    it('returns registered fallback', async () => {
      service.registerFallback('assistant-dispatcher', 'fallback body');
      expect(await service.getPrompt('assistant-dispatcher')).toBe('fallback body');
    });

    it('returns empty string for unknown prompt name', async () => {
      expect(await service.getPrompt('unknown-name')).toBe('');
    });

    it('compiles {{variable}} placeholders in fallback', async () => {
      service.registerFallback('test-prompt', 'Hello {{name}}!');
      expect(await service.getPrompt('test-prompt', { name: 'World' })).toBe('Hello World!');
    });

    it('getMany() joins resolved prompts with blank lines', async () => {
      service.registerFallback('a', 'A');
      service.registerFallback('b', 'B');
      expect(await service.getMany(['a', 'b'])).toBe('A\n\nB');
    });

    it('isEnabled is false without LangFuse keys', () => {
      expect(service.isEnabled).toBe(false);
    });
  });

  describe('LangFuse integration', () => {
    it('initialises Langfuse when keys are present', async () => {
      const withKeys = new PromptingService(
        {
          get: jest.fn((key: string) => {
            const map: Record<string, string> = {
              LANGFUSE_SECRET_KEY: 'sk_test',
              LANGFUSE_PUBLIC_KEY: 'pk_test',
              LANGFUSE_BASE_URL: 'https://langfuse.test',
              PROMPT_LABEL: 'production',
            };
            return map[key];
          }),
        } as any,
        mockCache,
      );
      try {
        await withKeys.onModuleInit();
      } catch {
        /* verification path may throw against the bare mock */
      }
      expect(withKeys.isEnabled).toBe(true);
    });

    it('falls back when LangFuse fetch fails', async () => {
      const withKeys = new PromptingService(
        {
          get: jest.fn((key: string) => {
            const map: Record<string, string> = {
              LANGFUSE_SECRET_KEY: 'sk_test',
              LANGFUSE_PUBLIC_KEY: 'pk_test',
              LANGFUSE_BASE_URL: 'https://langfuse.test',
              PROMPT_LABEL: 'production',
            };
            return map[key];
          }),
        } as any,
        mockCache,
      );
      try {
        await withKeys.onModuleInit();
      } catch {
        /* expected */
      }
      withKeys.registerFallback('assistant-dispatcher', 'hardcoded');
      const result = await withKeys.getPrompt('assistant-dispatcher');
      expect(result).toBeTruthy();
    });
  });

  describe('skills', () => {
    it('returns LangFuse content for getSkill when available', async () => {
      const getPromptSpy = jest.spyOn(service, 'getPrompt').mockResolvedValue('Langfuse skill content');
      expect(await service.getSkill('assign-load')).toBe('Langfuse skill content');
      expect(getPromptSpy).toHaveBeenCalledWith('skill-assign-load');
    });

    it('falls back to local cache when LangFuse miss', async () => {
      jest.mocked(fs.existsSync).mockReturnValue(true);
      jest.mocked(fs.readdirSync).mockReturnValue(['test-skill.md'] as any);
      jest.mocked(fs.readFileSync).mockReturnValue('---\n---\nLocal content');
      jest.mocked(matter as any).mockReturnValue({
        data: {},
        content: 'Local content',
      });

      await service.onModuleInit();
      jest.spyOn(service, 'getPrompt').mockRejectedValue(new Error('LF down'));

      expect(await service.getSkill('test-skill')).toBe('Local content');
    });

    it('returns empty string when skill not found anywhere', async () => {
      jest.spyOn(service, 'getPrompt').mockRejectedValue(new Error('miss'));
      expect(await service.getSkill('nonexistent')).toBe('');
    });

    it('getSkills joins and filters empties', async () => {
      jest.spyOn(service, 'getPrompt').mockResolvedValueOnce('A').mockResolvedValueOnce('');
      expect(await service.getSkills(['a', 'b'])).toBe('A');
    });

    it('getAllTaskSkills returns only task-type entries', async () => {
      jest.mocked(fs.existsSync).mockReturnValue(true);
      jest
        .mocked(fs.readdirSync)
        .mockReturnValueOnce([]) // domain
        .mockReturnValueOnce(['assign-load.md'] as any); // tasks
      jest.mocked(matter as any).mockReturnValue({
        data: { type: 'task', name: 'assign-load' },
        content: 'Task content',
      });
      await service.onModuleInit();
      const tasks = service.getAllTaskSkills();
      expect(tasks.every((s) => s.metadata.type === 'task')).toBe(true);
    });
  });
});
