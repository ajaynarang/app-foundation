'use client';

import { useMemo } from 'react';
import { FormSheet } from '@app/ui/components/ui/form-sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@app/ui/components/ui/tabs';
import type { AgentScope } from '@app/shared-types';
import { useTenantApiKeys } from '@/features/platform/api-keys';
import { useOAuthClientDetail } from '@/features/platform/oauth-clients/hooks/use-tenant-oauth-clients';
import { ScopesTab } from './ScopesTab';
import { ActivityTab } from './ActivityTab';
import { OAuthClientProfileTab } from './OAuthClientProfileTab';
import { ApiKeyProfileTab } from './ApiKeyProfileTab';
import { SallyInternalsSection } from './SallyInternalsSection';
import { AgentDetailFooterActions } from './AgentDetailFooterActions';

interface AgentDetailSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  kind: 'oauth_client' | 'api_key';
  /**
   * API-key entities use a numeric DB id (post Phase-2 Task 13a migration);
   * OAuth-client entities use a string clientId. Union accommodates both.
   */
  entityId: string | number;
}

/**
 * Shared detail sheet for both External agents (OAuth clients) and API
 * keys tabs. Three inner tabs: Profile, Scopes, Activity.
 * SUPER_ADMIN users also see the inline Sally Internals panel.
 */
export function AgentDetailSheet({ open, onOpenChange, kind, entityId }: AgentDetailSheetProps) {
  const { data: apiKeys } = useTenantApiKeys();
  const { data: oauthClient } = useOAuthClientDetail(
    kind === 'oauth_client' && typeof entityId === 'string' ? entityId : null,
  );

  const currentScopes = useMemo<AgentScope[]>(() => {
    if (kind === 'api_key') {
      const key = apiKeys?.find((k) => k.id === entityId);
      return (key?.scopes ?? []) as AgentScope[];
    }
    return (oauthClient?.scopes ?? []) as AgentScope[];
  }, [kind, apiKeys, entityId, oauthClient]);

  const ipAllowlist = useMemo<string[]>(() => {
    if (kind === 'api_key') {
      const key = apiKeys?.find((k) => k.id === entityId);
      return key?.ipAllowlist ?? [];
    }
    return [];
  }, [kind, apiKeys, entityId]);

  const rateLimitPerMinute = useMemo<number | undefined>(() => {
    if (kind === 'api_key') {
      return apiKeys?.find((k) => k.id === entityId)?.rateLimitPerMinute;
    }
    return undefined;
  }, [kind, apiKeys, entityId]);

  // Whether the entity is revoked (and therefore read-only). API keys track
  // this via `revokedAt`; OAuth clients are revoked when `isActive=false`
  // AND token revocation has cascaded (the backend refuses mutations on
  // that state). Hide the Edit-scopes button either way.
  const isRevoked = useMemo<boolean>(() => {
    if (kind === 'api_key') {
      const key = apiKeys?.find((k) => k.id === entityId);
      return !!key?.revokedAt;
    }
    // OAuth client revoked state isn't round-tripped into the list today;
    // inactive is the best proxy. When we add `revokedAt` to the OAuthClient
    // model this will tighten.
    return oauthClient ? !oauthClient.isActive : false;
  }, [kind, apiKeys, oauthClient, entityId]);

  return (
    <FormSheet
      open={open}
      onOpenChange={onOpenChange}
      title={kind === 'oauth_client' ? 'External agent' : 'API key'}
      mode="view"
      size="md"
      pinnable
      resizable
      footerExtra={isRevoked ? undefined : <AgentDetailFooterActions kind={kind} entityId={entityId} />}
    >
      <Tabs defaultValue="profile" className="w-full">
        <TabsList>
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="scopes">Scopes</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
        </TabsList>
        <TabsContent value="profile" className="mt-4">
          {kind === 'oauth_client' && typeof entityId === 'string' ? (
            <OAuthClientProfileTab clientId={entityId} />
          ) : kind === 'api_key' && typeof entityId === 'number' ? (
            <ApiKeyProfileTab apiKeyId={entityId} />
          ) : null}
        </TabsContent>
        <TabsContent value="scopes" className="mt-4">
          <ScopesTab
            kind={kind}
            entityId={entityId}
            currentScopes={currentScopes}
            ipAllowlist={ipAllowlist}
            rateLimitPerMinute={rateLimitPerMinute}
            readOnly={isRevoked}
          />
        </TabsContent>
        <TabsContent value="activity" className="mt-4">
          <ActivityTab principalKind={kind} principalId={String(entityId)} />
        </TabsContent>
      </Tabs>
      <SallyInternalsSection kind={kind} entityId={String(entityId)} rateLimitPerMinute={rateLimitPerMinute} />
    </FormSheet>
  );
}
