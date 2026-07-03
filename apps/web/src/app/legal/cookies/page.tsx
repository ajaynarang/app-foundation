import type { Metadata } from 'next';
import { CONTACTS } from '@appshore/web-core/shared/lib/contacts';

export const metadata: Metadata = {
  title: 'Cookie Policy',
};

export default function CookiePolicyPage() {
  return (
    <>
      <h1>Cookie Policy</h1>
      <p>Last updated: {new Date().getFullYear()}</p>

      <h2>1. What cookies we use</h2>
      <ul>
        <li>
          <strong>Strictly necessary</strong> — authentication, session, and security cookies required for the service
          to function. These cannot be disabled.
        </li>
        <li>
          <strong>Preferences</strong> — remember settings such as theme and layout choices.
        </li>
        <li>
          <strong>Analytics</strong> — help us understand how the service is used so we can improve it. These are only
          set with your consent.
        </li>
      </ul>

      <h2>2. Managing cookies</h2>
      <p>
        You can change your consent at any time via the &quot;Cookie Preferences&quot; link in the footer, or through
        your browser settings. Blocking strictly necessary cookies may break core functionality such as signing in.
      </p>

      <h2>3. Contact</h2>
      <p>Questions about cookies? Email {CONTACTS.legal}.</p>
    </>
  );
}
