import { redirect } from 'next/navigation';
import { withQuery, type PageSearchParams } from '@/shared/lib/with-query';

/** /settings has no screen of its own. The query string travels with the redirect. */
export default async function SettingsPage({ searchParams }: { searchParams: Promise<PageSearchParams> }) {
  redirect(withQuery('/settings/general', await searchParams));
}
