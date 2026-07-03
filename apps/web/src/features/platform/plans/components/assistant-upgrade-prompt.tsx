'use client';

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { upgradeRegistry } from '../config/upgrade-registry';
import { Sparkles } from 'lucide-react';
import { Button } from '@app/ui/components/ui/button';
import { apiClient } from '@appshore/web-core/shared/lib/api';
import { showSuccess, showError } from '@appshore/web-core/shared/lib/toast';
import { useUpgradeUrl } from '../hooks/use-upgrade-url';
import { CONTACTS, mailto } from '@appshore/web-core/shared/lib/contacts';
import { extractErrorMessage } from '@appshore/web-core/shared/lib/error-utils';

interface AssistantUpgradePromptProps {
  feature: string;
}

export function AssistantUpgradePrompt({ feature }: AssistantUpgradePromptProps) {
  const config = upgradeRegistry[feature];
  const { upgradeUrl, isPaymentMode, canManageBilling } = useUpgradeUrl();

  if (!config) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center bg-background px-4">
        <div className="text-center max-w-md">
          <Sparkles className="h-10 w-10 text-amber-500 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-foreground mb-2">Upgrade Required</h2>
          <p className="text-sm text-muted-foreground mb-6">
            {canManageBilling
              ? isPaymentMode
                ? 'This feature requires a higher plan. Upgrade your plan to unlock it.'
                : 'This feature requires a higher plan. Contact sales to upgrade.'
              : 'This feature requires a higher plan. Ask your account admin to upgrade.'}
          </p>
          {canManageBilling && (
            <a
              href={isPaymentMode ? upgradeUrl : mailto('app', 'Plan Upgrade Inquiry')}
              className="inline-flex items-center justify-center rounded-md text-sm font-medium h-10 px-4 py-2 bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              {isPaymentMode ? 'Upgrade Now' : 'Contact Sales'}
            </a>
          )}
        </div>
      </div>
    );
  }

  if (config.isAddOn) {
    return <AddOnUpsellCard feature={feature} />;
  }

  return <PlanUpgradeCard feature={feature} />;
}

// ---------------------------------------------------------------------------
// Add-on upsell card — "Request from the Assistant"
// ---------------------------------------------------------------------------
function AddOnUpsellCard({ feature }: { feature: string }) {
  const config = upgradeRegistry[feature]!;
  const Icon = config.icon;
  const [requested, setRequested] = useState(false);
  const { canManageBilling } = useUpgradeUrl();

  const { mutate: requestAddOn, isPending } = useMutation({
    mutationFn: () =>
      apiClient(`/add-ons/${config.addOnSlug}/request`, {
        method: 'POST',
        body: JSON.stringify({}),
      }),
    onSuccess: () => {
      setRequested(true);
      showSuccess('Request sent! The Assistant team will review and activate it for you.');
    },
    onError: (error: Error) => {
      showError('Could not send request', extractErrorMessage(error));
    },
  });

  return (
    <div className="flex items-center justify-center min-h-[60vh] bg-background px-4">
      <div className="bg-card border border-border rounded-2xl p-8 max-w-md w-full text-center">
        <Icon className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
        <h2 className="text-xl font-bold text-foreground">{config.displayName}</h2>
        <p className="text-muted-foreground mt-2 text-sm">{config.description}</p>

        <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 mt-4 text-sm text-muted-foreground">
          {config.benefits.slice(0, 4).map((b) => (
            <span key={b} className="flex items-center gap-1">
              <span className="text-violet-400">&#10003;</span> {b}
            </span>
          ))}
        </div>

        <div className="mt-6">
          <div className="text-violet-400 font-bold text-2xl">{config.addOnPrice}</div>
        </div>

        {canManageBilling ? (
          requested ? (
            <div className="mt-4 text-sm text-muted-foreground">
              Your request has been submitted. We will review it shortly.
            </div>
          ) : (
            <Button className="mt-4" onClick={() => requestAddOn()} loading={isPending}>
              Request from the Assistant
            </Button>
          )
        ) : (
          <p className="mt-4 text-sm text-muted-foreground">Ask your account admin to request this add-on.</p>
        )}

        <p className="text-xs text-muted-foreground mt-3">
          Our team will review your request and activate it for you.
          <br />
          Usually within 24 hours. Questions? {CONTACTS.support}
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Plan upgrade card — existing behavior for entitlement features
// ---------------------------------------------------------------------------
function PlanUpgradeCard({ feature }: { feature: string }) {
  const config = upgradeRegistry[feature]!;
  const Icon = config.icon;
  const { upgradeUrl, isPaymentMode, canManageBilling } = useUpgradeUrl();

  return (
    <div className="min-h-[60vh] flex items-center justify-center bg-background px-4">
      <div className="max-w-2xl w-full">
        <div className="flex items-start gap-4 mb-8">
          {/* Assistant avatar */}
          <div className="w-10 h-10 rounded-full bg-foreground text-background flex items-center justify-center font-bold font-space-grotesk text-sm flex-shrink-0">
            S
          </div>

          {/* Assistant's message */}
          <div className="flex-1 bg-card border border-border rounded-xl p-5">
            <div className="flex items-center gap-2 mb-3">
              <Icon className="h-5 w-5 text-amber-500" />
              <span className="text-sm font-semibold text-foreground">{config.displayName}</span>
            </div>

            <p className="text-sm text-foreground mb-2">
              This feature is available on the{' '}
              <span className="font-semibold text-amber-500">{config.requiredPlan}</span> plan.
            </p>
            <p className="text-sm text-muted-foreground mb-5">
              {canManageBilling ? config.description : `${config.description} Ask your account admin to upgrade.`}
            </p>

            {/* Benefits */}
            <div className="space-y-2 mb-6">
              {config.benefits.map((benefit, i) => (
                <div key={i} className="flex items-start gap-2 text-sm">
                  <span className="text-muted-foreground mt-0.5">&#10003;</span>
                  <span className="text-muted-foreground">{benefit}</span>
                </div>
              ))}
            </div>

            {/* CTAs — only for ADMIN/OWNER */}
            {canManageBilling ? (
              <div className="flex gap-3">
                <a
                  href={isPaymentMode ? upgradeUrl : mailto('app', `Upgrade to ${config.requiredPlan}`)}
                  className="inline-flex items-center justify-center rounded-md text-sm font-medium h-10 px-4 py-2 bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
                >
                  Upgrade to {config.requiredPlan}
                </a>
                {!isPaymentMode && (
                  <a
                    href={mailto('app', `Learn more about ${config.displayName}`)}
                    className="inline-flex items-center justify-center rounded-md text-sm font-medium h-10 px-4 py-2 border border-input bg-background hover:bg-muted hover:text-foreground transition-colors"
                  >
                    Contact Sales
                  </a>
                )}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
