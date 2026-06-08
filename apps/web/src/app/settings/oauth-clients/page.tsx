'use client';

import { useMemo } from 'react';
import { ExternalAgentsPage } from '@/features/platform/oauth-clients/components/ExternalAgentsPage';
import { Alert, AlertDescription } from '@sally/ui/components/ui/alert';
import { Badge } from '@sally/ui/components/ui/badge';
import { Card, CardContent } from '@sally/ui/components/ui/card';
import { AlertCircle } from 'lucide-react';
import { UrlRow } from '@sally/ui/components/ui/url-row';
import { getApiBaseUrl, getEnvironmentLabel, getMcpBaseUrl } from '@/shared/lib/access-environments';

export default function OAuthClientsSettingsPage() {
  const apiBaseUrl = useMemo(() => getApiBaseUrl(), []);
  const environmentLabel = useMemo(() => getEnvironmentLabel(apiBaseUrl), [apiBaseUrl]);
  const mcpBaseUrl = useMemo(() => getMcpBaseUrl(apiBaseUrl), [apiBaseUrl]);
  const oauthMetadataUrl = `${mcpBaseUrl}/.well-known/oauth-authorization-server`;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-foreground">OAuth Clients</h2>
        <p className="text-sm text-muted-foreground">
          Apps and AI agents that connect to SALLY on behalf of your users
        </p>
      </div>

      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertDescription className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <span>
            AI assistants like Claude and ChatGPT register automatically when you connect them. Use this page to control
            redirect URIs, scopes, and rotation yourself.
          </span>
          <a
            href="/settings/ai-integrations"
            className="text-sm font-medium text-foreground underline underline-offset-4"
          >
            Set up AI Assistants
          </a>
        </AlertDescription>
      </Alert>

      <Card>
        <CardContent className="pt-6 space-y-3">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium text-foreground">Environment</p>
            <Badge variant="outline">{environmentLabel}</Badge>
          </div>
          <UrlRow label="API Base URL" value={apiBaseUrl} />
          <UrlRow label="OAuth Metadata" value={oauthMetadataUrl} />
          <p className="text-xs text-muted-foreground">
            Clients registered here are scoped to this environment. Register separately for each.
          </p>
        </CardContent>
      </Card>

      <ExternalAgentsPage />
    </div>
  );
}
