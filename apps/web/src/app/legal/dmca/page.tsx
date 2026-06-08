import type { Metadata } from 'next';
import { CONTACTS, mailto } from '@/shared/lib/contacts';
import { AttorneyReviewBanner } from '../components/AttorneyReviewBanner';
import { LEGAL_LAST_UPDATED } from '../constants';

export const metadata: Metadata = {
  title: 'DMCA Copyright Policy | SALLY',
};

export default function DmcaPage() {
  return (
    <div className="space-y-6">
      <AttorneyReviewBanner />

      <p className="text-xs text-muted-foreground">Last updated {LEGAL_LAST_UPDATED}</p>

      <h1 className="text-2xl md:text-3xl font-bold text-foreground">DMCA Copyright Policy</h1>

      <p className="text-sm text-muted-foreground leading-relaxed">
        SALLY (&quot;we&quot;, &quot;us&quot;) respects the intellectual property rights of others and expects our users
        to do the same. In accordance with the Digital Millennium Copyright Act (DMCA), we will respond to notices of
        alleged copyright infringement that comply with applicable law.
      </p>

      {/* 1. Reporting Infringement */}
      <h2 id="reporting-infringement" className="text-lg font-semibold text-foreground mt-10 mb-4">
        1. Reporting Infringement
      </h2>
      <p className="text-sm text-muted-foreground leading-relaxed">
        If you believe content on SALLY infringes your copyright, please send a DMCA takedown notice to{' '}
        <a href={mailto('legal')} className="text-foreground underline underline-offset-2">
          {CONTACTS.legal}
        </a>{' '}
        including the following:
      </p>
      <ul className="list-disc ml-6 space-y-2">
        <li className="text-sm text-muted-foreground">
          Identification of the copyrighted work claimed to have been infringed
        </li>
        <li className="text-sm text-muted-foreground">
          Identification of the infringing material (with URL or description sufficient for us to locate it)
        </li>
        <li className="text-sm text-muted-foreground">
          Your contact information (name, address, phone number, email address)
        </li>
        <li className="text-sm text-muted-foreground">
          A statement that you have a good faith belief that use of the material is not authorized by the copyright
          owner, its agent, or the law
        </li>
        <li className="text-sm text-muted-foreground">
          A statement that the information in the notice is accurate, under penalty of perjury
        </li>
        <li className="text-sm text-muted-foreground">Your physical or electronic signature</li>
      </ul>

      {/* 2. Counter-Notification */}
      <h2 id="counter-notification" className="text-lg font-semibold text-foreground mt-10 mb-4">
        2. Counter-Notification
      </h2>
      <p className="text-sm text-muted-foreground leading-relaxed">
        If you believe material was removed in error, you may file a counter-notification to{' '}
        <a href={mailto('legal')} className="text-foreground underline underline-offset-2">
          {CONTACTS.legal}
        </a>{' '}
        including the following:
      </p>
      <ul className="list-disc ml-6 space-y-2">
        <li className="text-sm text-muted-foreground">
          Identification of the material that was removed and the location where it appeared before removal
        </li>
        <li className="text-sm text-muted-foreground">
          A statement under penalty of perjury that you have a good faith belief that the material was removed or
          disabled as a result of mistake or misidentification
        </li>
        <li className="text-sm text-muted-foreground">Your name, address, and telephone number</li>
        <li className="text-sm text-muted-foreground">
          Consent to the jurisdiction of the federal court in the District of Delaware
        </li>
        <li className="text-sm text-muted-foreground">Your physical or electronic signature</li>
      </ul>

      {/* 3. Repeat Infringer Policy */}
      <h2 id="repeat-infringer-policy" className="text-lg font-semibold text-foreground mt-10 mb-4">
        3. Repeat Infringer Policy
      </h2>
      <p className="text-sm text-muted-foreground leading-relaxed">
        SALLY will terminate the accounts of users who are repeat copyright infringers. We maintain records of takedown
        notices and counter-notifications to identify and take action against repeat infringers.
      </p>

      {/* 4. Designated Agent */}
      <h2 id="designated-agent" className="text-lg font-semibold text-foreground mt-10 mb-4">
        4. Designated Agent
      </h2>
      <p className="text-sm text-muted-foreground leading-relaxed">DMCA Designated Agent:</p>
      <ul className="list-disc ml-6 space-y-2">
        <li className="text-sm text-muted-foreground">Name: [Name to be designated]</li>
        <li className="text-sm text-muted-foreground">SALLY, [Address to be updated]</li>
        <li className="text-sm text-muted-foreground">
          Email:{' '}
          <a href={mailto('legal')} className="text-foreground underline underline-offset-2">
            {CONTACTS.legal}
          </a>
        </li>
      </ul>
      <p className="text-sm text-muted-foreground leading-relaxed mt-4">
        Note: Registration with the US Copyright Office is required for the designated agent.
      </p>
    </div>
  );
}
