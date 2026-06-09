import type { ComingSoonBannerProps } from '@/features/platform/feature-flags';

/**
 * Content for "coming soon" / feature-disabled banners.
 * Keys match feature-flag keys (operational kill-switches). A banner is shown
 * when a feature flag is OFF (under maintenance or not yet launched).
 *
 * Add an entry here for any feature you gate behind a flag.
 */
export const comingSoonContent: Record<string, Omit<ComingSoonBannerProps, 'category'>> = {
  voice_mode: {
    title: 'Voice Mode',
    description: 'Talk to the assistant hands-free with speech-to-text and text-to-speech.',
    features: [
      'Hands-free voice interaction with the assistant',
      'Speech-to-text transcription',
      'Natural, spoken responses',
    ],
  },

  ai_chat: {
    title: 'AI Assistant',
    description: 'A streaming chat assistant grounded in your knowledge base, with tools you register via MCP.',
    features: [
      'Streaming responses',
      'Tool calling via the Model Context Protocol',
      'Retrieval-augmented answers from your content',
    ],
  },
};
