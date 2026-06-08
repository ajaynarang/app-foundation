'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { useAuthStore } from '@/features/auth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@sally/ui/components/ui/card';
import { Switch } from '@sally/ui/components/ui/switch';
import { Badge } from '@sally/ui/components/ui/badge';
import { Label } from '@sally/ui/components/ui/label';
import { Separator } from '@sally/ui/components/ui/separator';
import { useFeatureFlags } from '@/features/platform/feature-flags';
import { updateFeatureFlag } from '@/features/platform/feature-flags';
import { Skeleton } from '@sally/ui/components/ui/skeleton';
import { Loader2, XCircle, Flag } from 'lucide-react';
import { showSuccess, showError } from '@sally/ui';
import { extractErrorMessage } from '@/shared/lib/error-utils';

/** Capitalize + humanize a category key: "ai" → "AI", "operations" → "Operations" */
function formatCategory(category: string): string {
  if (category === 'ai') return 'AI';
  return category.charAt(0).toUpperCase() + category.slice(1);
}

export default function FeatureFlagsAdminPage() {
  const { isAuthenticated, user } = useAuthStore();
  const { data: flags = [], isLoading, refetch } = useFeatureFlags();

  const [localFlags, setLocalFlags] = useState<Record<string, boolean>>({});
  const [savingFlags, setSavingFlags] = useState<Set<string>>(new Set());
  const isInitialized = useRef(false);

  // Initialize local state from query data (only once)
  useEffect(() => {
    if (flags.length > 0 && !isInitialized.current) {
      const initialState: Record<string, boolean> = {};
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      flags.forEach((flag: any) => {
        initialState[flag.key] = flag.enabled;
      });
      setLocalFlags(initialState);
      isInitialized.current = true;
    }
  }, [flags]);

  // Derive categories dynamically from the flags data
  const categories = useMemo(() => {
    const grouped = new Map<string, typeof flags>();
    for (const flag of flags) {
      const cat = flag.category || 'general';
      if (!grouped.has(cat)) grouped.set(cat, []);
      grouped.get(cat)!.push(flag);
    }
    // Sort flags within each category by key
    for (const [, group] of grouped) {
      group.sort((a, b) => a.key.localeCompare(b.key));
    }
    return Array.from(grouped.entries()).map(([category, categoryFlags]) => ({
      category,
      label: formatCategory(category),
      flags: categoryFlags,
    }));
  }, [flags]);

  // Auth check - SUPER_ADMIN only
  if (!isAuthenticated || user?.role !== 'SUPER_ADMIN') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card className="max-w-md">
          <CardContent className="pt-6 text-center">
            <XCircle className="h-12 w-12 text-critical mx-auto mb-4" />
            <p className="text-lg font-semibold">Access Denied</p>
            <p className="text-sm text-muted-foreground mt-2">Only super admins can manage global feature flags</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const handleToggle = async (key: string, enabled: boolean) => {
    setLocalFlags((prev) => ({ ...prev, [key]: enabled }));
    setSavingFlags((prev) => new Set(prev).add(key));

    try {
      await updateFeatureFlag(key, enabled);
      const flag = flags.find((f) => f.key === key);
      showSuccess(`${flag?.name || key} has been ${enabled ? 'enabled' : 'disabled'}`);
      await refetch();
    } catch (err) {
      setLocalFlags((prev) => ({ ...prev, [key]: !enabled }));
      showError('Error', extractErrorMessage(err));
    } finally {
      setSavingFlags((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  };

  const enabledCount = flags.filter((f) => localFlags[f.key]).length;
  const disabledCount = flags.filter((f) => !localFlags[f.key]).length;

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <Skeleton className="h-9 w-72" />
          <Skeleton className="h-4 w-96 mt-2" />
        </div>
        <Card>
          <CardContent className="pt-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="text-center space-y-1">
                  <Skeleton className="h-9 w-12 mx-auto" />
                  <Skeleton className="h-4 w-20 mx-auto" />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
        {[1, 2, 3, 4].map((i) => (
          <Card key={i}>
            <CardHeader>
              <Skeleton className="h-5 w-40" />
            </CardHeader>
            <CardContent className="space-y-4">
              {[1, 2, 3].map((j) => (
                <div key={j}>
                  {j > 1 && <Separator className="my-4" />}
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 space-y-1">
                      <Skeleton className="h-5 w-36" />
                      <Skeleton className="h-4 w-full max-w-md" />
                    </div>
                    <Skeleton className="h-5 w-10 shrink-0" />
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-3">
          <Flag className="h-8 w-8" />
          Feature Flags
        </h1>
        <p className="text-muted-foreground mt-1">
          Operational kill-switches for platform features. Toggle OFF to disable globally for all tenants.
        </p>
      </div>

      {/* Stats */}
      <Card>
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="text-center">
              <p className="text-3xl font-bold text-foreground">{flags.length}</p>
              <p className="text-sm text-muted-foreground">Total Flags</p>
            </div>
            <div className="text-center">
              <p className="text-3xl font-bold text-foreground">{enabledCount}</p>
              <p className="text-sm text-muted-foreground">Enabled</p>
            </div>
            <div className="text-center">
              <p className="text-3xl font-bold text-foreground">{disabledCount}</p>
              <p className="text-sm text-muted-foreground">Disabled</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Category cards — fully dynamic, no hardcoded categories */}
      {categories.map(({ category, label, flags: categoryFlags }) => (
        <Card key={category}>
          <CardHeader>
            <CardTitle>{label}</CardTitle>
            <CardDescription>
              {categoryFlags.length} flag{categoryFlags.length !== 1 ? 's' : ''}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {categoryFlags.map((flag, index) => (
              <div key={flag.key}>
                {index > 0 && <Separator className="my-4" />}
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <Label htmlFor={flag.key} className="text-base font-semibold cursor-pointer">
                        {flag.name}
                      </Label>
                      <Badge variant={localFlags[flag.key] ? 'default' : 'muted'} className="text-xs">
                        {localFlags[flag.key] ? 'ON' : 'OFF'}
                      </Badge>
                      {savingFlags.has(flag.key) && (
                        <Badge variant="outline" className="text-xs border-info text-info">
                          <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                          Saving
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">{flag.description}</p>
                  </div>
                  <Switch
                    id={flag.key}
                    checked={localFlags[flag.key] || false}
                    onCheckedChange={(checked) => handleToggle(flag.key, checked)}
                    disabled={savingFlags.has(flag.key)}
                  />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      ))}

      {/* Warning Card */}
      <Card className="border-caution/20">
        <CardContent className="pt-6">
          <div className="flex gap-3">
            <div className="text-caution mt-0.5">⚠️</div>
            <div className="space-y-1">
              <p className="text-sm font-medium text-caution">Important Notes</p>
              <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
                <li>These are operational kill-switches — toggle OFF only during incidents or rollouts</li>
                <li>Changes affect ALL tenants globally and are saved immediately</li>
                <li>Frontend cache (5min) and backend cache (30s) may cause brief delay</li>
                <li>Disabling a feature shows &quot;Coming Soon&quot; banners to users</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
