'use client';

import { useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTheme } from 'next-themes';
import { apiClient } from '@/shared/lib/api';
import { showSuccess, showError } from '@sally/ui';
import { usePushNotifications } from '@/shared/hooks/use-push-notifications';
import type { NavApp } from '../lib/external-navigation';

import { queryKeys } from '@/shared/constants';
import { extractErrorMessage } from '@/shared/lib/error-utils';

export type { NavApp };

interface DriverPreferencesData {
  preferredNavApp: string;
  theme: string;
  pushEnabled: boolean;
}

interface DriverPreferences {
  preferredNavApp: NavApp;
  pushEnabled: boolean;
  theme: 'auto' | 'light' | 'dark';
}

function mapFromBackend(data: DriverPreferencesData): DriverPreferences {
  return {
    preferredNavApp: (data.preferredNavApp || 'copilot') as NavApp,
    theme: (data.theme || 'auto') as 'auto' | 'light' | 'dark',
    pushEnabled: data.pushEnabled ?? false,
  };
}

export function useDriverPreferences() {
  const queryClient = useQueryClient();
  const { setTheme } = useTheme();
  const { subscribe, unsubscribe } = usePushNotifications();

  const { data: backendPrefs, isLoading } = useQuery({
    queryKey: [...queryKeys.driverPreferences.root],
    queryFn: () => apiClient<DriverPreferencesData>('/settings/driver'),
  });

  const preferences: DriverPreferences = backendPrefs
    ? mapFromBackend(backendPrefs)
    : { preferredNavApp: 'copilot' as NavApp, pushEnabled: false, theme: 'auto' };

  // Apply theme on load
  useEffect(() => {
    if (backendPrefs?.theme) {
      const themeValue = backendPrefs.theme === 'auto' ? 'system' : backendPrefs.theme;
      setTheme(themeValue);
    }
  }, [backendPrefs?.theme, setTheme]);

  const mutation = useMutation({
    mutationFn: (updates: Partial<DriverPreferencesData>) =>
      apiClient('/settings/driver', {
        method: 'PUT',
        body: JSON.stringify(updates),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [...queryKeys.driverPreferences.root] });
      showSuccess('Preference saved');
    },
    onError: (error: Error) => {
      showError('Failed to save preference', extractErrorMessage(error));
    },
  });

  const updatePreference = async <K extends keyof DriverPreferences>(key: K, value: DriverPreferences[K]) => {
    if (key === 'theme') {
      const themeValue = value === 'auto' ? 'system' : (value as string);
      setTheme(themeValue);
      mutation.mutate({ theme: value as string });
      return;
    }

    if (key === 'pushEnabled') {
      const enabled = value as boolean;
      if (enabled) {
        const success = await subscribe();
        if (!success) return;
      } else {
        const success = await unsubscribe();
        if (!success) return;
      }
      mutation.mutate({ pushEnabled: enabled });
      return;
    }

    if (key === 'preferredNavApp') {
      mutation.mutate({ preferredNavApp: value as string });
      return;
    }
  };

  return { preferences, updatePreference, isLoading };
}
