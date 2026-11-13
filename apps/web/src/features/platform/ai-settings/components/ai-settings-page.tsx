'use client';

import { useState } from 'react';
import { KeyRound } from 'lucide-react';
import { TENANCY_MODE } from '@appshore/web-core/shared/lib/navigation';
import { AiCredentialType, USER_ROLES } from '@app/shared-types';
import type { AiCredentialType as AiCredentialTypeT, AiSettings, PasteKeyCredentialType } from '@app/shared-types';
import {
  ListErrorState,
  PageEmptyState,
  PageHeader,
  PageLoadingSkeleton,
  PageSection,
  PageToolbar,
} from '@/shared/components/page-chrome';
import { useAuthStore } from '@/features/auth';
import { aiSettingsCopy, isPasteKeyType, type AiSettingsCopy } from '../constants';
import { useAiSettings } from '../hooks/use-ai-settings';
import { AddCredentialMenu } from './add-credential-menu';
import { ConnectBedrockSheet } from './connect-bedrock-sheet';
import { ConnectKeyDialog } from './connect-key-dialog';
import { CredentialCard } from './credential-card';
import { RetentionPolicyCard } from './retention-policy-card';
import { WhoPaysCard } from './who-pays-card';

/**
 * AI Keys: the retention policy, who pays for each need right now, and the workspace's own AI credentials. The owner
 * manages; an admin reads. With bring-your-own-key off on this deployment the credential section is hidden, unless
 * keys are still stored, which can then only be removed.
 */
export function AiSettingsPage() {
  const isOwner = useAuthStore((state) => state.user?.role) === USER_ROLES.OWNER;
  const { data: settings, isLoading, isError, error, refetch, isRefetching } = useAiSettings();
  const copy = aiSettingsCopy(TENANCY_MODE);

  const [keyDialogType, setKeyDialogType] = useState<PasteKeyCredentialType | null>(null);
  const [isBedrockOpen, setIsBedrockOpen] = useState(false);

  const handleAdd = (type: AiCredentialTypeT) => {
    if (type === AiCredentialType.BEDROCK_ROLE) setIsBedrockOpen(true);
    else if (isPasteKeyType(type)) setKeyDialogType(type);
  };

  const canAdd = isOwner && !!settings?.byokEnabled;

  return (
    <div className="space-y-8">
      <PageHeader
        title={copy.title}
        subtitle={copy.subtitle}
        actions={
          canAdd && settings ? (
            <PageToolbar primaryAction={<AddCredentialMenu policy={settings.policy} onSelect={handleAdd} />} />
          ) : undefined
        }
      />

      {isLoading ? (
        <PageLoadingSkeleton variant="cards" rows={3} />
      ) : isError || !settings ? (
        <ListErrorState
          title="Couldn't load the AI settings."
          error={error}
          onRetry={() => refetch()}
          isRetrying={isRefetching}
        />
      ) : (
        <>
          <RetentionPolicyCard policy={settings.policy} isOwner={isOwner} ownerOnlyText={copy.ownerOnly} />
          <WhoPaysCard payers={settings.payers} credentials={settings.credentials} />
          {(settings.byokEnabled || settings.credentials.length > 0) && (
            <CredentialsSection settings={settings} isOwner={isOwner} copy={copy} />
          )}
        </>
      )}

      {keyDialogType && settings && (
        <ConnectKeyDialog
          open
          onOpenChange={(open) => !open && setKeyDialogType(null)}
          type={keyDialogType}
          policy={settings.policy}
        />
      )}
      {canAdd && <ConnectBedrockSheet open={isBedrockOpen} onOpenChange={setIsBedrockOpen} />}
    </div>
  );
}

interface CredentialsSectionProps {
  settings: AiSettings;
  isOwner: boolean;
  copy: AiSettingsCopy;
}

function CredentialsSection({ settings, isOwner, copy }: CredentialsSectionProps) {
  return (
    <PageSection title={copy.credentialsTitle} description={copy.credentialsDescription}>
      {settings.credentials.length === 0 ? (
        <PageEmptyState icon={KeyRound} title={copy.emptyTitle} description={copy.emptyDescription} />
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {settings.credentials.map((credential) => (
            <CredentialCard
              key={credential.publicId}
              credential={credential}
              isOwner={isOwner}
              canTest={settings.byokEnabled}
            />
          ))}
        </div>
      )}
    </PageSection>
  );
}
