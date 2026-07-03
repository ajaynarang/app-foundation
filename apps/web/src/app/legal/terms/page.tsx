import type { Metadata } from 'next';
import { CONTACTS } from '@appshore/web-core/shared/lib/contacts';

export const metadata: Metadata = {
  title: 'Terms of Service',
};

export default function TermsOfServicePage() {
  return (
    <>
      <h1>Terms of Service</h1>
      <p>Last updated: {new Date().getFullYear()}</p>

      <h2>1. Agreement</h2>
      <p>
        By creating an account or using the service, you agree to these Terms of Service and our Privacy Policy. If you
        use the service on behalf of an organization, you represent that you have authority to bind that organization.
      </p>

      <h2>2. Your account</h2>
      <p>
        You are responsible for safeguarding your credentials and for all activity under your account. Notify us
        immediately of any unauthorized use.
      </p>

      <h2>3. Acceptable use</h2>
      <ul>
        <li>Do not misuse the service, interfere with its operation, or attempt to access it by unauthorized means.</li>
        <li>Do not upload unlawful content or content that infringes the rights of others.</li>
        <li>Do not resell or sublicense the service without our written consent.</li>
      </ul>

      <h2>4. Billing</h2>
      <p>
        Paid plans are billed in advance on a recurring basis. Fees are non-refundable except where required by law or
        stated otherwise in your order.
      </p>

      <h2>5. Termination</h2>
      <p>
        You may stop using the service at any time. We may suspend or terminate access for breach of these terms. Upon
        termination, your right to use the service ceases, and we may delete your data after a reasonable export window.
      </p>

      <h2>6. Disclaimers and liability</h2>
      <p>
        The service is provided &quot;as is&quot; without warranties of any kind. To the maximum extent permitted by
        law, our aggregate liability is limited to the amounts you paid us in the twelve months preceding the claim.
      </p>

      <h2>7. Contact</h2>
      <p>Questions about these terms? Email {CONTACTS.legal}.</p>
    </>
  );
}
