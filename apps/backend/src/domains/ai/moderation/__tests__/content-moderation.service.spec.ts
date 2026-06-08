import { ContentModerationService } from '../content-moderation.service';

describe('ContentModerationService', () => {
  let service: ContentModerationService;
  let mockOpenAI: any;

  beforeEach(() => {
    mockOpenAI = {
      moderations: {
        create: jest.fn(),
      },
    };
    service = new ContentModerationService(mockOpenAI);
  });

  describe('check', () => {
    it('should return flagged=false for clean text', async () => {
      mockOpenAI.moderations.create.mockResolvedValue({
        results: [
          {
            flagged: false,
            categories: { hate: false, violence: false, sexual: false },
            category_scores: { hate: 0.01, violence: 0.02, sexual: 0.001 },
          },
        ],
      });

      const result = await service.check('What loads are available today?');
      expect(result.flagged).toBe(false);
      expect(result.categories).toEqual([]);
    });

    it('should return flagged=true with categories for harmful text', async () => {
      mockOpenAI.moderations.create.mockResolvedValue({
        results: [
          {
            flagged: true,
            categories: { hate: true, violence: false, harassment: true },
            category_scores: { hate: 0.95, violence: 0.1, harassment: 0.87 },
          },
        ],
      });

      const result = await service.check('harmful content');
      expect(result.flagged).toBe(true);
      expect(result.categories).toContain('hate');
      expect(result.categories).toContain('harassment');
      expect(result.categories).not.toContain('violence');
    });

    it('should fail-open on API error (return flagged=false with error flag)', async () => {
      mockOpenAI.moderations.create.mockRejectedValue(new Error('API timeout'));

      const result = await service.check('some text');
      expect(result.flagged).toBe(false);
      expect(result.error).toBe(true);
    });
  });
});
