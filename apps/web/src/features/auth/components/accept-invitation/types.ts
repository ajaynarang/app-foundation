import { getDefaultRouteForRole, type UserRole } from '@appshore/web-core/shared/lib/navigation';
import { buildTenantRedirectUrl } from '@appshore/web-core/shared/lib/tenant-url';

/** `POST /invitations/preview`: what the acceptance page shows. The inviter by name only, never their email. */
export interface InvitationDetails {
  invitationId: string;
  email?: string | null;
  phone?: string | null;
  inviteChannel?: 'EMAIL' | 'SMS';
  firstName: string;
  lastName: string;
  role: string;
  tenant: { tenantId: string; companyName: string; subdomain: string | null };
  invitedBy: { firstName: string; lastName: string };
  expiresAt: string;
}

/** The signed-in session an accept answers (the refresh token is in its httpOnly cookie, never here). */
export interface AcceptedSession {
  accessToken: string;
  user: { role: string; [key: string]: unknown };
}

/**
 * Where a new session goes: the role's home, on the workspace's own subdomain through the auth relay when it has one
 * (localStorage is per origin), else on this host.
 */
export function goToWorkspace(subdomain: string | null, session: AcceptedSession, push: (href: string) => void) {
  const home = getDefaultRouteForRole(session.user.role as UserRole);
  if (subdomain) {
    const relayUrl = buildTenantRedirectUrl(subdomain, home, session.accessToken, session.user);
    if (relayUrl) {
      window.location.href = relayUrl;
      return;
    }
  }
  push(home);
}
