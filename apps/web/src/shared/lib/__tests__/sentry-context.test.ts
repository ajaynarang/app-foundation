import * as Sentry from '@sentry/nextjs';
import { syncSentryAuthTags } from '@appshore/web-core/shared/lib/sentry-context';

/**
 * Reads the real SDK's scope rather than mocking it: web-core and the web app resolve two copies of `@sentry/nextjs`
 * (pnpm peer variants) that share one global scope, so a mock of the web app's copy would never see the call.
 */
function scopeTags(): Record<string, unknown> {
  return Sentry.getIsolationScope().getScopeData().tags;
}

describe('syncSentryAuthTags', () => {
  // The backend tags the public id as `tenantId` (docs/observability.md): one search finds a tenant on both surfaces.
  it('tags the tenant public id under the backend key `tenantId`, and the role', () => {
    syncSentryAuthTags({ tenantId: 'ten_a', role: 'OWNER' });

    expect(scopeTags()).toEqual(expect.objectContaining({ tenantId: 'ten_a', role: 'OWNER' }));
    expect(scopeTags()).not.toHaveProperty('tenant');
  });

  it('clears both tags on sign-out', () => {
    syncSentryAuthTags({ tenantId: 'ten_a', role: 'OWNER' });
    syncSentryAuthTags(null);

    expect(scopeTags().tenantId).toBeUndefined();
    expect(scopeTags().role).toBeUndefined();
  });
});
