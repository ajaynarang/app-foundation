/**
 * The canonical actionUrl namespace for notifications.
 *
 * actionUrl is one string serving three surfaces: the web inbox
 * (router.push), the mobile inbox, and the mobile push tap (the latter two
 * both flow through PushMessage.deepLinkRoute). Canonical = WEB routes,
 * because web navigates them verbatim; mobile maps the two web-shaped
 * families (…/entries, …/schedule) to its native routes, and
 * /categories/:id/bracket is the one legacy exception mobile renders
 * natively while web maps it to /tournaments/:id/draws via row metadata.
 *
 * CONTRACT MIRROR: apps/mobile/lib/core/push/push_message.dart
 * (_allowedRoutes + _mapWebRoute) and
 * apps/web/src/shared/components/layout/resolve-action-url.ts.
 * Change one side → change the others.
 */
export const CANONICAL_ACTION_URL_PATTERN = new RegExp(
  '^(' +
    'console:/[^#]+' + // super-admin console links (web-only by design)
    '|/tournaments/\\d+(/(entries|schedule|results))?' +
    '|/categories/\\d+/bracket' +
    '|/sessions' + // club play sessions (E38) — mobile maps to Home; web inbox renders it unlinked
    '|/my-matches' + // friendlies (E65) — mobile Matches tab; web inbox renders it unlinked
    '|/players' + // membership requests queue (E43) — mobile Players tab / web Players page
    '|/settings/billing' + // plan & trial (E42) — web verbatim; mobile maps to Home until E42-3
    '|/chat/club' + // community chat club room (E89-3) — mobile route; web inbox renders it unlinked
    '|/chat/tournament/\\d+' + // community chat tournament room (E89-3/4) — mobile route; web inbox renders it unlinked
    '|/settings/coaches' + // the club's coach roster (E91) — web verbatim; mobile has no club-coaches screen yet
    '|/coaching/enquiries' + // the coach's own enquiry inbox (E91) — mobile route; web inbox renders it unlinked
    '|/coach/\\d+' + // a coach's public storefront (E91) — the player's own enquiry status lives on it
    '|/coaching/mine' + // the family's own coaching (E94-6) — mobile route; web inbox renders it unlinked
    ')(\\?[^#]*)?$',
);

/**
 * Route builders — the only way triggers should construct an actionUrl.
 * Hand-typing the template invites a typo the contract spec is the last
 * line of defense against; these are co-located with the pattern so they
 * cannot drift from it.
 */
export const tournamentUrl = (tournamentId: number) => `/tournaments/${tournamentId}`;
export const tournamentEntriesUrl = (tournamentId: number) => `/tournaments/${tournamentId}/entries`;
export const tournamentScheduleUrl = (tournamentId: number) => `/tournaments/${tournamentId}/schedule`;
export const categoryBracketUrl = (categoryId: number) => `/categories/${categoryId}/bracket`;
export const sessionsUrl = () => '/sessions';
export const myMatchesUrl = () => '/my-matches';
export const playersUrl = () => '/players';
export const billingSettingsUrl = () => '/settings/billing';
export const clubChatUrl = () => '/chat/club';
export const tournamentChatUrl = (tournamentId: number) => `/chat/tournament/${tournamentId}`;
export const clubCoachesUrl = () => '/settings/coaches';
export const coachEnquiriesUrl = () => '/coaching/enquiries';
export const coachUrl = (coachUserId: number) => `/coach/${coachUserId}`;
/** The FAMILY's side — where a cancelled or added class is actually visible. */
export const myCoachingUrl = () => '/coaching/mine';
