'use client';

import { useMemo } from 'react';
import { ApiKeysPage } from '@/features/platform/api-keys/components/ApiKeysPage';
import { Alert, AlertDescription } from '@app/ui/components/ui/alert';
import { Badge } from '@app/ui/components/ui/badge';
import { Card, CardContent } from '@app/ui/components/ui/card';
import { AlertCircle } from 'lucide-react';
import { UrlRow } from '@app/ui/components/ui/url-row';
import { getApiBaseUrl, getEnvironmentLabel } from '@/shared/lib/access-environments';

export default function ApiKeysSettingsPage() {
  const apiBaseUrl = useMemo(() => getApiBaseUrl(), []);
  const environmentLabel = useMemo(() => getEnvironmentLabel(apiBaseUrl), [apiBaseUrl]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-foreground">API Keys</h2>
        <p className="text-sm text-muted-foreground">Scoped API keys for scripts, BI tools, and private agents</p>
      </div>

      <Card>
        <CardContent className="pt-6 space-y-3">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium text-foreground">Environment</p>
            <Badge variant="outline">{environmentLabel}</Badge>
          </div>
          <UrlRow label="API Base URL" value={apiBaseUrl} />
          <p className="text-xs text-muted-foreground">Keys created here are scoped to this environment only.</p>
        </CardContent>
      </Card>

      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertDescription className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <span>Need users to sign in before accessing data? Use OAuth instead of API keys.</span>
          <a
            href="/settings/oauth-clients"
            className="text-sm font-medium text-foreground underline underline-offset-4"
          >
            Go to OAuth Clients
          </a>
        </AlertDescription>
      </Alert>

      <ApiKeysPage />
    </div>
  );
}
