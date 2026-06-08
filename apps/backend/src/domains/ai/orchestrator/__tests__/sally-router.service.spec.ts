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
            name: 'route-planning',
            primaryAgent: 'route',
            triggers: ['plan.*route', 'route planning'],
          },
        },
        {
          metadata: {
            name: 'shield-audit',
            primaryAgent: 'compliance',
            triggers: ['run shield', 'compliance audit'],
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
      classify: jest.fn().mockResolvedValue({ agentId: 'billing', taskSkill: null }),
    };

    service = new SallyRouterService(skillLoader, classifier);
  });

  describe('route', () => {
    it('should match regex trigger and return regex source', async () => {
      const result = await service.route('plan my route to Chicago', 'dispatcher');
      expect(result.source).toBe('regex');
      expect(result.agentId).toBe('route');
      expect(result.taskSkill).toBe('route-planning');
      expect(result.taskSkillContent).toBe('skill content here');
    });

    it('should match plain text trigger (case insensitive)', async () => {
      const result = await service.route('Run Shield audit now', 'dispatcher');
      expect(result.source).toBe('regex');
      expect(result.agentId).toBe('compliance');
      expect(result.taskSkill).toBe('shield-audit');
    });

    it('should skip skills without primaryAgent', async () => {
      const result = await service.route('something unrelated about billing', 'dispatcher');
      // Should fall through to classifier since no primaryAgent on the matching skill
      expect(result.source).toBe('classifier');
    });

    it('should return default for single-domain personas (driver)', async () => {
      const result = await service.route('what is my next stop', 'driver');
      expect(result.source).toBe('default');
      expect(result.agentId).toBe('driver');
      expect(result.taskSkill).toBeNull();
    });

    it('should return default for customer persona', async () => {
      const result = await service.route('where is my shipment', 'customer');
      expect(result.source).toBe('default');
      expect(result.agentId).toBe('customer');
    });

    it('should return default for prospect persona', async () => {
      const result = await service.route('what does SALLY do', 'prospect');
      expect(result.source).toBe('default');
      expect(result.agentId).toBe('prospect');
    });

    it('should use classifier for multi-domain personas', async () => {
      const result = await service.route('show me unpaid invoices', 'dispatcher');
      expect(result.source).toBe('classifier');
      expect(result.agentId).toBe('billing');
      expect(classifier.classify).toHaveBeenCalledWith('show me unpaid invoices');
    });

    it('should load task skill content from classifier result', async () => {
      classifier.classify.mockResolvedValue({
        agentId: 'route',
        taskSkill: 'route-planning',
      });
      const result = await service.route('help me plan', 'dispatcher');
      expect(result.taskSkillContent).toBe('skill content here');
    });
  });
});
