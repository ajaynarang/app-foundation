/**
 * The result of an integration's OAuth round trip.
 *
 * The backend callback (GET /integrations/oauth/callback) sends the browser
 * back to a Settings screen with `?oauth=connected|error&vendor=<VENDOR>`.
 * These helpers turn that query into the message to show and strip it again.
 */

const STATUS_KEY = 'oauth';
const VENDOR_KEY = 'vendor';

export interface OAuthReturn {
  status: 'connected' | 'error';
  title: string;
  description?: string;
}

type QueryReader = Pick<URLSearchParams, 'get'>;

/**
 * A display name for the vendor code, or null when there is none worth showing.
 * The value comes from the URL, so anything but a short plain code is dropped.
 */
function vendorLabel(raw: string | null): string | null {
  if (!raw || raw === 'unknown' || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,39}$/.test(raw)) return null;
  return raw
    .split(/[_-]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

export function readOAuthReturn(params: QueryReader): OAuthReturn | null {
  const status = params.get(STATUS_KEY);
  if (status !== 'connected' && status !== 'error') return null;

  const vendor = vendorLabel(params.get(VENDOR_KEY));
  if (status === 'connected') {
    return { status, title: vendor ? `${vendor} connected` : 'Integration connected' };
  }
  return {
    status,
    title: `Could not connect ${vendor ?? 'the integration'}`,
    description: 'The connection was not completed. Please try again.',
  };
}

/** The same URL without the result keys, so a reload does not repeat the message. */
export function withoutOAuthReturn(pathname: string, params: URLSearchParams): string {
  const rest = new URLSearchParams(params);
  rest.delete(STATUS_KEY);
  rest.delete(VENDOR_KEY);
  const text = rest.toString();
  return text ? `${pathname}?${text}` : pathname;
}
