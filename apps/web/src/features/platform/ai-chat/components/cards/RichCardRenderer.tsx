'use client';

import type { ComponentType } from 'react';
import type { RichCard, RichCardType } from '../../engine/types';
import { TextCard } from './TextCard';
import { ConfirmationCard } from './ConfirmationCard';
import { CapabilitiesCard } from './CapabilitiesCard';

/**
 * Pluggable rich-card registry.
 *
 * The AI chat streams `card` frames (`8:` in the SSE protocol) that carry a
 * `{ type, data }` payload. This registry maps a card `type` to the React
 * component that renders it. The starter ships a minimal generic catalog —
 * register your own product cards by adding an entry below (and the matching
 * `RichCardType` in `engine/types.ts`).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const CARD_REGISTRY: Record<RichCardType, ComponentType<{ data: Record<string, any> }>> = {
  text: TextCard,
  confirmation: ConfirmationCard,
  capabilities: CapabilitiesCard,
};

export function RichCardRenderer({ card }: { card: RichCard }) {
  const Card = CARD_REGISTRY[card.type];
  if (!Card) return null;
  return <Card data={card.data} />;
}
