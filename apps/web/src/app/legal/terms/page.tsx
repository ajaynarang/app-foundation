import type { Metadata } from 'next';
import Link from 'next/link';
import { CONTACTS, mailto } from '@/shared/lib/contacts';
import { AttorneyReviewBanner } from '../components/AttorneyReviewBanner';
import { LEGAL_LAST_UPDATED } from '../constants';

export const metadata: Metadata = {
  title: 'Terms of Service | SALLY',
};

export default function TermsOfServicePage() {
  return (
    <div className="space-y-6">
      <AttorneyReviewBanner />

      <p className="text-xs text-muted-foreground">Last updated {LEGAL_LAST_UPDATED}</p>

      <h1 className="text-2xl md:text-3xl font-bold text-foreground">Terms of Service</h1>

      <p className="text-sm text-muted-foreground leading-relaxed">
        These Terms of Service (&quot;Terms&quot;) govern your access to and use of the SALLY platform, including all
        associated services, features, and applications (collectively, the &quot;Service&quot;). By accessing or using
        the Service, you agree to be bound by these Terms.
      </p>

      {/* 1. Acceptance */}
      <h2 id="acceptance" className="text-lg font-semibold text-foreground mt-10 mb-4">
        1. Acceptance of Terms
      </h2>
      <p className="text-sm text-muted-foreground leading-relaxed">
        By accessing or using SALLY, you agree to be bound by these Terms and our{' '}
        <Link href="/legal/privacy" className="text-foreground underline underline-offset-2">
          Privacy Policy
        </Link>
        . You must be at least 18 years of age to use the Service. If you are using SALLY on behalf of an organization,
        you represent and warrant that you have the authority to bind that organization to these Terms, and
        &quot;you&quot; refers to both you individually and the organization.
      </p>

      {/* 2. Account Terms */}
      <h2 id="account-terms" className="text-lg font-semibold text-foreground mt-10 mb-4">
        2. Account Terms
      </h2>
      <ul className="list-disc ml-6 space-y-2">
        <li className="text-sm text-muted-foreground">
          You must provide accurate and complete registration information
        </li>
        <li className="text-sm text-muted-foreground">
          You are responsible for keeping your login credentials secure and confidential
        </li>
        <li className="text-sm text-muted-foreground">Each person may maintain only one account</li>
        <li className="text-sm text-muted-foreground">
          You are responsible for all activity that occurs under your account, whether or not you authorized it
        </li>
        <li className="text-sm text-muted-foreground">
          You must notify us immediately at{' '}
          <a href={mailto('sallySupport')} className="text-foreground underline underline-offset-2">
            {CONTACTS.sallySupport}
          </a>{' '}
          if you suspect unauthorized access to your account
        </li>
      </ul>

      {/* 3. Service Description */}
      <h2 id="service-description" className="text-lg font-semibold text-foreground mt-10 mb-4">
        3. Service Description
      </h2>
      <p className="text-sm text-muted-foreground leading-relaxed">
        SALLY is an AI-native fleet operations platform that provides the following capabilities:
      </p>
      <ul className="list-disc ml-6 space-y-2">
        <li className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">Fleet management</span> — drivers, vehicles, loads, and customer
          relationship management
        </li>
        <li className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">AI assistant</span> — Sally AI with natural language fleet
          queries and voice input
        </li>
        <li className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">Document intelligence</span> — automated rate-con parsing and
          data extraction
        </li>
        <li className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">Compliance monitoring</span> — Shield compliance engine for
          automated fleet audits
        </li>
        <li className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">Route planning</span> — HOS-aware route optimization with fuel
          and rest stop recommendations
        </li>
        <li className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">Billing and settlements</span> — invoicing, payments, driver
          settlements, and close-out
        </li>
        <li className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">Integrations</span> — connections with third-party services such
          as Samsara and QuickBooks
        </li>
      </ul>

      {/* 4. Acceptable Use */}
      <h2 id="acceptable-use" className="text-lg font-semibold text-foreground mt-10 mb-4">
        4. Acceptable Use
      </h2>
      <p className="text-sm text-muted-foreground leading-relaxed">
        Your use of SALLY is subject to our{' '}
        <Link href="/legal/acceptable-use" className="text-foreground underline underline-offset-2">
          Acceptable Use Policy
        </Link>
        , which is incorporated into these Terms by reference. In summary, you agree not to: abuse AI features, scrape
        or automatically extract data, reverse engineer the platform, share credentials, or use the Service for any
        unlawful purpose.
      </p>

      {/* 5. Intellectual Property */}
      <h2 id="intellectual-property" className="text-lg font-semibold text-foreground mt-10 mb-4">
        5. Intellectual Property
      </h2>
      <p className="text-sm text-muted-foreground leading-relaxed">
        SALLY and its original content, features, and functionality are owned by SALLY and are protected by
        international copyright, trademark, patent, trade secret, and other intellectual property laws. You retain all
        rights to the data you upload to the platform. Subject to these Terms, we grant you a limited, non-exclusive,
        non-transferable, non-sublicensable license to access and use the Service during the term of your subscription.
      </p>

      {/* 6. Payment Terms */}
      <h2 id="payment-terms" className="text-lg font-semibold text-foreground mt-10 mb-4">
        6. Payment Terms
      </h2>
      <ul className="list-disc ml-6 space-y-2">
        <li className="text-sm text-muted-foreground">
          SALLY operates on a per-truck monthly or annual subscription basis
        </li>
        <li className="text-sm text-muted-foreground">
          Payment is accepted via credit card or invoice (enterprise customers)
        </li>
        <li className="text-sm text-muted-foreground">Fees are due at the start of each billing period</li>
        <li className="text-sm text-muted-foreground">
          Late payments may result in access suspension after 15 days past due
        </li>
        <li className="text-sm text-muted-foreground">
          Price changes will be communicated with at least 30 days&apos; notice
        </li>
        <li className="text-sm text-muted-foreground">All fees are denominated in USD</li>
      </ul>

      {/* 7. Data Ownership */}
      <h2 id="data-ownership" className="text-lg font-semibold text-foreground mt-10 mb-4">
        7. Data Ownership
      </h2>
      <p className="text-sm text-muted-foreground leading-relaxed">
        Your data is yours. You retain all ownership rights to the data you upload, create, or transmit through SALLY.
        By using the Service, you grant SALLY a limited license to process your data solely for the purpose of providing
        and improving the Service. We do not sell your data. For more details, see our{' '}
        <Link href="/legal/privacy" className="text-foreground underline underline-offset-2">
          Privacy Policy
        </Link>
        .
      </p>

      {/* 8. Termination */}
      <h2 id="termination" className="text-lg font-semibold text-foreground mt-10 mb-4">
        8. Termination
      </h2>
      <ul className="list-disc ml-6 space-y-2">
        <li className="text-sm text-muted-foreground">
          Either party may terminate the agreement with 30 days&apos; written notice
        </li>
        <li className="text-sm text-muted-foreground">
          SALLY may terminate your account immediately for violations of the{' '}
          <Link href="/legal/acceptable-use" className="text-foreground underline underline-offset-2">
            Acceptable Use Policy
          </Link>
        </li>
        <li className="text-sm text-muted-foreground">
          Upon termination, you will have a 30-day window to export your data, after which it will be permanently
          deleted
        </li>
        <li className="text-sm text-muted-foreground">
          Obligations that survive termination include payment for usage during the active period and confidentiality
          obligations
        </li>
      </ul>

      {/* 9. Disclaimers */}
      <h2 id="disclaimers" className="text-lg font-semibold text-foreground mt-10 mb-4">
        9. Disclaimers
      </h2>
      <p className="text-sm text-muted-foreground leading-relaxed">
        THE SERVICE IS PROVIDED &quot;AS IS&quot; AND &quot;AS AVAILABLE&quot; WITHOUT WARRANTIES OF ANY KIND, EITHER
        EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO IMPLIED WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR
        PURPOSE, AND NON-INFRINGEMENT.
      </p>
      <ul className="list-disc ml-6 space-y-2 mt-4">
        <li className="text-sm text-muted-foreground">
          We do not warrant that the Service will be uninterrupted, error-free, or secure
        </li>
        <li className="text-sm text-muted-foreground">
          AI features provide recommendations and suggestions, not guarantees of accuracy or outcomes
        </li>
        <li className="text-sm text-muted-foreground">
          SALLY is{' '}
          <span className="font-medium text-foreground">
            NOT a substitute for professional compliance, legal, or safety advice
          </span>
        </li>
        <li className="text-sm text-muted-foreground">
          Route suggestions and compliance analysis should be verified by qualified personnel
        </li>
      </ul>

      {/* 10. Limitation of Liability */}
      <h2 id="limitation-of-liability" className="text-lg font-semibold text-foreground mt-10 mb-4">
        10. Limitation of Liability
      </h2>
      <p className="text-sm text-muted-foreground leading-relaxed">
        TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, SALLY&apos;S TOTAL AGGREGATE LIABILITY ARISING OUT OF OR
        RELATED TO THESE TERMS SHALL NOT EXCEED THE TOTAL FEES PAID BY YOU IN THE TWELVE (12) MONTHS PRECEDING THE
        CLAIM. IN NO EVENT SHALL SALLY BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE
        DAMAGES, INCLUDING BUT NOT LIMITED TO LOSS OF PROFITS, DATA, OR BUSINESS OPPORTUNITIES. SOME JURISDICTIONS DO
        NOT ALLOW THE LIMITATION OR EXCLUSION OF LIABILITY — IN SUCH CASES, THIS LIMITATION SHALL APPLY TO THE FULLEST
        EXTENT PERMITTED BY LAW.
      </p>

      {/* 11. Indemnification */}
      <h2 id="indemnification" className="text-lg font-semibold text-foreground mt-10 mb-4">
        11. Indemnification
      </h2>
      <p className="text-sm text-muted-foreground leading-relaxed">
        You agree to indemnify, defend, and hold harmless SALLY, its officers, directors, employees, and agents from and
        against any claims, liabilities, damages, losses, and expenses (including reasonable attorneys&apos; fees)
        arising out of or in any way connected with your misuse of the Service, violation of the Acceptable Use Policy,
        or any third-party claims arising from data you upload or transmit through the platform.
      </p>
      <p className="text-sm text-muted-foreground leading-relaxed mt-4">
        SALLY agrees to indemnify you against third-party claims alleging that the Service infringes any intellectual
        property rights, provided you promptly notify us and cooperate in the defense.
      </p>

      {/* 12. Governing Law */}
      <h2 id="governing-law" className="text-lg font-semibold text-foreground mt-10 mb-4">
        12. Governing Law
      </h2>
      <p className="text-sm text-muted-foreground leading-relaxed">
        These Terms shall be governed by and construed in accordance with the laws of the State of Delaware, USA,
        without regard to its conflict of law provisions. You agree to submit to the exclusive jurisdiction of the
        federal and state courts located in the State of Delaware for the resolution of any disputes arising under these
        Terms.
      </p>

      {/* 13. Dispute Resolution */}
      <h2 id="dispute-resolution" className="text-lg font-semibold text-foreground mt-10 mb-4">
        13. Dispute Resolution
      </h2>
      <p className="text-sm text-muted-foreground leading-relaxed">
        In the event of a dispute, the parties agree to first attempt resolution through good faith negotiation for a
        period of 30 days. If the dispute is not resolved through negotiation, it shall be submitted to binding
        arbitration administered under the American Arbitration Association (AAA) Commercial Arbitration Rules.
      </p>
      <ul className="list-disc ml-6 space-y-2 mt-4">
        <li className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">Class action waiver</span> — you agree to resolve disputes on an
          individual basis and waive any right to participate in class action lawsuits or class-wide arbitration
        </li>
        <li className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">Small claims exception</span> — either party may bring an
          individual action in small claims court if the claim qualifies
        </li>
      </ul>

      {/* 14. Changes */}
      <h2 id="changes" className="text-lg font-semibold text-foreground mt-10 mb-4">
        14. Changes to These Terms
      </h2>
      <p className="text-sm text-muted-foreground leading-relaxed">
        We may update these Terms from time to time. For material changes, we will provide at least 30 days&apos; notice
        via email. Your continued use of SALLY after the notice period constitutes acceptance of the updated Terms. If
        you do not agree to the revised Terms, you must stop using the Service before they take effect.
      </p>

      {/* 15. Contact */}
      <h2 id="contact" className="text-lg font-semibold text-foreground mt-10 mb-4">
        15. Contact
      </h2>
      <p className="text-sm text-muted-foreground leading-relaxed">
        If you have any questions about these Terms, please contact us at{' '}
        <a href={mailto('legal')} className="text-foreground underline underline-offset-2">
          {CONTACTS.legal}
        </a>
        .
      </p>
    </div>
  );
}
