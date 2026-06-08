import type { Metadata } from 'next';
import Link from 'next/link';
import { CONTACTS, mailto } from '@/shared/lib/contacts';
import { AttorneyReviewBanner } from '../components/AttorneyReviewBanner';
import { LEGAL_LAST_UPDATED } from '../constants';

export const metadata: Metadata = {
  title: 'Privacy Policy | SALLY',
};

export default function PrivacyPolicyPage() {
  return (
    <div className="space-y-6">
      <AttorneyReviewBanner />

      <p className="text-xs text-muted-foreground">Last updated {LEGAL_LAST_UPDATED}</p>

      <h1 className="text-2xl md:text-3xl font-bold text-foreground">Privacy Policy</h1>

      <p className="text-sm text-muted-foreground leading-relaxed">
        SALLY (&quot;we,&quot; &quot;us,&quot; or &quot;our&quot;) is committed to protecting your privacy. This Privacy
        Policy explains how we collect, use, disclose, and safeguard your information when you use the SALLY platform,
        including our website, applications, and services (collectively, the &quot;Service&quot;).
      </p>

      {/* 1. Information We Collect */}
      <h2 id="information-we-collect" className="text-lg font-semibold text-foreground mt-10 mb-4">
        1. Information We Collect
      </h2>
      <p className="text-sm text-muted-foreground leading-relaxed">
        We collect the following categories of information when you use SALLY:
      </p>

      <h3 className="text-base font-medium text-foreground mt-6 mb-3">Account Information</h3>
      <ul className="list-disc ml-6 space-y-2">
        <li className="text-sm text-muted-foreground">Full name and contact details</li>
        <li className="text-sm text-muted-foreground">Email address</li>
        <li className="text-sm text-muted-foreground">Phone number</li>
        <li className="text-sm text-muted-foreground">Company name and role</li>
      </ul>

      <h3 className="text-base font-medium text-foreground mt-6 mb-3">Fleet Data</h3>
      <ul className="list-disc ml-6 space-y-2">
        <li className="text-sm text-muted-foreground">Driver records and profiles</li>
        <li className="text-sm text-muted-foreground">Vehicle information and telematics data</li>
        <li className="text-sm text-muted-foreground">Load details (origin, destination, weight, equipment type)</li>
        <li className="text-sm text-muted-foreground">Hours of Service (HOS) data</li>
        <li className="text-sm text-muted-foreground">Location and GPS tracking data</li>
      </ul>

      <h3 className="text-base font-medium text-foreground mt-6 mb-3">Uploaded Documents</h3>
      <ul className="list-disc ml-6 space-y-2">
        <li className="text-sm text-muted-foreground">Rate confirmations</li>
        <li className="text-sm text-muted-foreground">Bills of Lading (BOLs)</li>
        <li className="text-sm text-muted-foreground">Insurance documents</li>
      </ul>

      <h3 className="text-base font-medium text-foreground mt-6 mb-3">Usage Data</h3>
      <ul className="list-disc ml-6 space-y-2">
        <li className="text-sm text-muted-foreground">Feature usage and interaction patterns</li>
        <li className="text-sm text-muted-foreground">Page views and navigation paths</li>
        <li className="text-sm text-muted-foreground">Session duration and frequency</li>
      </ul>

      <h3 className="text-base font-medium text-foreground mt-6 mb-3">Device Information</h3>
      <ul className="list-disc ml-6 space-y-2">
        <li className="text-sm text-muted-foreground">Browser type and version</li>
        <li className="text-sm text-muted-foreground">Operating system</li>
        <li className="text-sm text-muted-foreground">IP address</li>
      </ul>

      {/* 2. How We Use Information */}
      <h2 id="how-we-use-information" className="text-lg font-semibold text-foreground mt-10 mb-4">
        2. How We Use Your Information
      </h2>
      <p className="text-sm text-muted-foreground leading-relaxed">
        We use the information we collect for the following purposes:
      </p>
      <ul className="list-disc ml-6 space-y-2">
        <li className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">Provide and operate the platform</span> — deliver fleet
          management, billing, compliance, and operational features
        </li>
        <li className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">Power AI features</span> — including Sally AI assistant for
          natural language fleet queries, document intelligence for automated rate-con parsing, Shield compliance engine
          for fleet audits and scoring, and route optimization with HOS compliance
        </li>
        <li className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">Process payments</span> — handle subscription billing,
          invoicing, and settlements
        </li>
        <li className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">Communicate with you</span> — send service updates, security
          alerts, and support messages
        </li>
        <li className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">Improve the platform</span> — analyze usage patterns to enhance
          features and fix issues
        </li>
        <li className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">Comply with legal obligations</span> — fulfill regulatory
          requirements and respond to lawful requests
        </li>
      </ul>

      {/* 3. Information Sharing */}
      <h2 id="information-sharing" className="text-lg font-semibold text-foreground mt-10 mb-4">
        3. Information Sharing
      </h2>
      <p className="text-sm text-muted-foreground leading-relaxed">
        We do not sell your personal information. We may share your information with the following categories of third
        parties, solely for the purposes described:
      </p>
      <ul className="list-disc ml-6 space-y-2">
        <li className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">Service providers</span> — AWS for cloud hosting and
          infrastructure, Firebase for authentication services
        </li>
        <li className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">AI model providers</span> — OpenAI for natural language
          processing. Per our agreement, customer data is <span className="font-medium text-foreground">NOT</span> used
          for model training
        </li>
        <li className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">Payment processors</span> — to process subscription payments and
          invoices
        </li>
        <li className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">Analytics providers</span> — only with your consent, to help us
          understand platform usage
        </li>
        <li className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">Integration partners</span> — Samsara, QuickBooks, and other
          services only when you explicitly connect them to your account
        </li>
        <li className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">Legal obligations</span> — when required by law, regulation, or
          valid legal process
        </li>
        <li className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">Business transfers</span> — in connection with a merger,
          acquisition, or sale of assets, with notice to affected users
        </li>
      </ul>

      {/* 4. Data Retention */}
      <h2 id="data-retention" className="text-lg font-semibold text-foreground mt-10 mb-4">
        4. Data Retention
      </h2>
      <ul className="list-disc ml-6 space-y-2">
        <li className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">Active accounts</span> — your data is retained for as long as
          your account is active and the Service is in use
        </li>
        <li className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">AI conversation logs</span> — retained for 90 days, then
          automatically deleted
        </li>
        <li className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">Uploaded documents</span> — retained while your account is
          active
        </li>
        <li className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">After account deletion</span> — data is purged within 30 days of
          deletion, except where a legal hold requires longer retention
        </li>
        <li className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">Backups</span> — purged within 90 days of account deletion
        </li>
      </ul>

      {/* 5. Data Security */}
      <h2 id="data-security" className="text-lg font-semibold text-foreground mt-10 mb-4">
        5. Data Security
      </h2>
      <p className="text-sm text-muted-foreground leading-relaxed">
        We implement industry-standard security measures to protect your data:
      </p>
      <ul className="list-disc ml-6 space-y-2">
        <li className="text-sm text-muted-foreground">AES-256 encryption at rest</li>
        <li className="text-sm text-muted-foreground">TLS 1.3 encryption in transit</li>
        <li className="text-sm text-muted-foreground">
          Firebase Authentication with one-time password (OTP) verification
        </li>
        <li className="text-sm text-muted-foreground">Role-based access control (RBAC)</li>
        <li className="text-sm text-muted-foreground">
          Multi-tenant data isolation — your data is never accessible by other organizations
        </li>
        <li className="text-sm text-muted-foreground">Regular security audits</li>
        <li className="text-sm text-muted-foreground">SOC 2 Type II certification (in progress)</li>
      </ul>
      <p className="text-sm text-muted-foreground leading-relaxed mt-4">
        For full details on our security practices, please visit our{' '}
        <Link href="/legal/security" className="text-foreground underline underline-offset-2">
          Security page
        </Link>
        .
      </p>

      {/* 6. CCPA */}
      <h2 id="ccpa" className="text-lg font-semibold text-foreground mt-10 mb-4">
        6. California Consumer Privacy Act (CCPA)
      </h2>
      <p className="text-sm text-muted-foreground leading-relaxed">
        If you are a California resident, you have the following rights under the California Consumer Privacy Act:
      </p>
      <ul className="list-disc ml-6 space-y-2">
        <li className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">Right to know</span> — you may request information about what
          personal data we collect, the purposes for collection, and the categories of third parties with whom we share
          it
        </li>
        <li className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">Right to delete</span> — you may request that we delete the
          personal data we have collected about you
        </li>
        <li className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">Right to opt-out of sale</span> — SALLY does{' '}
          <span className="font-medium text-foreground">NOT</span> sell personal information. We share data only with
          service providers for the purpose of operating the platform
        </li>
        <li className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">Right to non-discrimination</span> — we will not treat you
          differently for exercising any of your CCPA rights
        </li>
      </ul>

      <h3 className="text-base font-medium text-foreground mt-6 mb-3">How to Exercise Your Rights</h3>
      <p className="text-sm text-muted-foreground leading-relaxed">
        To exercise any of these rights, contact us at{' '}
        <a href={mailto('legal')} className="text-foreground underline underline-offset-2">
          {CONTACTS.legal}
        </a>
        . We will verify your identity using the email address associated with your account. If you wish to use an
        authorized agent, please submit proof of authorization along with your request. We will respond to verified
        requests within 45 days.
      </p>

      {/* 7. State Privacy Rights */}
      <h2 id="state-privacy-rights" className="text-lg font-semibold text-foreground mt-10 mb-4">
        7. State Privacy Rights
      </h2>
      <p className="text-sm text-muted-foreground leading-relaxed">
        In addition to California, residents of the following states have similar privacy rights under their respective
        laws:
      </p>
      <ul className="list-disc ml-6 space-y-2">
        <li className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">Virginia</span> — Virginia Consumer Data Protection Act (VCDPA)
        </li>
        <li className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">Colorado</span> — Colorado Privacy Act (CPA)
        </li>
        <li className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">Connecticut</span> — Connecticut Data Privacy Act (CTDPA)
        </li>
      </ul>
      <p className="text-sm text-muted-foreground leading-relaxed mt-4">
        These laws generally provide rights to access, delete, and correct your personal data, as well as the right to
        opt out of certain data processing activities. To exercise your rights under any of these laws, please contact
        us at{' '}
        <a href={mailto('legal')} className="text-foreground underline underline-offset-2">
          {CONTACTS.legal}
        </a>
        .
      </p>

      {/* 8. Children's Privacy */}
      <h2 id="childrens-privacy" className="text-lg font-semibold text-foreground mt-10 mb-4">
        8. Children&apos;s Privacy
      </h2>
      <p className="text-sm text-muted-foreground leading-relaxed">
        SALLY is not directed at children under the age of 13. We do not knowingly collect personal information from
        children under 13. If we become aware that we have inadvertently collected data from a child under 13, we will
        take steps to delete it promptly. If you believe a child has provided us with personal information, please
        contact us at{' '}
        <a href={mailto('legal')} className="text-foreground underline underline-offset-2">
          {CONTACTS.legal}
        </a>
        . SALLY complies with the Children&apos;s Online Privacy Protection Act (COPPA).
      </p>

      {/* 9. International Transfers */}
      <h2 id="international-transfers" className="text-lg font-semibold text-foreground mt-10 mb-4">
        9. International Data Transfers
      </h2>
      <p className="text-sm text-muted-foreground leading-relaxed">
        Your data is processed and stored in the United States using Amazon Web Services (AWS) US regions. By using
        SALLY, you consent to the transfer of your information to the United States. We take appropriate measures to
        ensure that your data is treated securely and in accordance with this Privacy Policy regardless of where it is
        processed.
      </p>

      {/* 10. Changes */}
      <h2 id="changes" className="text-lg font-semibold text-foreground mt-10 mb-4">
        10. Changes to This Policy
      </h2>
      <p className="text-sm text-muted-foreground leading-relaxed">
        We may update this Privacy Policy from time to time to reflect changes in our practices or applicable law. If we
        make material changes, we will notify you by email or through an in-app notification. Your continued use of
        SALLY after such notice constitutes your acceptance of the updated policy.
      </p>

      {/* 11. Contact */}
      <h2 id="contact" className="text-lg font-semibold text-foreground mt-10 mb-4">
        11. Contact Us
      </h2>
      <p className="text-sm text-muted-foreground leading-relaxed">
        If you have any questions or concerns about this Privacy Policy or our data practices, please contact us:
      </p>
      <ul className="list-disc ml-6 space-y-2">
        <li className="text-sm text-muted-foreground">
          Privacy inquiries:{' '}
          <a href={mailto('legal')} className="text-foreground underline underline-offset-2">
            {CONTACTS.legal}
          </a>
        </li>
        <li className="text-sm text-muted-foreground">Mailing address: [Company Address — to be updated]</li>
        <li className="text-sm text-muted-foreground">
          Data Protection contact:{' '}
          <a href={mailto('legal')} className="text-foreground underline underline-offset-2">
            {CONTACTS.legal}
          </a>
        </li>
      </ul>
    </div>
  );
}
