'use client';

import { createContext, useContext } from 'react';

/**
 * Feature-scoped context for the Tower canvas. The page owns the
 * `LoadDetailPanel` and `ConversationSheet` instances; deeply-nested
 * surfaces (wire items, active-load rows) call into these handlers
 * instead of prop-drilling through 4+ intermediate components.
 */
export interface TowerInteractionValue {
  /** Open the right-side load detail sheet for a load id. */
  openLoad: (loadId: string) => void;
  /** Open the conversation sheet for a driver's thread. */
  openConversation: (driverId: string) => void;
}

const TowerInteractionContext = createContext<TowerInteractionValue | null>(null);

export const TowerInteractionProvider = TowerInteractionContext.Provider;

export function useTowerInteraction(): TowerInteractionValue {
  const ctx = useContext(TowerInteractionContext);
  if (!ctx) throw new Error('useTowerInteraction must be used inside <TowerInteractionProvider>');
  return ctx;
}
