// Mock ESM dependencies pulled in via skill-loader → langfuse-prompt → langfuse
jest.mock('langfuse-core', () => ({}));
jest.mock('langfuse', () => ({ Langfuse: jest.fn() }));

import { AssistantRouterService } from '../assistant-router.service';

describe('AssistantRouterService', () => {
  let service: AssistantRouterService;
  let skillLoader: any;
  let classifier: any;

  beforeEach(() => {
    skillLoader = {
      getAllTaskSkills: jest.fn().mockReturnValue([
        {
          metadata: {
            name: 'example-skill',
            primaryAgent: 'assistant',
            triggers: ['do.*thing', 'example task'],
          },
        },
        {
          metadata: {
            name: 'no-agent-skill',
            primaryAgent: null,
            triggers: ['something'],
          },
        },
      ]),
      getSkill: jest.fn().mockResolvedValue('skill content here'),
    };

    classifier = {
      classify: jest.fn().mockResolvedValue({ agentId: 'assistant', taskSkill: null }),
    };

    service = new AssistantRouterService(skillLoader, classifier);
  });

  describe('route', () => {
    it('should match regex trigger and return regex source', async () => {
      const result = await service.route('do the thing now', 'member');
      expect(result.source).toBe('regex');
      expect(result.agentId).toBe('assistant');
      expect(result.taskSkill).toBe('example-skill');
      expect(result.taskSkillContent).toBe('skill content here');
    });

    it('should match plain text trigger (case insensitive)', async () => {
      const result = await service.route('Run Example Task now', 'member');
      expect(result.source).toBe('regex');
      expect(result.agentId).toBe('assistant');
      expect(result.taskSkill).toBe('example-skill');
    });

    it('should skip skills without primaryAgent and fall through to the default agent', async () => {
      const result = await service.route('something unrelated', 'member');
      // No primaryAgent on the matching skill → no regex route. Starter
      // personas are single-domain, so the classifier is skipped entirely.
      expect(result.source).toBe('default');
      expect(result.agentId).toBe('assistant');
    });

    it('should short-circuit starter personas to the default agent without classifying', async () => {
      for (const persona of ['member', 'admin', 'owner', 'super_admin'] as const) {
        const result = await service.route('show me the latest', persona);
        expect(result.source).toBe('default');
        expect(result.agentId).toBe('assistant');
      }
      expect(classifier.classify).not.toHaveBeenCalled();
    });

    it('should use classifier for personas outside the single-domain list (multi-agent extension point)', async () => {
      const result = await service.route('show me the latest', 'custom-persona' as any);
      expect(result.source).toBe('classifier');
      expect(result.agentId).toBe('assistant');
      expect(classifier.classify).toHaveBeenCalledWith('show me the latest');
    });

    it('should load task skill content from classifier result', async () => {
      classifier.classify.mockResolvedValue({
        agentId: 'assistant',
        taskSkill: 'example-skill',
      });
      const result = await service.route('help me out', 'custom-persona' as any);
      expect(result.taskSkillContent).toBe('skill content here');
    });

    it('defaultAgentFor returns the generic assistant agent', () => {
      expect(service.defaultAgentFor('member')).toBe('assistant');
      expect(service.defaultAgentFor('unknown-persona')).toBe('assistant');
    });
  });
});
