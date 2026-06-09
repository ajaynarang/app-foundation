'use client';

import { useMemo } from 'react';
import { OAuthClientsList } from '@/features/oauth-clients/components/oauth-clients-list';
import { Alert, AlertDescription } from '@app/ui/components/ui/alert';
import { Badge } from '@app/ui/components/ui/badge';
import { Card, CardContent } from '@app/ui/components/ui/card';
import { AlertCircle } from 'lucide-react';
import { UrlRow } from '@app/ui/components/ui/url-row';
import { getApiBaseUrl, getEnvironmentLabel, getMcpBaseUrl } from '@/shared/lib/access-environments';
import { ConsoleFeatureGuard } from '@/components/feature-guard';

export default function OAuthClientsPage() {
  const apiBaseUrl = useMemo(() => getApiBaseUrl(), []);
  const environmentLabel = useMemo(() => getEnvironmentLabel(apiBaseUrl), [apiBaseUrl]);
  const mcpBaseUrl = useMemo(() => getMcpBaseUrl(apiBaseUrl), [apiBaseUrl]);
  const oauthMetadataUrl = `${mcpBaseUrl}/.well-known/oauth-authorization-server`;

  return (
    <ConsoleFeatureGuard entitlementKey="oauth_clients">
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">OAuth Clients</h1>
          <p className="text-muted-foreground mt-1">
            Register apps that need users to sign in and approve access before reading or writing platform data.
          </p>
        </div>

        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <span>
              AI assistants like Claude and ChatGPT register automatically when you connect them. Use this page only if
              you need to control redirect URIs and scopes yourself.
            </span>
            <a
              href="/developer/ai-assistants"
              className="text-sm font-medium text-foreground underline underline-offset-4"
            >
              Set up AI Assistants
            </a>
          </AlertDescription>
        </Alert>

        {/* Current environment */}
        <Card>
          <CardContent className="pt-6 space-y-3">
            <div className="flex items-center gap-2">
              <p className="text-sm font-medium text-foreground">Environment</p>
              <Badge variant="outline">{environmentLabel}</Badge>
            </div>
            <UrlRow label="API Base URL" value={apiBaseUrl} />
            <UrlRow label="OAuth Metadata" value={oauthMetadataUrl} />
            <p className="text-xs text-muted-foreground">
              Clients registered here are scoped to this environment. Register separately for each environment.
            </p>
          </CardContent>
        </Card>

        <OAuthClientsList />
      </div>
    </ConsoleFeatureGuard>
  );
}
