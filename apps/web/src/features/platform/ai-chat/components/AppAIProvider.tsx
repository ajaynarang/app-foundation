'use client';

import { useEffect, useLayoutEffect } from 'react';
import { useAuthStore } from '@/features/auth';
import { useAssistantStore } from '../store';
import { AssistantStrip } from './AssistantStrip';
import type { UserMode } from '../engine/types';

function detectMode(userRole: string | undefined, isAuthenticated: boolean): UserMode {
  if (!isAuthenticated) return 'prospect';
  if (userRole === 'OWNER') return 'owner';
  if (userRole === 'ADMIN') return 'admin';
  if (userRole === 'SUPER_ADMIN') return 'super_admin';
  return 'member';
}

// useLayoutEffect on client, useEffect on server (avoids SSR warning)
const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

export function AppAIProvider() {
  const { user, isAuthenticated } = useAuthStore();
  const { setUserMode, userMode } = useAssistantStore();

  // Sync mode before paint to prevent flash of wrong mode / race with conversation creation
  useIsomorphicLayoutEffect(() => {
    const mode = detectMode(user?.role, isAuthenticated);
    if (mode !== userMode) {
      setUserMode(mode);
    }
  }, [user?.role, isAuthenticated, setUserMode, userMode]);

  // Platform super-admins manage the console, not end-user chat.
  if (user?.role === 'SUPER_ADMIN') return null;

  return <AssistantStrip />;
}
