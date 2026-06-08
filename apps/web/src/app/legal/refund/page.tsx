import type { Metadata } from 'next';
import { CONTACTS, mailto } from '@/shared/lib/contacts';
import { AttorneyReviewBanner } from '../components/AttorneyReviewBanner';
import { LEGAL_LAST_UPDATED } from '../constants';

export const metadata: Metadata = {
  title: 'Refund Policy | SALLY',
};

export default function RefundPolicyPage() {
  return (
    <div className="space-y-6">
      <AttorneyReviewBanner />

      <p className="text-xs text-muted-foreground">Last updated {LEGAL_LAST_UPDATED}</p>

      <h1 className="text-2xl md:text-3xl font-bold text-foreground">Refund Policy</h1>

      <p className="text-sm text-muted-foreground leading-relaxed">
        This Refund Policy explains how billing, cancellations, and refunds work for the SALLY platform. We want to be
        transparent about what you can expect.
      </p>

      {/* 1. Free Trial */}
      <h2 id="free-trial" className="text-lg font-semibold text-foreground mt-10 mb-4">
        1. Free Trial
      </h2>
      <ul className="list-disc ml-6 space-y-2">
        <li className="text-sm text-muted-foreground">All plans include a 30-day free trial</li>
        <li className="text-sm text-muted-foreground">No credit card required to start</li>
        <li className="text-sm text-muted-foreground">Full access to your plan&apos;s features during the trial</li>
        <li className="text-sm text-muted-foreground">Cancel anytime during the trial with no charges</li>
      </ul>

      {/* 2. Cancellation */}
      <h2 id="cancellation" className="text-lg font-semibold text-foreground mt-10 mb-4">
        2. Cancellation
      </h2>
      <ul className="list-disc ml-6 space-y-2">
        <li className="text-sm text-muted-foreground">Cancel your subscription anytime from your account settings</li>
        <li className="text-sm text-muted-foreground">Access continues until the end of your current billing period</li>
        <li className="text-sm text-muted-foreground">No cancellation fees</li>
      </ul>
      <p className="text-sm text-muted-foreground leading-relaxed mt-4">
        To cancel, go to Settings &rarr; Billing &rarr; Cancel Subscription, or email{' '}
        <a href={mailto('sallySupport')} className="text-foreground underline underline-offset-2">
          {CONTACTS.sallySupport}
        </a>
        .
      </p>

      {/* 3. Refunds */}
      <h2 id="refunds" className="text-lg font-semibold text-foreground mt-10 mb-4">
        3. Refunds
      </h2>
      <ul className="list-disc ml-6 space-y-2">
        <li className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">Monthly plans</span> — no refunds for partial months. Cancel
          before your next billing date to avoid further charges.
        </li>
        <li className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">Annual plans</span> — pro-rata refund available if cancelled
          within the first 30 days
        </li>
        <li className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">After 30 days on annual</span> — no refund, but access continues
          until the end of the annual term
        </li>
        <li className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">Enterprise contracts</span> — refund terms per individual
          agreement
        </li>
      </ul>

      {/* 4. Billing Disputes */}
      <h2 id="billing-disputes" className="text-lg font-semibold text-foreground mt-10 mb-4">
        4. Billing Disputes
      </h2>
      <p className="text-sm text-muted-foreground leading-relaxed">
        If you believe a charge is incorrect, please contact{' '}
        <a href={mailto('sallySupport')} className="text-foreground underline underline-offset-2">
          {CONTACTS.sallySupport}
        </a>{' '}
        within 60 days of the charge. Include your account email, the charge amount, and the date. We aim to resolve
        billing disputes within 10 business days.
      </p>

      {/* 5. Plan Changes */}
      <h2 id="plan-changes" className="text-lg font-semibold text-foreground mt-10 mb-4">
        5. Plan Changes
      </h2>
      <ul className="list-disc ml-6 space-y-2">
        <li className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">Upgrading</span> — takes effect immediately, with a pro-rata
          credit applied for remaining time on your current plan
        </li>
        <li className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">Downgrading</span> — takes effect at the start of your next
          billing cycle
        </li>
      </ul>
      <p className="text-sm text-muted-foreground leading-relaxed mt-4">
        Feature access adjusts according to the new plan upon the effective date of the change.
      </p>

      {/* 6. Contact */}
      <h2 id="contact" className="text-lg font-semibold text-foreground mt-10 mb-4">
        6. Contact
      </h2>
      <p className="text-sm text-muted-foreground leading-relaxed">
        For billing questions, refund requests, or disputes, please contact us at{' '}
        <a href={mailto('sallySupport')} className="text-foreground underline underline-offset-2">
          {CONTACTS.sallySupport}
        </a>
        .
      </p>
    </div>
  );
}
