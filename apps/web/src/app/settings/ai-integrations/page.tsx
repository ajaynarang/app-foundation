'use client';

import { useState, useMemo } from 'react';
import { MessageSquare, Bot, Globe, Monitor, BookOpen } from 'lucide-react';

import { Card, CardContent } from '@app/ui/components/ui/card';
import { Badge } from '@app/ui/components/ui/badge';
import { Alert, AlertDescription } from '@app/ui/components/ui/alert';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@app/ui/components/ui/sheet';
import { Separator } from '@app/ui/components/ui/separator';
import { UrlRow } from '@app/ui/components/ui/url-row';
import { getApiBaseUrl, getEnvironmentLabel, getMcpBaseUrl } from '@appshore/web-core/shared/lib/access-environments';

interface Platform {
  id: string;
  name: string;
  description: string;
  icon: React.ElementType;
  tag: string;
  color: string;
}

const platforms: Platform[] = [
  {
    id: 'claude-connector',
    name: 'Claude.ai',
    description: 'Connect the platform as an MCP Connector in Claude.ai. Paste your URL and sign in.',
    icon: MessageSquare,
    tag: 'MCP Connector',
    color: 'bg-orange-500/10 dark:bg-orange-500/20 text-orange-600 dark:text-orange-400',
  },
  {
    id: 'claude-desktop',
    name: 'Claude Desktop',
    description: 'Add the platform as a connector in the Claude Desktop app. Same flow as Claude.ai.',
    icon: Monitor,
    tag: 'MCP Connector',
    color: 'bg-purple-500/10 dark:bg-purple-500/20 text-purple-600 dark:text-purple-400',
  },
  {
    id: 'chatgpt',
    name: 'ChatGPT',
    description: 'Connect the platform as an MCP app in ChatGPT. Paste your server URL and sign in.',
    icon: Bot,
    tag: 'MCP App',
    color: 'bg-green-500/10 dark:bg-green-500/20 text-green-600 dark:text-green-400',
  },
  {
    id: 'mcp-clients',
    name: 'Any MCP Client',
    description: 'Connect any MCP-compatible client using the standard protocol.',
    icon: Globe,
    tag: 'Open Standard',
    color: 'bg-gray-500/10 dark:bg-gray-500/20 text-gray-600 dark:text-gray-400',
  },
];

function PlatformDetailSheet({
  platform,
  open,
  onOpenChange,
}: {
  platform: Platform | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const apiBaseUrl = getApiBaseUrl();
  const mcpUrl = getMcpBaseUrl(apiBaseUrl);
  const oauthMetadataUrl = `${mcpUrl}/.well-known/oauth-authorization-server`;

  if (!platform) return null;

  const Icon = platform.icon;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-lg p-6 overflow-y-auto" pinnable resizable>
        <SheetHeader className="pb-4">
          <div className="flex items-center gap-3">
            <div className={`inline-flex items-center justify-center w-10 h-10 rounded-xl ${platform.color}`}>
              <Icon className="h-5 w-5" />
            </div>
            <div>
              <SheetTitle>{platform.name}</SheetTitle>
              <Badge variant="muted" className="text-2xs tracking-wider uppercase mt-1">
                {platform.tag}
              </Badge>
            </div>
          </div>
        </SheetHeader>

        <div className="space-y-6">
          {/* Connection URLs */}
          <div>
            <h3 className="text-sm font-semibold text-foreground mb-3">Connection URL</h3>
            <div className="space-y-2">
              {(platform.id === 'claude-connector' || platform.id === 'claude-desktop') && (
                <>
                  <UrlRow label="Connector URL" value={mcpUrl} />
                  <p className="text-xs text-muted-foreground mt-1">
                    Endpoints are discovered automatically via OAuth metadata.
                  </p>
                </>
              )}

              {platform.id === 'chatgpt' && (
                <>
                  <UrlRow label="MCP Server URL" value={mcpUrl} />
                  <p className="text-xs text-muted-foreground mt-1">
                    ChatGPT discovers OAuth endpoints automatically. Use the server URL directly.
                  </p>
                </>
              )}

              {platform.id === 'mcp-clients' && <UrlRow label="MCP Server URL" value={mcpUrl} />}
            </div>
          </div>

          <Separator />

          {/* Quick Setup */}
          <div>
            <h3 className="text-sm font-semibold text-foreground mb-3">Quick Setup</h3>
            <div className="space-y-3">
              {(platform.id === 'claude-connector' || platform.id === 'claude-desktop') && (
                <ol className="space-y-2 text-sm text-muted-foreground">
                  <li className="flex gap-2">
                    <span className="font-mono text-foreground shrink-0">1.</span> Open{' '}
                    <strong className="text-foreground">
                      {platform.id === 'claude-connector' ? 'claude.ai' : 'Claude Desktop'}
                    </strong>{' '}
                    &rarr; click your profile icon &rarr; <strong className="text-foreground">Customize</strong>
                  </li>
                  <li className="flex gap-2">
                    <span className="font-mono text-foreground shrink-0">2.</span> Go to{' '}
                    <strong className="text-foreground">Connectors</strong> in the left sidebar
                  </li>
                  <li className="flex gap-2">
                    <span className="font-mono text-foreground shrink-0">3.</span> Click the{' '}
                    <strong className="text-foreground">+</strong> button to add a connector
                  </li>
                  <li className="flex gap-2">
                    <span className="font-mono text-foreground shrink-0">4.</span> Paste the Connector URL above and
                    click <strong className="text-foreground">Connect</strong>
                  </li>
                  <li className="flex gap-2">
                    <span className="font-mono text-foreground shrink-0">5.</span> Sign in with your platform
                    credentials and approve access
                  </li>
                  <li className="flex gap-2">
                    <span className="font-mono text-foreground shrink-0">6.</span> Start chatting -- ask Claude about
                    your data, records, invoices, and more
                  </li>
                </ol>
              )}

              {platform.id === 'chatgpt' && (
                <ol className="space-y-2 text-sm text-muted-foreground">
                  <li className="flex gap-2">
                    <span className="font-mono text-foreground shrink-0">1.</span> Open chatgpt.com &rarr; Settings
                    &rarr; Apps
                  </li>
                  <li className="flex gap-2">
                    <span className="font-mono text-foreground shrink-0">2.</span> Click Advanced settings &rarr; Enable{' '}
                    <strong className="text-foreground">Developer mode</strong>
                  </li>
                  <li className="flex gap-2">
                    <span className="font-mono text-foreground shrink-0">3.</span> Click &quot;Create app&quot; and
                    paste the MCP Server URL above
                  </li>
                  <li className="flex gap-2">
                    <span className="font-mono text-foreground shrink-0">4.</span> Set Authentication to
                    &quot;OAuth&quot; and confirm trust
                  </li>
                  <li className="flex gap-2">
                    <span className="font-mono text-foreground shrink-0">5.</span> Complete the OAuth login with your
                    platform credentials
                  </li>
                </ol>
              )}

              {platform.id === 'mcp-clients' && (
                <>
                  <UrlRow label="OAuth Metadata" value={oauthMetadataUrl} />
                  <p className="text-sm text-muted-foreground">
                    The platform uses OAuth 2.1 with PKCE (S256). Dynamic client registration is supported. Send
                    JSON-RPC 2.0 requests to the server URL with a Bearer token.
                  </p>
                </>
              )}
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

export default function AiAssistantsPage() {
  const [selectedPlatform, setSelectedPlatform] = useState<Platform | null>(null);
  const apiBaseUrl = useMemo(() => getApiBaseUrl(), []);
  const environmentLabel = useMemo(() => getEnvironmentLabel(apiBaseUrl), [apiBaseUrl]);
  const mcpUrl = useMemo(() => getMcpBaseUrl(apiBaseUrl), [apiBaseUrl]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-foreground">AI Assistants</h2>
        <p className="text-sm text-muted-foreground">Give AI assistants access to your workspace data via MCP</p>
      </div>

      <Alert>
        <BookOpen className="h-4 w-4" />
        <AlertDescription className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <span>Want to register your own client ID and redirect URIs instead of using automatic discovery?</span>
          <a
            href="/settings/oauth-clients"
            className="text-sm font-medium text-foreground underline underline-offset-4"
          >
            Manual OAuth setup
          </a>
        </AlertDescription>
      </Alert>

      {/* Current environment */}
      <Card>
        <CardContent className="pt-6 space-y-3">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium text-foreground">MCP Server</p>
            <Badge variant="outline">{environmentLabel}</Badge>
          </div>
          <UrlRow label="MCP Server URL" value={mcpUrl} />
          <UrlRow label="API Base URL" value={apiBaseUrl} />
        </CardContent>
      </Card>

      {/* Platform cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {platforms.map((platform) => {
          const Icon = platform.icon;
          return (
            <Card
              key={platform.id}
              className="cursor-pointer hover:shadow-md hover:-translate-y-0.5 transition-all duration-200"
              onClick={() => setSelectedPlatform(platform)}
            >
              <CardContent className="pt-6">
                <div className="flex items-start gap-3">
                  <div
                    className={`inline-flex items-center justify-center w-10 h-10 rounded-xl shrink-0 ${platform.color}`}
                  >
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="text-sm font-semibold text-foreground">{platform.name}</h3>
                      <Badge variant="muted" className="text-[9px] tracking-wider uppercase">
                        {platform.tag}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed">{platform.description}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Detail sheet */}
      <PlatformDetailSheet
        platform={selectedPlatform}
        open={!!selectedPlatform}
        onOpenChange={(open) => !open && setSelectedPlatform(null)}
      />
    </div>
  );
}
