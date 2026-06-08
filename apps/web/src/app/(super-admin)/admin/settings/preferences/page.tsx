'use client';

import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@sally/ui/components/ui/card';
import { Button } from '@sally/ui/components/ui/button';
import { Label } from '@sally/ui/components/ui/label';
import { Switch } from '@sally/ui/components/ui/switch';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@sally/ui/components/ui/select';
import { Skeleton } from '@sally/ui/components/ui/skeleton';
import { useAuth } from '@/features/auth';
import { showSuccess, showError } from '@sally/ui';
import { apiClient } from '@/shared/lib/api';

interface SuperAdminPreferences {
  notifyNewTenants: boolean;
  notifyStatusChanges: boolean;
  notificationFrequency: string;
}

export default function SuperAdminPreferencesPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [notifyNewTenants, setNotifyNewTenants] = useState(true);
  const [notifyStatusChanges, setNotifyStatusChanges] = useState(true);
  const [notificationFrequency, setNotificationFrequency] = useState('immediate');

  // Fetch preferences
  const { data: preferences, isLoading } = useQuery({
    queryKey: ['preferences', 'admin'],
    queryFn: () => apiClient<SuperAdminPreferences>('/settings/admin'),
    enabled: !!user,
  });

  // Update local state when preferences load
  useEffect(() => {
    if (preferences) {
      setNotifyNewTenants(preferences.notifyNewTenants);
      setNotifyStatusChanges(preferences.notifyStatusChanges);
      setNotificationFrequency(preferences.notificationFrequency);
    }
  }, [preferences]);

  // Update preferences mutation
  const updateMutation = useMutation({
    mutationFn: (data: Partial<SuperAdminPreferences>) =>
      apiClient<SuperAdminPreferences>('/settings/admin', {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['preferences', 'admin'] });
      showSuccess('Preferences saved');
    },
    onError: () => {
      showError('Error', 'Failed to save preferences. Please try again.');
    },
  });

  const handleSave = () => {
    updateMutation.mutate({
      notifyNewTenants,
      notifyStatusChanges,
      notificationFrequency,
    });
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-44" />
          <Skeleton className="h-4 w-72 mt-1" />
        </CardHeader>
        <CardContent className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex items-center justify-between">
              <div className="space-y-1">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-3 w-56" />
              </div>
              <Skeleton className="h-5 w-10" />
            </div>
          ))}
          <Skeleton className="h-10 w-36" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Preferences</CardTitle>
        <CardDescription>Choose how you want to be notified about platform events</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Toggle: New Tenant Registrations */}
        <div className="flex items-center justify-between">
          <div className="flex-1">
            <Label>New Tenant Registrations</Label>
            <p className="text-sm text-muted-foreground">Get notified when new tenants register</p>
          </div>
          <Switch checked={notifyNewTenants} onCheckedChange={setNotifyNewTenants} />
        </div>

        {/* Toggle: Tenant Status Changes */}
        <div className="flex items-center justify-between">
          <div className="flex-1">
            <Label>Tenant Status Changes</Label>
            <p className="text-sm text-muted-foreground">Get notified when tenants are suspended or reactivated</p>
          </div>
          <Switch checked={notifyStatusChanges} onCheckedChange={setNotifyStatusChanges} />
        </div>

        {/* Select: Notification Frequency */}
        <div className="space-y-2">
          <Label>Notification Frequency</Label>
          <Select value={notificationFrequency} onValueChange={setNotificationFrequency}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="immediate">Immediate</SelectItem>
              <SelectItem value="daily">Daily Digest</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">Choose how often you receive notification emails</p>
        </div>

        <Button onClick={handleSave} loading={updateMutation.isPending}>
          Save Preferences
        </Button>
      </CardContent>
    </Card>
  );
}
