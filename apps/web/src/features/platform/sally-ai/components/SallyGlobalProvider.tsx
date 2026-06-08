'use client';

import { useEffect, useLayoutEffect } from 'react';
import { usePathname } from 'next/navigation';
import { useAuthStore } from '@/features/auth';
import { useSallyStore } from '../store';
import { SallyStrip } from './SallyStrip';
import type { UserMode } from '../engine/types';

function detectMode(userRole: string | undefined, isAuthenticated: boolean): UserMode {
  if (!isAuthenticated) return 'prospect';
  if (userRole === 'CUSTOMER') return 'customer';
  if (userRole === 'DRIVER') return 'driver';
  if (userRole === 'OWNER') return 'owner';
  if (userRole === 'ADMIN') return 'admin';
  if (userRole === 'SUPER_ADMIN') return 'super_admin';
  return 'dispatcher';
}

// useLayoutEffect on client, useEffect on server (avoids SSR warning)
const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

export function SallyGlobalProvider() {
  const { user, isAuthenticated } = useAuthStore();
  const { setUserMode, userMode } = useSallyStore();
  const pathname = usePathname();

  // Sync mode before paint to prevent flash of wrong mode / race with conversation creation
  useIsomorphicLayoutEffect(() => {
    const mode = detectMode(user?.role, isAuthenticated);
    if (mode !== userMode) {
      setUserMode(mode);
    }
  }, [user?.role, isAuthenticated, setUserMode, userMode]);

  if (user?.role === 'SUPER_ADMIN') return null;

  // Suppress the entire floating Sally surface on the home page —
  // Sally is rendered inline there (orb, input, chat all live in SallyHome).
  // Rendering SallyStrip here would create two competing chat surfaces.
  if (pathname === '/dispatcher') return null;

  return <SallyStrip />;
}
