'use client';

import { useAuth } from '@/features/auth/hooks/use-auth';

interface SallyInternalsSectionProps {
  kind: 'oauth_client' | 'api_key';
  entityId: string;
  rateLimitPerMinute?: number;
}

/**
 * SUPER_ADMIN-only inline panel — trust tier, rate limit, daily budget,
 * spend-to-date, model cost. Phase D renders placeholders for budget +
 * spend (future metering work).
 *
 * Returns `null` for every non-SUPER_ADMIN user — by design, so tenant
 * admins never even see the section.
 */
export function SallyInternalsSection({ kind, rateLimitPerMinute }: SallyInternalsSectionProps) {
  const { isSuperAdmin } = useAuth();
  if (!isSuperAdmin) return null;

  const trustTier = 'Tier 3 — third-party';
  const effectiveLimit = rateLimitPerMinute ?? (kind === 'oauth_client' ? 120 : 300);

  return (
    <div className="mt-6 rounded-md border border-dashed border-border bg-muted/30 p-4">
      <h4 className="text-sm font-semibold text-foreground">Sally internals</h4>
      <p className="text-xs text-muted-foreground">SUPER_ADMIN view — not rendered for tenant users.</p>
      <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
        <div>
          <dt className="text-xs text-muted-foreground">Trust tier</dt>
          <dd className="text-foreground">{trustTier}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Rate limit</dt>
          <dd className="text-foreground">{effectiveLimit}/min</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Daily budget</dt>
          <dd className="text-foreground">Not set</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Spend-to-date</dt>
          <dd className="text-foreground">—</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Model cost</dt>
          <dd className="text-foreground">—</dd>
        </div>
      </dl>
    </div>
  );
}
