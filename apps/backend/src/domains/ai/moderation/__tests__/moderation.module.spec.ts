import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { openAiModerationClient } from '../moderation.module';

/** The moderation client reads `OPENAI_API_KEY` through the config schema (`openaiApiKey`), never `process.env`. */
describe('openAiModerationClient', () => {
  const ORIGINAL = process.env.OPENAI_API_KEY;
  afterEach(() => {
    if (ORIGINAL === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = ORIGINAL;
  });

  it('is off (null) when the config has no key, even if the raw environment has one', () => {
    process.env.OPENAI_API_KEY = 'sk-from-raw-env';
    expect(openAiModerationClient(new ConfigService({}))).toBeNull();
  });

  it('builds a client from the config key', () => {
    expect(openAiModerationClient(new ConfigService({ openaiApiKey: 'sk-test' }))).toBeInstanceOf(OpenAI);
  });
});
