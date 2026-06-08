import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';

const isDocsOnly = process.env.NEXT_PUBLIC_DOCS_ONLY_MODE === 'true';

export default async function RootPage() {
  // Docs-only mode: always go straight to docs, skip auth check
  if (isDocsOnly) {
    redirect('/docs');
  }

  const cookieStore = await cookies();
  const authCookie = cookieStore.get('sally-auth');

  if (authCookie?.value) {
    redirect('/overview');
  }

  // No auth cookie — redirect to docs landing (public page)
  redirect('/docs');
}
