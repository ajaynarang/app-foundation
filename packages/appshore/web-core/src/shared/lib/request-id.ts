/**
 * Request correlation between a web error in Sentry and the backend's logs. The backend's request-context
 * middleware echoes the id it logged under on every response, and its CORS policy exposes the header so a browser
 * can read it.
 */
export const REQUEST_ID_HEADER = 'X-Request-Id';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isRequestId(value: unknown): value is string {
  return typeof value === 'string' && UUID_PATTERN.test(value);
}

/** The id the backend logged this response under, or undefined when the header is missing or malformed. */
export function resolveRequestId(response: Pick<Response, 'headers'> | undefined): string | undefined {
  const echoed = response?.headers?.get(REQUEST_ID_HEADER);
  return isRequestId(echoed) ? echoed : undefined;
}
