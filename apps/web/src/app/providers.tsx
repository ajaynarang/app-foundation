'use client';

import { QueryClient, QueryClientProvider, MutationCache } from '@tanstack/react-query';
import { showMutationError } from '@app/ui';
import { useState } from 'react';
import { AuthProvider } from '@/shared/components/common/providers/auth-provider';
import { PreferencesProvider } from '@/shared/providers/PreferencesProvider';
import { SseProvider } from '@appshore/web-core/shared/realtime';
import { TooltipProvider } from '@app/ui/components/ui/tooltip';

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        mutationCache: new MutationCache({
          onError: (error, _variables, _context, mutation) => {
            // Global fallback: show toast ONLY if the mutation didn't define its own onError.
            // If mutation has onError, it already handled the error — don't double-toast.
            if (!mutation.options.onError) {
              showMutationError(error);
            }
          },
        }),
        defaultOptions: {
          queries: {
            staleTime: 2 * 60_000, // 2 min — SSE invalidation handles real-time, this is the safety net
            gcTime: 10 * 60_000, // 10 min cache retention
            refetchOnWindowFocus: false, // OPERATIONAL tier opts in per-hook
            refetchOnReconnect: 'always',
            retry: 1,
          },
          mutations: {
            retry: 0, // Don't retry mutations (user should manually retry)
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <PreferencesProvider>
          <SseProvider>
            <TooltipProvider delayDuration={0}>{children}</TooltipProvider>
          </SseProvider>
        </PreferencesProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
