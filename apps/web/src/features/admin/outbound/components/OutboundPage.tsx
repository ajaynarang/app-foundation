'use client';

import { Card, CardContent } from '@app/ui/components/ui/card';
import { ListErrorState, PageHeader, PageLoadingSkeleton } from '@/shared/components/page-chrome';
import { useOutboundStatus } from '../hooks';
import { AllowListSection } from './AllowListSection';
import { HeldBackSection } from './HeldBackSection';

/**
 * Super-admin Outbound (ADR "Outbound gate"): whether this environment sends to everyone, and when it does not, who
 * it may still message and what it held back. The allow-list mode wears the staging marker's caution colour.
 */
export function OutboundPage() {
  const status = useOutboundStatus();

  return (
    <div className="space-y-6">
      <PageHeader title="Outbound" subtitle="Who this environment may email, text, push or call back" />

      {status.isLoading ? (
        <PageLoadingSkeleton variant="cards" rows={1} />
      ) : status.isError || !status.data ? (
        <ListErrorState
          title="Couldn't load the outbound settings."
          error={status.error}
          onRetry={() => status.refetch()}
          isRetrying={status.isRefetching}
        />
      ) : status.data.isLive ? (
        <Card>
          <CardContent className="space-y-1 p-6">
            <p className="font-medium text-foreground">Live: every message is sent</p>
            <p className="text-sm text-muted-foreground">
              Every email, text, push notification, WhatsApp message and webhook goes to its real recipient. The
              allow-list is used only outside production.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <Card className="border-caution/40 bg-caution/5" data-outbound-mode="allowlist">
            <CardContent className="space-y-1 p-6">
              <p className="font-medium text-foreground">Allow-list only: {status.data.environment} environment</p>
              <p className="text-sm text-muted-foreground">
                Messages go only to the recipients below and are marked [STAGING] (texts STG:, push [STG]). Everyone
                else is held back, so real customers never hear from this environment.
                {status.data.bootstrapEntries > 0 &&
                  ` ${status.data.bootstrapEntries} more ${
                    status.data.bootstrapEntries === 1 ? 'entry comes' : 'entries come'
                  } from OUTBOUND_ALLOWLIST_BOOTSTRAP.`}
              </p>
            </CardContent>
          </Card>
          <AllowListSection />
          <HeldBackSection />
        </>
      )}
    </div>
  );
}
