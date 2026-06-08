jest.mock('langfuse', () => ({ Langfuse: jest.fn() }));

import { ServiceFallbackRegistrar } from '../registrars/service-fallback.registrar';
import { PROMPT_NAMES } from '../prompting.types';

describe('ServiceFallbackRegistrar', () => {
  const registerFallback = jest.fn();
  const promptService = { registerFallback } as any;

  beforeEach(() => {
    registerFallback.mockReset();
  });

  it('registers a fallback for every service-level prompt name', () => {
    const registrar = new ServiceFallbackRegistrar(promptService);
    registrar.onModuleInit();

    const registeredNames = registerFallback.mock.calls.map(([name]) => name);
    expect(registeredNames).toEqual(
      expect.arrayContaining([
        PROMPT_NAMES.RATECON_PARSER,
        PROMPT_NAMES.FUEL_RECEIPT_PARSER,
        PROMPT_NAMES.SHIELD_ANALYST,
        PROMPT_NAMES.BRIEFING,
        PROMPT_NAMES.ALERT_BRIEFING,
        PROMPT_NAMES.FEEDBACK_CATEGORIZER,
        PROMPT_NAMES.SKILL_CLASSIFIER,
        PROMPT_NAMES.LOAD_BOARD_SEARCH_PARSER,
      ]),
    );
  });

  it('registers non-empty content for each fallback', () => {
    const registrar = new ServiceFallbackRegistrar(promptService);
    registrar.onModuleInit();

    for (const [, content] of registerFallback.mock.calls) {
      expect(typeof content).toBe('string');
      expect((content as string).length).toBeGreaterThan(50);
    }
  });
});
