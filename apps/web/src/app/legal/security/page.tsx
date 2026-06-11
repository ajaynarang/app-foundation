import type { Metadata } from 'next';
import { CONTACTS } from '@/shared/lib/contacts';

export const metadata: Metadata = {
  title: 'Security',
};

export default function SecurityPage() {
  return (
    <>
      <h1>Security</h1>
      <p>Last updated: {new Date().getFullYear()}</p>

      <h2>1. How we protect your data</h2>
      <ul>
        <li>Data is encrypted in transit (TLS) and at rest.</li>
        <li>Access to production systems is restricted, audited, and protected by multi-factor authentication.</li>
        <li>Tenant data is logically isolated and scoped on every request.</li>
        <li>Backups are taken regularly and tested for recovery.</li>
      </ul>

      <h2>2. Responsible disclosure</h2>
      <p>
        If you believe you have found a security vulnerability, please report it privately to {CONTACTS.security}. We
        ask that you give us a reasonable window to investigate and remediate before public disclosure. We do not pursue
        legal action against good-faith security research.
      </p>

      <h2>3. Contact</h2>
      <p>Security questions or reports: {CONTACTS.security}.</p>
    </>
  );
}
