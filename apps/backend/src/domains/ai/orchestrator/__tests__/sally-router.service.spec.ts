// Mock ESM dependencies pulled in via skill-loader → langfuse-prompt → langfuse
jest.mock('langfuse-core', () => ({}));
jest.mock('langfuse', () => ({ Langfuse: jest.fn() }));

import { SallyRouterService } from '../sally-router.service';

describe('SallyRouterService', () => {
  let service: SallyRouterService;
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

    service = new SallyRouterService(skillLoader, classifier);
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

    it('should skip skills without primaryAgent', async () => {
      const result = await service.route('something unrelated', 'member');
      // Should fall through to classifier since no primaryAgent on the matching skill
      expect(result.source).toBe('classifier');
    });

    it('should use classifier for multi-domain personas', async () => {
      const result = await service.route('show me the latest', 'member');
      expect(result.source).toBe('classifier');
      expect(result.agentId).toBe('assistant');
      expect(classifier.classify).toHaveBeenCalledWith('show me the latest');
    });

    it('should load task skill content from classifier result', async () => {
      classifier.classify.mockResolvedValue({
        agentId: 'assistant',
        taskSkill: 'example-skill',
      });
      const result = await service.route('help me out', 'member');
      expect(result.taskSkillContent).toBe('skill content here');
    });

    it('defaultAgentFor returns the generic assistant agent', () => {
      expect(service.defaultAgentFor('member')).toBe('assistant');
      expect(service.defaultAgentFor('unknown-persona')).toBe('assistant');
    });
  });
});
