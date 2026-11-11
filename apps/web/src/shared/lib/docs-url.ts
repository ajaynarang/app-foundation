/**
 * Where the landing page's "Documentation" button points.
 *
 * The template names no repository of its own, so a product scaffolded from it
 * links to nothing it did not choose: the button shows only when
 * NEXT_PUBLIC_DOCS_URL holds an absolute http(s) URL.
 */
export function resolveDocsUrl(raw: string | undefined): string | null {
  const value = raw?.trim();
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null;
  } catch {
    return null;
  }
}
