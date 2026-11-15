/** A page's `searchParams` as Next hands them to a server component. */
export type PageSearchParams = Record<string, string | string[] | undefined>;

/**
 * `path` with `searchParams` appended, for a redirect that must not drop the
 * query string (a redirecting page otherwise loses whatever the caller sent).
 */
export function withQuery(path: string, searchParams: PageSearchParams): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    for (const item of Array.isArray(value) ? value : [value]) {
      if (item !== undefined) query.append(key, item);
    }
  }
  const text = query.toString();
  return text ? `${path}?${text}` : path;
}
