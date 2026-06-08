import type { Metadata } from 'next';
import { CONTACTS, mailto } from '@/shared/lib/contacts';
import { AttorneyReviewBanner } from '../components/AttorneyReviewBanner';
import { LEGAL_LAST_UPDATED } from '../constants';

export const metadata: Metadata = {
  title: 'Service Level Agreement | SALLY',
};

export default function ServiceLevelAgreementPage() {
  return (
    <div className="space-y-6">
      <AttorneyReviewBanner />

      <p className="text-xs text-muted-foreground">Last updated {LEGAL_LAST_UPDATED}</p>

      <h1 className="text-2xl md:text-3xl font-bold text-foreground">Service Level Agreement</h1>

      <p className="text-sm text-muted-foreground leading-relaxed">
        This Service Level Agreement (&quot;SLA&quot;) describes the uptime commitments, support tiers, and service
        credit policies for the SALLY platform. This SLA is part of the agreement between you (&quot;Customer&quot;) and
        SALLY (&quot;we&quot;, &quot;us&quot;).
      </p>

      {/* 1. Uptime Commitment */}
      <h2 id="uptime-commitment" className="text-lg font-semibold text-foreground mt-10 mb-4">
        1. Uptime Commitment
      </h2>
      <p className="text-sm text-muted-foreground leading-relaxed">
        SALLY commits to the following monthly uptime targets based on your subscription plan:
      </p>
      <ul className="list-disc ml-6 space-y-2">
        <li className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">Starter plan</span> — 99.5% monthly uptime
        </li>
        <li className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">Professional plan</span> — 99.9% monthly uptime
        </li>
        <li className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">Enterprise plan</span> — 99.9% monthly uptime with enhanced
          support
        </li>
      </ul>

      {/* 2. Measurement */}
      <h2 id="measurement" className="text-lg font-semibold text-foreground mt-10 mb-4">
        2. Measurement
      </h2>
      <p className="text-sm text-muted-foreground leading-relaxed">
        Uptime is calculated as: (Total Minutes in Month - Downtime Minutes) / Total Minutes in Month x 100. Downtime is
        defined as any period when the SALLY platform is materially unavailable, excluding the exclusions listed below.
        Uptime is measured via synthetic monitoring of core API endpoints.
      </p>

      {/* 3. Exclusions */}
      <h2 id="exclusions" className="text-lg font-semibold text-foreground mt-10 mb-4">
        3. Exclusions
      </h2>
      <p className="text-sm text-muted-foreground leading-relaxed">
        The following are not counted as downtime for the purposes of this SLA:
      </p>
      <ul className="list-disc ml-6 space-y-2">
        <li className="text-sm text-muted-foreground">Scheduled maintenance (announced minimum 48 hours in advance)</li>
        <li className="text-sm text-muted-foreground">Force majeure events</li>
        <li className="text-sm text-muted-foreground">Issues caused by Customer&apos;s equipment or networks</li>
        <li className="text-sm text-muted-foreground">
          Third-party service outages (Samsara, QuickBooks, Firebase, OpenAI)
        </li>
        <li className="text-sm text-muted-foreground">Features in beta or preview</li>
        <li className="text-sm text-muted-foreground">Customer exceeding usage limits</li>
      </ul>

      {/* 4. Service Credits */}
      <h2 id="service-credits" className="text-lg font-semibold text-foreground mt-10 mb-4">
        4. Service Credits
      </h2>
      <p className="text-sm text-muted-foreground leading-relaxed">
        If SALLY fails to meet the uptime commitment for your plan, you may be eligible for service credits:
      </p>
      <ul className="list-disc ml-6 space-y-2">
        <li className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">Below commitment but above 99.0%</span> — 10% credit of monthly
          fees
        </li>
        <li className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">Below 99.0% but above 98.0%</span> — 25% credit of monthly fees
        </li>
        <li className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">Below 98.0%</span> — 50% credit of monthly fees
        </li>
      </ul>
      <p className="text-sm text-muted-foreground leading-relaxed mt-4">
        Maximum credit: 50% of monthly fees. Credits must be requested within 30 days of the incident. Credits are
        applied to the next billing cycle and are not refundable as cash.
      </p>

      {/* 5. Support Tiers */}
      <h2 id="support-tiers" className="text-lg font-semibold text-foreground mt-10 mb-4">
        5. Support Tiers
      </h2>
      <ul className="list-disc ml-6 space-y-2">
        <li className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">Starter</span> — email support, initial response within 24
          business hours
        </li>
        <li className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">Professional</span> — email and in-app chat support, initial
          response within 4 business hours, severity-1 (platform down) response within 1 hour
        </li>
        <li className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">Enterprise</span> — dedicated support, initial response within 1
          hour, named account manager, custom escalation procedures, quarterly business reviews
        </li>
      </ul>

      {/* 6. Maintenance Windows */}
      <h2 id="maintenance-windows" className="text-lg font-semibold text-foreground mt-10 mb-4">
        6. Maintenance Windows
      </h2>
      <ul className="list-disc ml-6 space-y-2">
        <li className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">Scheduled maintenance</span> — Sundays 2:00–6:00 AM ET
        </li>
        <li className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">Emergency maintenance</span> — as needed with best-effort
          advance notice
        </li>
        <li className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">Maintenance notifications</span> — via email and in-app banner
        </li>
      </ul>

      {/* 7. Monitoring */}
      <h2 id="monitoring" className="text-lg font-semibold text-foreground mt-10 mb-4">
        7. Monitoring
      </h2>
      <ul className="list-disc ml-6 space-y-2">
        <li className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">Status page</span> — [Status page URL to be configured]
        </li>
        <li className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">Incident communication</span> — email notification to account
          administrators
        </li>
        <li className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">Post-incident reports</span> — provided within 5 business days
          for severity-1 incidents
        </li>
      </ul>

      {/* 8. Contact */}
      <h2 id="contact" className="text-lg font-semibold text-foreground mt-10 mb-4">
        8. Contact
      </h2>
      <p className="text-sm text-muted-foreground leading-relaxed">
        For questions about this Service Level Agreement or to request service credits, please contact us at{' '}
        <a href={mailto('sallySupport')} className="text-foreground underline underline-offset-2">
          {CONTACTS.sallySupport}
        </a>
        .
      </p>
    </div>
  );
}
