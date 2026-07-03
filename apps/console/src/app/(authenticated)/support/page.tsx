import { redirect } from 'next/navigation';

/**
 * Console support page — redirects to the support page in the main web app
 * where the ticket management UI lives.
 */
export default function ConsoleSupportRedirect() {
  const appBase = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  redirect(`${appBase}/settings/support`);
}
