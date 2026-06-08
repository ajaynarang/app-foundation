'use client';

import { useEffect, useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@app/ui/components/ui/card';
import { Label } from '@app/ui/components/ui/label';
import { Input } from '@app/ui/components/ui/input';
import { Button } from '@app/ui/components/ui/button';
import { Switch } from '@app/ui/components/ui/switch';
import { Badge } from '@app/ui/components/ui/badge';
import { Separator } from '@app/ui/components/ui/separator';
import { Skeleton } from '@app/ui/components/ui/skeleton';
import { Save, Lock } from 'lucide-react';
import { showSuccess, showError } from '@/shared/lib/toast';
import { useAuthStore } from '@/features/auth';
import { getAlertConfig, updateAlertConfig } from '@/features/platform/settings/api';
import type { AlertConfiguration } from '@/features/platform/settings/api';
import { extractErrorMessage } from '@/shared/lib/error-utils';
import { AlertPriority } from '@/features/operations/alerts';

// ============================================================================
// Alert type metadata
// ============================================================================

interface AlertTypeMeta {
  label: string;
  description: string;
  thresholdUnit?: '%' | 'min';
  thresholdLabel?: string;
}

const ALERT_TYPE_SECTIONS: { heading: string; description: string; types: string[] }[] = [
  {
    heading: 'Compliance',
    description: 'Warning and critical thresholds for Hours of Service limits.',
    types: [
      'HOS_DRIVE_WARNING',
      'HOS_DRIVE_CRITICAL',
      'HOS_ON_DUTY_WARNING',
      'HOS_ON_DUTY_CRITICAL',
      'HOS_BREAK_WARNING',
      'HOS_BREAK_CRITICAL',
      'HOS_APPROACHING_LIMIT',
      'CYCLE_APPROACHING_LIMIT',
    ],
  },
  {
    heading: 'Schedule',
    description: 'Alerts for delays, missed appointments, and unconfirmed stops.',
    types: [
      'ROUTE_DELAY',
      'APPOINTMENT_AT_RISK',
      'MISSED_APPOINTMENT',
      'DOCK_TIME_EXCEEDED',
      'UNCONFIRMED_PICKUP',
      'UNCONFIRMED_DELIVERY',
    ],
  },
  {
    heading: 'Safety',
    description: 'Alerts for driver behavior -- stationary, speeding, unauthorized stops.',
    types: ['DRIVER_NOT_MOVING', 'SPEEDING', 'UNAUTHORIZED_STOP'],
  },
  {
    heading: 'Route',
    description: 'Alerts for external conditions affecting routes -- weather, closures, fuel.',
    types: ['WEATHER_ALERT', 'ROAD_CLOSURE', 'FUEL_LOW'],
  },
];

const ALERT_TYPE_META: Record<string, AlertTypeMeta> = {
  HOS_DRIVE_WARNING: {
    label: 'Drive Hours -- Warning',
    description: 'Warning when a driver has used this % of their 11-hour drive limit.',
    thresholdUnit: '%',
    thresholdLabel: 'Threshold (%)',
  },
  HOS_DRIVE_CRITICAL: {
    label: 'Drive Hours -- Critical',
    description: 'Critical alert at this % of the 11-hour drive limit.',
    thresholdUnit: '%',
    thresholdLabel: 'Threshold (%)',
  },
  HOS_ON_DUTY_WARNING: {
    label: 'On-Duty -- Warning',
    description: 'Warning when approaching the 14-hour on-duty window.',
    thresholdUnit: '%',
    thresholdLabel: 'Threshold (%)',
  },
  HOS_ON_DUTY_CRITICAL: {
    label: 'On-Duty -- Critical',
    description: 'Critical alert for the 14-hour on-duty window.',
    thresholdUnit: '%',
    thresholdLabel: 'Threshold (%)',
  },
  HOS_BREAK_WARNING: {
    label: 'Break Required -- Warning',
    description: 'Warning when approaching the 8-hour limit since last 30-minute break.',
    thresholdUnit: '%',
    thresholdLabel: 'Threshold (%)',
  },
  HOS_BREAK_CRITICAL: {
    label: 'Break Required -- Critical',
    description: 'Critical alert for the 8-hour break limit.',
    thresholdUnit: '%',
    thresholdLabel: 'Threshold (%)',
  },
  HOS_APPROACHING_LIMIT: {
    label: 'HOS Approaching Limit',
    description: 'General alert when a driver is nearing any HOS limit.',
    thresholdUnit: '%',
    thresholdLabel: 'Threshold (%)',
  },
  CYCLE_APPROACHING_LIMIT: {
    label: 'Cycle Approaching Limit',
    description: 'Alert when remaining minutes in the 60/70-hour cycle window drop below this threshold.',
    thresholdUnit: 'min',
    thresholdLabel: 'Minutes remaining',
  },
  ROUTE_DELAY: {
    label: 'Route Delay',
    description: 'Alert when a driver falls behind their scheduled arrival by this many minutes.',
    thresholdUnit: 'min',
    thresholdLabel: 'Delay (minutes)',
  },
  APPOINTMENT_AT_RISK: {
    label: 'Appointment at Risk',
    description: 'Alert when the ETA puts a pickup or delivery at risk of being missed.',
    thresholdUnit: 'min',
    thresholdLabel: 'Minutes before miss',
  },
  MISSED_APPOINTMENT: {
    label: 'Missed Appointment',
    description: 'Fires when a driver misses their scheduled pickup or delivery window. Cannot be disabled.',
  },
  DOCK_TIME_EXCEEDED: {
    label: 'Dock Time Exceeded',
    description: 'Alert when time spent at a dock exceeds the planned dwell time.',
    thresholdUnit: 'min',
    thresholdLabel: 'Minutes over estimate',
  },
  UNCONFIRMED_PICKUP: {
    label: 'Unconfirmed Pickup',
    description: 'Alert when a driver departs a pickup location without confirming the pickup.',
  },
  UNCONFIRMED_DELIVERY: {
    label: 'Unconfirmed Delivery',
    description: 'Alert when a driver departs a delivery location without confirming the delivery.',
  },
  DRIVER_NOT_MOVING: {
    label: 'Driver Not Moving',
    description: 'Alert when a driver has been stationary for this many minutes during an active route.',
    thresholdUnit: 'min',
    thresholdLabel: 'Stationary (minutes)',
  },
  SPEEDING: {
    label: 'Speeding',
    description: 'Alert when a driver exceeds the speed limit by this percentage over the posted limit.',
    thresholdUnit: '%',
    thresholdLabel: 'Over limit (%)',
  },
  UNAUTHORIZED_STOP: {
    label: 'Unauthorized Stop',
    description: 'Alert when a driver stops at an unplanned location for more than this many minutes.',
    thresholdUnit: 'min',
    thresholdLabel: 'Minutes at stop',
  },
  WEATHER_ALERT: {
    label: 'Weather Alert',
    description: 'Alert when severe weather is reported along an active route.',
  },
  ROAD_CLOSURE: {
    label: 'Road Closure',
    description: 'Alert when a road closure affects an active route.',
  },
  FUEL_LOW: {
    label: 'Fuel Low',
    description: 'Alert when estimated fuel tank level drops below this percentage of capacity.',
    thresholdUnit: '%',
    thresholdLabel: 'Tank level (%)',
  },
};

const CHANNEL_LABELS = ['In-App', 'Email', 'Push', 'SMS'];
const CHANNEL_KEYS = ['inApp', 'email', 'push', 'sms'] as const;
const PRIORITY_LEVELS = [AlertPriority.CRITICAL, AlertPriority.HIGH, AlertPriority.MEDIUM, AlertPriority.LOW] as const;

export default function AlertsSettingsPage() {
  const { user } = useAuthStore();
  const [alertConfig, setAlertConfig] = useState<AlertConfiguration | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const canEdit = user?.role === 'ADMIN' || user?.role === 'OWNER';

  useEffect(() => {
    if (user) {
      setLoading(true);
      getAlertConfig()
        .then(setAlertConfig)
        .catch((err) => showError('Failed to load alert config', extractErrorMessage(err)))
        .finally(() => setLoading(false));
    }
  }, [user]);

  const handleAlertTypeToggle = (typeKey: string, enabled: boolean) => {
    if (!alertConfig) return;
    const currentType = alertConfig.alertTypes[typeKey];
    if (currentType?.mandatory) return;
    setAlertConfig({
      ...alertConfig,
      alertTypes: {
        ...alertConfig.alertTypes,
        [typeKey]: { ...currentType, enabled },
      },
    });
  };

  const handleThresholdChange = (typeKey: string, value: number) => {
    if (!alertConfig) return;
    const meta = ALERT_TYPE_META[typeKey];
    const field = meta?.thresholdUnit === '%' ? 'thresholdPercent' : 'thresholdMinutes';
    setAlertConfig({
      ...alertConfig,
      alertTypes: {
        ...alertConfig.alertTypes,
        [typeKey]: { ...alertConfig.alertTypes[typeKey], [field]: value },
      },
    });
  };

  const handleChannelToggle = (priority: string, channel: (typeof CHANNEL_KEYS)[number], enabled: boolean) => {
    if (!alertConfig) return;
    setAlertConfig({
      ...alertConfig,
      defaultChannels: {
        ...alertConfig.defaultChannels,
        [priority]: { ...alertConfig.defaultChannels[priority], [channel]: enabled },
      },
    });
  };

  const handleSave = async () => {
    if (!alertConfig) return;
    setSaving(true);
    try {
      const updated = await updateAlertConfig(alertConfig);
      setAlertConfig(updated);
      showSuccess('Alert configuration saved');
    } catch (err) {
      showError('Failed to save alert configuration', extractErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <Skeleton className="h-7 w-20" />
            <Skeleton className="h-4 w-96 mt-2" />
          </div>
          <Skeleton className="h-6 w-24" />
        </div>
        <Card>
          <CardHeader>
            <Skeleton className="h-5 w-28" />
            <Skeleton className="h-4 w-80 mt-1" />
          </CardHeader>
          <CardContent className="space-y-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="flex flex-col md:flex-row md:items-center gap-3 md:gap-4 py-3 border-b border-border last:border-0"
              >
                <div className="flex-1 min-w-0 space-y-1">
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="h-3 w-72" />
                </div>
                <Skeleton className="h-8 w-24" />
                <Skeleton className="h-5 w-10" />
              </div>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <Skeleton className="h-5 w-36" />
            <Skeleton className="h-4 w-80 mt-1" />
          </CardHeader>
          <CardContent className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="grid grid-cols-5 gap-4 py-3">
                <Skeleton className="h-4 w-16" />
                {Array.from({ length: 4 }).map((_, j) => (
                  <div key={j} className="flex justify-center">
                    <Skeleton className="h-5 w-10" />
                  </div>
                ))}
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!alertConfig) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12 space-y-4">
          <p className="text-sm text-muted-foreground">Failed to load alert configuration.</p>
          <Button
            variant="outline"
            onClick={() => {
              setLoading(true);
              getAlertConfig()
                .then(setAlertConfig)
                .catch(() => {})
                .finally(() => setLoading(false));
            }}
          >
            Try Again
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-foreground">Alerts</h2>
          <p className="text-sm text-muted-foreground">When alerts fire and who gets notified</p>
        </div>
        <Badge variant={canEdit ? 'default' : 'muted'}>{canEdit ? 'Admin / Owner' : 'Read Only'}</Badge>
      </div>

      {/* Alert Types */}
      <Card>
        <CardHeader>
          <CardTitle>Alert Types</CardTitle>
          <CardDescription>
            Enable or disable alert types and set their trigger thresholds. Mandatory alerts cannot be disabled.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {ALERT_TYPE_SECTIONS.map((section, sectionIdx) => (
            <div key={section.heading}>
              {sectionIdx > 0 && <Separator className="mb-6" />}
              <div className="mb-4">
                <p className="text-sm font-medium text-foreground">{section.heading}</p>
                <p className="text-xs text-muted-foreground">{section.description}</p>
              </div>
              <div className="space-y-4">
                {section.types.map((typeKey) => {
                  const config = alertConfig.alertTypes[typeKey];
                  if (!config) return null;
                  const meta = ALERT_TYPE_META[typeKey];
                  if (!meta) return null;
                  const thresholdValue = meta.thresholdUnit === '%' ? config.thresholdPercent : config.thresholdMinutes;

                  return (
                    <div
                      key={typeKey}
                      className="flex flex-col md:flex-row md:items-center gap-3 md:gap-4 py-3 border-b border-border last:border-0"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <Label className="text-sm font-medium">{meta.label}</Label>
                          {config.mandatory && (
                            <Badge variant="outline" className="text-xs gap-1">
                              <Lock className="h-3 w-3" />
                              Required
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">{meta.description}</p>
                      </div>

                      {meta.thresholdUnit && thresholdValue !== undefined && (
                        <div className="flex items-center gap-2 shrink-0">
                          <Input
                            type="number"
                            min={1}
                            max={meta.thresholdUnit === '%' ? 100 : undefined}
                            className="h-8 w-24"
                            disabled={!canEdit}
                            value={thresholdValue}
                            onChange={(e) => handleThresholdChange(typeKey, parseInt(e.target.value) || 0)}
                          />
                          <span className="text-xs text-muted-foreground w-6">
                            {meta.thresholdUnit === '%' ? '%' : 'min'}
                          </span>
                        </div>
                      )}

                      <Switch
                        checked={config.enabled}
                        onCheckedChange={(checked) => handleAlertTypeToggle(typeKey, checked)}
                        disabled={!canEdit || config.mandatory}
                        className="shrink-0"
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Default Channels */}
      <Card>
        <CardHeader>
          <CardTitle>Default Channels</CardTitle>
          <CardDescription>
            Organization-wide defaults for how alerts are delivered. Individual users can override these in their
            notification preferences.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-5 gap-4 mb-3 pb-2 border-b border-border">
            <div className="text-sm font-medium text-muted-foreground">Priority</div>
            {CHANNEL_LABELS.map((label) => (
              <div key={label} className="text-sm font-medium text-muted-foreground text-center">
                {label}
              </div>
            ))}
          </div>
          {PRIORITY_LEVELS.map((priority) => {
            const channels = alertConfig.defaultChannels[priority];
            if (!channels) return null;
            const isCritical = priority === AlertPriority.CRITICAL;
            return (
              <div
                key={priority}
                className="grid grid-cols-5 gap-4 py-3 border-b border-border last:border-0 items-center"
              >
                <div className="text-sm font-medium capitalize text-foreground">{priority.toLowerCase()}</div>
                {CHANNEL_KEYS.map((channelKey) => {
                  const isMandatoryChannel = isCritical && channelKey === 'inApp';
                  return (
                    <div key={channelKey} className="flex justify-center items-center gap-1">
                      <Switch
                        checked={isMandatoryChannel ? true : channels[channelKey]}
                        onCheckedChange={(checked) => handleChannelToggle(priority, channelKey, checked)}
                        disabled={!canEdit || isMandatoryChannel}
                      />
                      {isMandatoryChannel && (
                        <span title="Required for compliance">
                          <Lock className="h-3 w-3 text-muted-foreground" />
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* Grouping */}
      <Card>
        <CardHeader>
          <CardTitle>Alert Grouping</CardTitle>
          <CardDescription>Configure how related alerts are grouped to reduce noise.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="flex-1 min-w-0">
              <Label>Deduplication Window (minutes)</Label>
              <p className="text-xs text-muted-foreground">
                Suppress duplicate alerts of the same type for the same driver within this window.
              </p>
            </div>
            <Input
              type="number"
              min="1"
              max="120"
              className="w-full md:w-48"
              disabled={!canEdit}
              value={alertConfig.groupingConfig.dedupWindowMinutes}
              onChange={(e) =>
                setAlertConfig({
                  ...alertConfig,
                  groupingConfig: { ...alertConfig.groupingConfig, dedupWindowMinutes: parseInt(e.target.value) || 15 },
                })
              }
            />
          </div>

          <div className="flex items-center justify-between">
            <div>
              <Label>Group Same Type Per Driver</Label>
              <p className="text-xs text-muted-foreground">
                Combine repeated alerts of the same type for a single driver into one notification.
              </p>
            </div>
            <Switch
              checked={alertConfig.groupingConfig.groupSameTypePerDriver}
              onCheckedChange={(checked) =>
                setAlertConfig({
                  ...alertConfig,
                  groupingConfig: { ...alertConfig.groupingConfig, groupSameTypePerDriver: checked },
                })
              }
              disabled={!canEdit}
            />
          </div>

          <div className="flex items-center justify-between">
            <div>
              <Label>Link Cascading Alerts</Label>
              <p className="text-xs text-muted-foreground">Automatically link related alerts so you see the chain.</p>
            </div>
            <Switch
              checked={alertConfig.groupingConfig.linkCascading}
              onCheckedChange={(checked) =>
                setAlertConfig({
                  ...alertConfig,
                  groupingConfig: { ...alertConfig.groupingConfig, linkCascading: checked },
                })
              }
              disabled={!canEdit}
            />
          </div>
        </CardContent>
      </Card>

      {/* Save */}
      {canEdit && (
        <div className="flex justify-end">
          <Button loading={saving} onClick={handleSave}>
            <Save className="h-4 w-4 mr-2" />
            Save Changes
          </Button>
        </div>
      )}
    </div>
  );
}
