import type { Metadata } from 'next';
import { CONTACTS, mailto } from '@/shared/lib/contacts';
import { AttorneyReviewBanner } from '../components/AttorneyReviewBanner';
import { LEGAL_LAST_UPDATED } from '../constants';

export const metadata: Metadata = {
  title: 'Data Processing Agreement | SALLY',
};

export default function DataProcessingAgreementPage() {
  return (
    <div className="space-y-6">
      <AttorneyReviewBanner />

      <p className="text-xs text-muted-foreground">Last updated {LEGAL_LAST_UPDATED}</p>

      <h1 className="text-2xl md:text-3xl font-bold text-foreground">Data Processing Agreement</h1>

      <p className="text-sm text-muted-foreground leading-relaxed">
        This Data Processing Agreement (&quot;DPA&quot;) forms part of the agreement between you (&quot;Customer&quot;
        or &quot;Controller&quot;) and SALLY (&quot;we&quot;, &quot;us&quot;, or &quot;Processor&quot;) for the use of
        the SALLY platform. This DPA governs the processing of personal data by SALLY on behalf of the Customer.
      </p>

      {/* 1. Definitions */}
      <h2 id="definitions" className="text-lg font-semibold text-foreground mt-10 mb-4">
        1. Definitions
      </h2>
      <ul className="list-disc ml-6 space-y-2">
        <li className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">Controller</span> — the Customer, who determines the purposes
          and means of processing personal data
        </li>
        <li className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">Processor</span> — SALLY, which processes personal data on
          behalf of the Controller
        </li>
        <li className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">Data Subject</span> — an identified or identifiable natural
          person whose personal data is processed
        </li>
        <li className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">Personal Data</span> — any information relating to a Data
          Subject that is processed through the SALLY platform
        </li>
        <li className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">Processing</span> — any operation performed on personal data,
          including collection, storage, use, disclosure, and deletion
        </li>
        <li className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">Sub-processor</span> — a third party engaged by SALLY to process
          personal data on behalf of the Controller
        </li>
      </ul>

      {/* 2. Scope */}
      <h2 id="scope" className="text-lg font-semibold text-foreground mt-10 mb-4">
        2. Scope
      </h2>
      <p className="text-sm text-muted-foreground leading-relaxed">
        SALLY processes Customer Data as Processor on behalf of the Customer (Controller). This DPA applies to all
        personal data processed by SALLY in connection with the platform, including fleet management, billing,
        compliance, AI features, and any integrations enabled by the Customer.
      </p>

      {/* 3. Processor Obligations */}
      <h2 id="processor-obligations" className="text-lg font-semibold text-foreground mt-10 mb-4">
        3. Processor Obligations
      </h2>
      <p className="text-sm text-muted-foreground leading-relaxed">
        As the Processor, SALLY agrees to the following obligations:
      </p>
      <ul className="list-disc ml-6 space-y-2">
        <li className="text-sm text-muted-foreground">
          Process personal data only on documented instructions from the Controller
        </li>
        <li className="text-sm text-muted-foreground">
          Ensure that personnel authorized to process personal data have committed to confidentiality or are under an
          appropriate statutory obligation of confidentiality
        </li>
        <li className="text-sm text-muted-foreground">
          Implement appropriate technical and organizational security measures to protect personal data
        </li>
        <li className="text-sm text-muted-foreground">
          Assist the Controller in responding to data subject requests, including access, rectification, erasure, and
          portability
        </li>
        <li className="text-sm text-muted-foreground">
          Assist the Controller with breach notification obligations under applicable data protection laws
        </li>
        <li className="text-sm text-muted-foreground">
          Delete or return all personal data to the Controller upon termination of the service agreement, at the
          Controller&apos;s election
        </li>
      </ul>

      {/* 4. Sub-processors */}
      <h2 id="sub-processors" className="text-lg font-semibold text-foreground mt-10 mb-4">
        4. Sub-processors
      </h2>
      <p className="text-sm text-muted-foreground leading-relaxed">
        SALLY uses the following sub-processors to deliver the platform:
      </p>
      <ul className="list-disc ml-6 space-y-2">
        <li className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">AWS</span> — cloud infrastructure, US regions
        </li>
        <li className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">Firebase / Google</span> — authentication services
        </li>
        <li className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">OpenAI</span> — AI processing (no model training on customer
          data)
        </li>
        <li className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">Samsara</span> — telematics (only if integration enabled by
          Customer)
        </li>
        <li className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">QuickBooks / Intuit</span> — accounting (only if integration
          enabled by Customer)
        </li>
      </ul>
      <p className="text-sm text-muted-foreground leading-relaxed mt-4">
        SALLY will provide the Customer with 30 days&apos; written notice before adding any new sub-processor. The
        Customer may object to the addition of a new sub-processor within 14 days of receiving such notice.
      </p>

      {/* 5. Data Security */}
      <h2 id="data-security" className="text-lg font-semibold text-foreground mt-10 mb-4">
        5. Data Security
      </h2>
      <h3 className="text-base font-medium text-foreground mt-6 mb-3">Technical Measures</h3>
      <ul className="list-disc ml-6 space-y-2">
        <li className="text-sm text-muted-foreground">AES-256 encryption at rest</li>
        <li className="text-sm text-muted-foreground">TLS 1.3 encryption in transit</li>
        <li className="text-sm text-muted-foreground">Multi-tenant data isolation</li>
        <li className="text-sm text-muted-foreground">Access logging and monitoring</li>
        <li className="text-sm text-muted-foreground">Regular vulnerability assessments</li>
      </ul>
      <h3 className="text-base font-medium text-foreground mt-6 mb-3">Organizational Measures</h3>
      <ul className="list-disc ml-6 space-y-2">
        <li className="text-sm text-muted-foreground">Employee background checks</li>
        <li className="text-sm text-muted-foreground">Security awareness training</li>
        <li className="text-sm text-muted-foreground">Access on a need-to-know basis</li>
        <li className="text-sm text-muted-foreground">Incident response procedures</li>
      </ul>

      {/* 6. Breach Notification */}
      <h2 id="breach-notification" className="text-lg font-semibold text-foreground mt-10 mb-4">
        6. Breach Notification
      </h2>
      <p className="text-sm text-muted-foreground leading-relaxed">
        SALLY will notify the Customer within 72 hours of becoming aware of a personal data breach. The notification
        will include:
      </p>
      <ul className="list-disc ml-6 space-y-2">
        <li className="text-sm text-muted-foreground">The nature of the breach</li>
        <li className="text-sm text-muted-foreground">
          The categories and approximate number of data subjects affected
        </li>
        <li className="text-sm text-muted-foreground">The likely consequences of the breach</li>
        <li className="text-sm text-muted-foreground">The remedial measures taken or proposed to address the breach</li>
      </ul>

      {/* 7. Data Subject Rights */}
      <h2 id="data-subject-rights" className="text-lg font-semibold text-foreground mt-10 mb-4">
        7. Data Subject Rights
      </h2>
      <p className="text-sm text-muted-foreground leading-relaxed">
        SALLY will assist the Customer in responding to data subject requests, including requests for access,
        rectification, erasure, portability, restriction, and objection. SALLY will notify the Customer of any data
        subject request received directly. Response support will be provided within 5 business days.
      </p>

      {/* 8. International Transfers */}
      <h2 id="international-transfers" className="text-lg font-semibold text-foreground mt-10 mb-4">
        8. International Transfers
      </h2>
      <p className="text-sm text-muted-foreground leading-relaxed">
        Data is processed in the United States. Standard Contractual Clauses (SCCs) are available upon request for
        international data transfers. SALLY will cooperate with the Customer on supplementary measures as needed to
        ensure adequate protection of personal data during cross-border transfers.
      </p>

      {/* 9. Audits */}
      <h2 id="audits" className="text-lg font-semibold text-foreground mt-10 mb-4">
        9. Audits
      </h2>
      <p className="text-sm text-muted-foreground leading-relaxed">
        The Customer may audit SALLY&apos;s compliance with this DPA once per year with 30 days&apos; written notice.
        Audits will be conducted during normal business hours and at the Customer&apos;s expense. SALLY may provide SOC
        2 reports in lieu of on-site audits where such reports reasonably address the Customer&apos;s audit
        requirements.
      </p>

      {/* 10. Termination */}
      <h2 id="termination" className="text-lg font-semibold text-foreground mt-10 mb-4">
        10. Termination
      </h2>
      <p className="text-sm text-muted-foreground leading-relaxed">
        On termination of the service agreement, SALLY will delete or return all personal data within 30 days at the
        Customer&apos;s election. SALLY may retain data as required by applicable law, in which case the data will
        remain subject to the protections of this DPA.
      </p>

      {/* Contact */}
      <h2 id="contact" className="text-lg font-semibold text-foreground mt-10 mb-4">
        11. Contact
      </h2>
      <p className="text-sm text-muted-foreground leading-relaxed">
        For questions about this Data Processing Agreement, please contact us at{' '}
        <a href={mailto('legal')} className="text-foreground underline underline-offset-2">
          {CONTACTS.legal}
        </a>
        .
      </p>
    </div>
  );
}
